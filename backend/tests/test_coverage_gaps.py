"""Coverage-gap tests: edge branches of services and endpoints.

Each test targets a specific uncovered branch (error paths, filters,
race conditions, seasonal/insurance computations) to push the backend
to ~100% on reachable code.
"""

import uuid
from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.flexfuel_conversion import FlexfuelConversion
from app.models.fuel_entry import FuelEntry
from app.models.vehicle import Vehicle

API = "/api/v1"
RID = uuid.uuid4


def _post(client, path, payload):
    resp = client.post(path, json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestVehicleEndpointGaps:
    def test_update_unknown_404(self, client):
        assert client.put(f"{API}/vehicles/99999", json={"brand": "X"}).status_code == 404

    def test_update_plate_conflict_409(self, client, created_vehicle, sample_vehicle_data):
        other = _post(client, f"{API}/vehicles/", {**sample_vehicle_data, "license_plate": "ZZ-999-ZZ"})
        resp = client.put(
            f"{API}/vehicles/{other['id']}",
            json={"license_plate": created_vehicle["license_plate"]},
        )
        assert resp.status_code == 409

    def test_update_service_value_error_422(self, client, created_vehicle, monkeypatch):
        from app.services.vehicle_service import VehicleService

        def boom(self, vehicle_id, vehicle_update):
            raise ValueError("boom")

        monkeypatch.setattr(VehicleService, "update_vehicle", boom)
        resp = client.put(f"{API}/vehicles/{created_vehicle['id']}", json={"brand": "X"})
        assert resp.status_code == 422

    def test_delete_value_error_409(self, client, created_vehicle, monkeypatch):
        from app.services.vehicle_service import VehicleService

        def boom(self, vehicle_id, force=False):
            raise ValueError("données associées")

        monkeypatch.setattr(VehicleService, "delete_vehicle", boom)
        resp = client.delete(f"{API}/vehicles/{created_vehicle['id']}")
        assert resp.status_code == 409

    def test_batch_stats_skips_failing_vehicle(self, client, created_vehicle, monkeypatch):
        from app.services.vehicle_service import VehicleService

        original = VehicleService.get_vehicle_stats

        def flaky(self, vehicle_id):
            if vehicle_id == created_vehicle["id"]:
                raise RuntimeError("boom")
            return original(self, vehicle_id)

        monkeypatch.setattr(VehicleService, "get_vehicle_stats", flaky)
        resp = client.get(f"{API}/vehicles/stats/batch")
        assert resp.status_code == 200
        assert created_vehicle["id"] not in resp.json()

    def test_period_stats_unknown_vehicle_404(self, client):
        resp = client.get(
            f"{API}/vehicles/99999/period-stats",
            params={"start_date": "2025-01-01", "end_date": "2025-12-31"},
        )
        assert resp.status_code == 404

    def test_timeline_unknown_vehicle_404(self, client):
        assert client.get(f"{API}/vehicles/99999/timeline").status_code == 404

    def test_archive_unknown_vehicle_404(self, client):
        assert client.post(f"{API}/vehicles/99999/archive").status_code == 404

    def test_delete_unknown_vehicle_returns_false(self, db):
        from app.services.vehicle_service import VehicleService

        assert VehicleService(db).delete_vehicle(99999) is False


class TestInsuranceLimit:
    """_calculate_current_insurance_limit with a fixed 'today' (2026-06-15)."""

    def _limit(self, db, monkeypatch, **fields):
        import app.services.vehicle_service as vs

        class FixedDate:
            @classmethod
            def today(cls):
                return date(2026, 6, 15)

        monkeypatch.setattr(vs, "date", FixedDate)
        v = Vehicle(
            brand="Test", model="Gap", year=2020, fuel_type="essence",
            license_plate=f"INS-{str(RID())[:6].upper()}",
            initial_odometer=0.0, **fields,
        )
        db.add(v)
        db.flush()
        return vs.VehicleService(db)._calculate_current_insurance_limit(v)

    def test_unlimited_returns_none(self, db, monkeypatch):
        assert self._limit(
            db, monkeypatch, insurance_unlimited=True,
            insurance_km_limit=10000, insurance_km_start_date=date(2024, 1, 1),
        ) is None

    def test_anniversary_reached(self, db, monkeypatch):
        # 2 full years by 2026-06-15 → 10000 + 2×1000
        assert self._limit(
            db, monkeypatch, insurance_km_limit=10000,
            insurance_km_start_date=date(2024, 3, 10), insurance_km_annual_increase=1000,
        ) == 12000

    def test_anniversary_not_yet_reached(self, db, monkeypatch):
        # 2024-09-20 + 2 years = 2026-09-20 (future) → only 1 full year
        assert self._limit(
            db, monkeypatch, insurance_km_limit=10000,
            insurance_km_start_date=date(2024, 9, 20), insurance_km_annual_increase=1000,
        ) == 11000

    def test_future_start_date_never_shrinks_limit(self, db, monkeypatch):
        assert self._limit(
            db, monkeypatch, insurance_km_limit=10000,
            insurance_km_start_date=date(2027, 1, 1), insurance_km_annual_increase=1000,
        ) == 10000

    def test_missing_start_date_returns_none(self, db, monkeypatch):
        assert self._limit(db, monkeypatch, insurance_km_limit=10000) is None


class TestVehicleStatsGaps:
    def _stats(self, client, vehicle_id):
        resp = client.get(f"{API}/vehicles/{vehicle_id}/stats")
        assert resp.status_code == 200, resp.text
        return resp.json()

    def test_seasonal_spring_and_autumn_buckets(self, client, created_vehicle, sample_fuel_entry_data):
        vid = created_vehicle["id"]
        _post(client, f"{API}/fuel-entries/", {**sample_fuel_entry_data, "odometer_reading": 10500, "fueling_date": "2025-03-01"})
        _post(client, f"{API}/fuel-entries/", {**sample_fuel_entry_data, "odometer_reading": 11500, "fueling_date": "2025-04-15"})
        _post(client, f"{API}/fuel-entries/", {**sample_fuel_entry_data, "odometer_reading": 12500, "fueling_date": "2025-10-15"})

        data = self._stats(client, vid)
        assert data["spring"] is not None and data["spring"]["fill_count"] >= 1
        assert data["autumn"] is not None and data["autumn"]["fill_count"] >= 1

    def test_leading_partial_excluded_from_average(self, client, created_vehicle, sample_fuel_entry_data):
        # A partial cannot anchor a segment (unknown tank state) → no average,
        # but the distance still spans first → last odometer.
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "is_full_tank": False, "liters": 20.0,
            "odometer_reading": 10500, "fueling_date": "2025-01-10",
        })
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "liters": 40.0,
            "odometer_reading": 11500, "fueling_date": "2025-02-10",
        })
        data = self._stats(client, created_vehicle["id"])
        # total_distance spans from the vehicle's initial odometer (10000).
        assert data["total_distance"] == 1500
        assert data["average_consumption"] is None

    def test_partial_only_history_yields_empty_seasons(self, client, created_vehicle, sample_fuel_entry_data):
        # No plein at all → seasons are all None (anchor-less history).
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "is_full_tank": False, "liters": 20.0,
            "odometer_reading": 10500, "fueling_date": "2025-01-10",
        })
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "is_full_tank": False, "liters": 15.0,
            "odometer_reading": 10900, "fueling_date": "2025-02-10",
        })
        data = self._stats(client, created_vehicle["id"])
        # No anchor → seasons exist but are empty (all-null SeasonStats).
        assert data["spring"]["fill_count"] == 0 and data["winter"]["fill_count"] == 0

    def test_e85_partial_accumulation(self, client, created_vehicle, sample_fuel_entry_data):
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "liters": 40.0,
            "odometer_reading": 10500, "fueling_date": "2025-01-10",
        })
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "fuel_type": "e85", "is_full_tank": False,
            "liters": 20.0, "odometer_reading": 10900, "fueling_date": "2025-02-01",
        })
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "liters": 40.0,
            "odometer_reading": 11500, "fueling_date": "2025-02-15",
        })
        data = self._stats(client, created_vehicle["id"])
        assert data["winter"] is not None and data["winter"]["fill_count"] >= 1

    def test_stats_insurance_remaining_and_exceeded(self, client, db, created_vehicle, sample_fuel_entry_data):
        vid = created_vehicle["id"]
        db.execute(
            text(
                "UPDATE vehicles SET insurance_km_limit = :lim, "
                "insurance_km_start_date = '2024-01-01', insurance_km_annual_increase = 0 "
                "WHERE id = :id"
            ),
            {"lim": 11000.0, "id": vid},
        )
        db.commit()
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "odometer_reading": 11500, "fueling_date": "2025-06-01",
        })
        data = self._stats(client, vid)
        assert data["insurance_km_remaining"] == -500.0
        assert data["insurance_km_exceeded"] is True


class TestFuelEntryGaps:
    def test_create_unknown_vehicle_422(self, client, sample_fuel_entry_data):
        resp = client.post(f"{API}/fuel-entries/", json={**sample_fuel_entry_data, "vehicle_id": 99999})
        assert resp.status_code == 422

    def test_create_odometer_below_latest_rejected(self, client, sample_fuel_entry_data):
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "odometer_reading": 20000, "fueling_date": "2025-06-01",
        })
        resp = client.post(f"{API}/fuel-entries/", json={
            **sample_fuel_entry_data, "odometer_reading": 19000, "fueling_date": "2025-06-02",
        })
        assert resp.status_code == 422

    def test_create_req_id_owned_by_other_vehicle_rejected(self, client, sample_fuel_entry_data, sample_vehicle_data):
        other = _post(client, f"{API}/vehicles/", {**sample_vehicle_data, "license_plate": "QQ-888-QQ"})
        rid = str(RID())
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "client_request_id": rid,
            "odometer_reading": 10500, "fueling_date": "2025-06-01",
        })
        resp = client.post(f"{API}/fuel-entries/", json={
            **sample_fuel_entry_data, "vehicle_id": other["id"], "client_request_id": rid,
            "odometer_reading": 10500, "fueling_date": "2025-06-01",
        })
        assert resp.status_code == 422

    def test_commit_conflict_returns_concurrent_row(self, tmp_path, sample_fuel_entry_data):
        """Race: between the pre-check and the commit, a concurrent writer commits
        a row with the same client_request_id. The rollback + re-query must return
        that row instead of 500ing (offline-queue idempotency). Needs two REAL
        connections → a file DB (shared in-memory SQLite is one connection)."""
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.core.database import Base
        from app.schemas.fuel_entry import FuelEntryCreate
        from app.services.fuel_service import FuelService

        engine = create_engine(f"sqlite:///{tmp_path / 'race.db'}")
        Base.metadata.create_all(bind=engine)
        factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        session = factory()

        with factory() as setup_session:
            setup_session.add(Vehicle(
                brand="Race", model="Gap", year=2020, fuel_type="essence",
                license_plate="RCE-000-01", initial_odometer=10000.0,
            ))
            setup_session.commit()
        vid = session.query(Vehicle).first().id

        payload = {**sample_fuel_entry_data, "vehicle_id": vid, "odometer_reading": 10500,
                   "fueling_date": "2025-06-01", "client_request_id": str(RID())}
        service = FuelService(session)
        original_commit = session.commit

        def evil_commit():
            # The concurrent writer lands between our pre-check and our commit.
            with factory() as other_session:
                other_session.add(FuelEntry(
                    vehicle_id=vid, fuel_type="essence", liters=40.0,
                    price_per_liter=1.85, total_cost=74.0, odometer_reading=10500,
                    fueling_date=date(2025, 6, 1), is_full_tank=True,
                    client_request_id=payload["client_request_id"],
                ))
                other_session.commit()
            original_commit()  # now raises IntegrityError (dup client_request_id)

        session.commit = evil_commit
        try:
            result = service.create_fuel_entry(FuelEntryCreate(**payload))
        finally:
            session.commit = original_commit
            session.close()
            engine.dispose()
        # Our rolled-back insert must have lost to the committed concurrent row.
        assert result.client_request_id == payload["client_request_id"]
        assert result.id is not None

    def test_commit_conflict_without_concurrent_row_reraises(self, db, sample_fuel_entry_data):
        from app.schemas.fuel_entry import FuelEntryCreate
        from app.services.fuel_service import FuelService

        service = FuelService(db)
        rid = str(RID())
        payload = {**sample_fuel_entry_data, "client_request_id": rid,
                   "odometer_reading": 10500, "fueling_date": "2025-06-01"}
        db.commit = lambda: (_ for _ in ()).throw(IntegrityError("stmt", {}, Exception("dup")))
        with pytest.raises(IntegrityError):
            service.create_fuel_entry(FuelEntryCreate(**payload))

    def test_update_unknown_entry_404(self, client):
        resp = client.put(f"{API}/fuel-entries/99999", json={"liters": 10.0})
        assert resp.status_code == 404

    def test_update_odometer_below_initial_rejected(self, client, sample_fuel_entry_data):
        entry = _post(client, f"{API}/fuel-entries/", sample_fuel_entry_data)
        # Vehicle initial_odometer is 10000.
        resp = client.put(f"{API}/fuel-entries/{entry['id']}", json={"odometer_reading": 500})
        assert resp.status_code == 422

    def test_update_odometer_below_previous_rejected(self, client, sample_fuel_entry_data):
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "odometer_reading": 10500, "fueling_date": "2025-06-01",
        })
        entry2 = _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "odometer_reading": 11000, "fueling_date": "2025-06-15",
        })
        # 10400 < previous entry's 10500 (and > vehicle initial 10000).
        resp = client.put(f"{API}/fuel-entries/{entry2['id']}", json={"odometer_reading": 10400})
        assert resp.status_code == 422

    def test_list_with_all_filters(self, client, created_vehicle, sample_fuel_entry_data):
        vid = created_vehicle["id"]
        _post(client, f"{API}/fuel-entries/", {**sample_fuel_entry_data, "odometer_reading": 10500, "fueling_date": "2025-01-10"})
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "fuel_type": "sp98",
            "odometer_reading": 11000, "fueling_date": "2025-03-10",
        })
        _post(client, f"{API}/fuel-entries/", {**sample_fuel_entry_data, "odometer_reading": 11500, "fueling_date": "2025-05-10"})

        resp = client.get(f"{API}/fuel-entries/", params={
            "vehicle_id": vid, "fuel_type": "essence",
            "start_date": "2025-01-01", "end_date": "2025-02-01",
            "order_by": "fueling_date", "order": "asc",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["entries"][0]["fueling_date"] == "2025-01-10"

    def test_statistics_single_entry_zero_distance(self, client, created_vehicle, sample_fuel_entry_data):
        _post(client, f"{API}/fuel-entries/", sample_fuel_entry_data)
        resp = client.get(f"{API}/fuel-entries/vehicle/{created_vehicle['id']}/statistics")
        assert resp.status_code == 200
        assert resp.json()["total_distance"] == 0

    def test_statistics_no_entries(self, client, created_vehicle):
        resp = client.get(f"{API}/fuel-entries/vehicle/{created_vehicle['id']}/statistics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_entries"] == 0
        assert data["average_consumption"] is None

    def test_consumption_history_empty(self, client, created_vehicle):
        resp = client.get(f"{API}/fuel-entries/vehicle/{created_vehicle['id']}/consumption-history")
        assert resp.status_code == 200
        assert resp.json()["data_points"] == []

    def test_consumption_history_zero_distance_gives_none(self, client, created_vehicle, sample_fuel_entry_data):
        # Two pleins at the SAME odometer → zero-distance segment → consumption null.
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "odometer_reading": 10500, "fueling_date": "2025-01-10",
        })
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "odometer_reading": 10500, "fueling_date": "2025-02-10",
        })
        resp = client.get(f"{API}/fuel-entries/vehicle/{created_vehicle['id']}/consumption-history")
        points = resp.json()["data_points"]
        second = [p for p in points if p["odometer_reading"] == 10500 and p["date"] == "2025-02-10"]
        assert second and second[0]["consumption"] is None


class TestFlexfuelGaps:
    CONVERSION = {"conversion_date": "2025-01-01", "kit_cost": 1500.0, "overconsumption_pct": 20.0}

    def test_update_conversion_unknown_404(self, client, created_vehicle):
        resp = client.put(
            f"{API}/flexfuel/vehicles/{created_vehicle['id']}/conversion",
            json={"overconsumption_pct": 15.0},
        )
        assert resp.status_code == 404

    def test_duplicate_conversion_rejected(self, client, created_vehicle):
        path = f"{API}/flexfuel/vehicles/{created_vehicle['id']}/conversion"
        assert client.post(path, json={**self.CONVERSION, "vehicle_id": created_vehicle["id"]}).status_code == 201
        resp = client.post(path, json={**self.CONVERSION, "vehicle_id": created_vehicle["id"]})
        assert resp.status_code == 409

    def test_period_stats_e85_without_reference_price_skipped(self, client, created_vehicle, sample_fuel_entry_data):
        path = f"{API}/flexfuel/vehicles/{created_vehicle['id']}/conversion"
        assert client.post(path, json={**self.CONVERSION, "vehicle_id": created_vehicle["id"]}).status_code == 201
        _post(client, f"{API}/fuel-entries/", {
            **sample_fuel_entry_data, "fuel_type": "e85",
            "odometer_reading": 10500, "fueling_date": "2025-03-01",
        })
        resp = client.get(
            f"{API}/vehicles/{created_vehicle['id']}/period-stats",
            params={"start_date": "2025-01-01", "end_date": "2025-12-31"},
        )
        assert resp.status_code == 200, resp.text
        # No E10 reference price → the E85 fill is skipped, not a bogus saving.
        assert resp.json()["e85_savings"] == 0.0


class TestRoutingCacheEviction:
    def test_evict_removes_expired_then_overflow(self, monkeypatch):
        from app.services import routing_service as rs

        monkeypatch.setattr(rs, "MAX_CACHE_ENTRIES", 2)
        rs.clear_cache()
        now = 1000.0
        rs._cache[("a",)] = (500.0, object())   # expired
        rs._cache[("b",)] = (2000.0, object())  # live
        rs._cache[("c",)] = (3000.0, object())  # live
        rs.RoutingService()._evict(now)
        assert ("a",) not in rs._cache
        assert len(rs._cache) <= 2
        rs.clear_cache()


class TestRootAndSchemas:
    def test_root_endpoint(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        assert "Vehicle Management API" in resp.json()["message"]

    def test_vehicle_update_falsy_license_plate_becomes_none(self):
        from app.schemas.vehicle import VehicleUpdate

        assert VehicleUpdate(license_plate="").license_plate is None

    def test_vehicle_update_falsy_brand_becomes_none(self):
        from app.schemas.vehicle import VehicleUpdate

        assert VehicleUpdate(brand="").brand is None


class TestFuelEntryEndpointErrorHandlers:
    def test_create_unexpected_error_500(self, client, sample_fuel_entry_data, monkeypatch):
        from app.services.fuel_service import FuelService

        def boom(self, data, **kw):
            raise RuntimeError("boom")

        monkeypatch.setattr(FuelService, "create_fuel_entry", boom)
        resp = client.post(f"{API}/fuel-entries/", json=sample_fuel_entry_data)
        assert resp.status_code == 500

    def test_update_unexpected_error_500(self, client, sample_fuel_entry_data, monkeypatch):
        entry = _post(client, f"{API}/fuel-entries/", sample_fuel_entry_data)
        from app.services.fuel_service import FuelService

        def boom(self, *a, **kw):
            raise RuntimeError("boom")

        monkeypatch.setattr(FuelService, "update_fuel_entry", boom)
        resp = client.put(f"{API}/fuel-entries/{entry['id']}", json={"liters": 10.0})
        assert resp.status_code == 500

    def test_latest_entry_404(self, client, created_vehicle):
        resp = client.get(f"{API}/fuel-entries/vehicle/{created_vehicle['id']}/latest")
        assert resp.status_code == 404


class TestServiceDirectValueErrors:
    def test_update_vehicle_unknown_value_error(self, db):
        from app.schemas.vehicle import VehicleUpdate
        from app.services.vehicle_service import VehicleService

        with pytest.raises(ValueError):
            VehicleService(db).update_vehicle(99999, VehicleUpdate(brand="X"))

    def test_get_vehicle_stats_unknown_value_error(self, db):
        from app.services.vehicle_service import VehicleService

        with pytest.raises(ValueError):
            VehicleService(db).get_vehicle_stats(99999)

    def test_create_conversion_duplicate_active_value_error(self, db, created_vehicle):
        from app.schemas.flexfuel import FlexfuelConversionCreate
        from app.services.flexfuel_service import FlexfuelService

        data = FlexfuelConversionCreate(
            vehicle_id=created_vehicle["id"],
            conversion_date=date(2025, 1, 1),
            kit_cost=1500.0,
        )
        service = FlexfuelService(db)
        service.create_conversion(data)
        with pytest.raises(ValueError):
            service.create_conversion(data)
