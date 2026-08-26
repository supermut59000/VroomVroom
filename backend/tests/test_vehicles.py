"""Tests for vehicle CRUD and statistics endpoints."""


class TestVehicleCRUD:
    def test_create_vehicle(self, client, sample_vehicle_data):
        resp = client.post("/api/v1/vehicles/", json=sample_vehicle_data)
        assert resp.status_code == 201
        data = resp.json()
        assert data["brand"] == "Peugeot"
        assert data["model"] == "208"
        assert data["license_plate"] == "AB-123-CD"
        assert data["fuel_type"] == "essence"
        assert data["is_active"] is True
        assert "id" in data

    def test_create_vehicle_with_yearly_fixed_costs(self, client, sample_vehicle_data):
        sample_vehicle_data["yearly_fixed_costs"] = 780.0
        resp = client.post("/api/v1/vehicles/", json=sample_vehicle_data)
        assert resp.status_code == 201
        assert resp.json()["yearly_fixed_costs"] == 780.0

    def test_create_vehicle_uppercase_plate(self, client, sample_vehicle_data):
        sample_vehicle_data["license_plate"] = "ab-456-ef"
        resp = client.post("/api/v1/vehicles/", json=sample_vehicle_data)
        assert resp.status_code == 201
        assert resp.json()["license_plate"] == "AB-456-EF"

    def test_create_vehicle_title_case_brand(self, client, sample_vehicle_data):
        sample_vehicle_data["brand"] = "peugeot"
        sample_vehicle_data["model"] = "e-208"
        resp = client.post("/api/v1/vehicles/", json=sample_vehicle_data)
        assert resp.status_code == 201
        assert resp.json()["brand"] == "Peugeot"

    def test_create_vehicle_duplicate_plate(self, client, sample_vehicle_data):
        client.post("/api/v1/vehicles/", json=sample_vehicle_data)
        resp = client.post("/api/v1/vehicles/", json=sample_vehicle_data)
        assert resp.status_code == 409

    def test_create_vehicle_missing_required_fields(self, client):
        resp = client.post("/api/v1/vehicles/", json={"brand": "Test"})
        assert resp.status_code == 422

    def test_get_vehicles_list(self, client, created_vehicle):
        resp = client.get("/api/v1/vehicles/")
        assert resp.status_code == 200
        vehicles = resp.json()
        assert len(vehicles) >= 1
        assert any(v["id"] == created_vehicle["id"] for v in vehicles)

    def test_get_vehicle_by_id(self, client, created_vehicle):
        resp = client.get(f"/api/v1/vehicles/{created_vehicle['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == created_vehicle["id"]
        assert data["brand"] == "Peugeot"

    def test_get_vehicle_not_found(self, client):
        resp = client.get("/api/v1/vehicles/99999")
        assert resp.status_code == 404

    def test_update_vehicle(self, client, created_vehicle):
        resp = client.put(
            f"/api/v1/vehicles/{created_vehicle['id']}",
            json={"description": "Ma voiture préférée"},
        )
        assert resp.status_code == 200
        assert resp.json()["description"] == "Ma voiture préférée"

    def test_update_vehicle_partial(self, client, created_vehicle):
        resp = client.put(
            f"/api/v1/vehicles/{created_vehicle['id']}",
            json={"year": 2023},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["year"] == 2023
        assert data["brand"] == "Peugeot"  # unchanged

    def test_update_initial_odometer_cannot_pass_existing_history(self, client, created_vehicle):
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": created_vehicle["id"],
            "fuel_type": "essence",
            "liters": 40.0,
            "price_per_liter": 1.8,
            "odometer_reading": 10500,
            "fueling_date": "2025-06-01",
            "is_full_tank": True,
        })

        resp = client.put(
            f"/api/v1/vehicles/{created_vehicle['id']}",
            json={"initial_odometer": 10600},
        )
        assert resp.status_code == 422
        assert "premier relevé" in resp.json()["detail"]

    def test_update_required_field_cannot_be_null(self, client, created_vehicle):
        resp = client.put(
            f"/api/v1/vehicles/{created_vehicle['id']}",
            json={"initial_odometer": None},
        )
        assert resp.status_code == 422

    def test_soft_delete_vehicle(self, client, created_vehicle):
        resp = client.delete(f"/api/v1/vehicles/{created_vehicle['id']}")
        assert resp.status_code == 204

        # Vehicle still exists but is inactive
        resp = client.get(f"/api/v1/vehicles/{created_vehicle['id']}")
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_archive_vehicle(self, client, created_vehicle):
        resp = client.post(f"/api/v1/vehicles/{created_vehicle['id']}/archive")
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False


class TestVehicleStats:
    def test_stats_no_entries(self, client, created_vehicle):
        resp = client.get(f"/api/v1/vehicles/{created_vehicle['id']}/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_fuel_entries"] == 0
        assert data["total_distance"] == 0.0
        assert data["average_consumption"] is None

    def test_stats_with_entries(self, client, created_vehicle):
        vid = created_vehicle["id"]

        # Add two fuel entries
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid,
            "fuel_type": "essence",
            "liters": 40.0,
            "price_per_liter": 1.80,
            "odometer_reading": 10500,
            "fueling_date": "2025-06-01",
            "is_full_tank": True,
        })
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid,
            "fuel_type": "essence",
            "liters": 35.0,
            "price_per_liter": 1.85,
            "odometer_reading": 11000,
            "fueling_date": "2025-07-01",
            "is_full_tank": True,
        })

        resp = client.get(f"/api/v1/vehicles/{vid}/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_fuel_entries"] == 2
        assert data["total_distance"] == 1000.0  # 11000 - 10000
        assert data["average_consumption"] is not None
        # 35L / 500km * 100 = 7.0 L/100km
        assert data["average_consumption"] == 7.0
        assert data["total_fuel_cost"] > 0

    def test_stats_not_found(self, client):
        resp = client.get("/api/v1/vehicles/99999/stats")
        assert resp.status_code == 404


class TestVehicleFilters:
    def test_filter_by_fuel_type(self, client, sample_vehicle_data):
        sample_vehicle_data["fuel_type"] = "diesel"
        sample_vehicle_data["license_plate"] = "ZZ-999-ZZ"
        client.post("/api/v1/vehicles/", json=sample_vehicle_data)

        resp = client.get("/api/v1/vehicles/?fuel_type=diesel")
        assert resp.status_code == 200
        vehicles = resp.json()
        assert all(v["fuel_type"] == "diesel" for v in vehicles)

    def test_filter_active_only(self, client, created_vehicle):
        # Archive vehicle
        client.post(f"/api/v1/vehicles/{created_vehicle['id']}/archive")

        resp = client.get("/api/v1/vehicles/?active_only=true")
        assert resp.status_code == 200
        vehicles = resp.json()
        assert all(v["is_active"] for v in vehicles)


class TestPeriodStats:
    def test_period_stats_clamps_distance_after_correction(self, client, created_vehicle):
        """A historical correction (allow_odometer_decrease) can leave the newest
        entry below the oldest inside the window — distance must clamp to 0,
        not report -500 km / -16.1 km/day."""
        vid = created_vehicle["id"]
        self._fill(client, vid, 10500, 40.0, 1.80, "2025-06-01")
        resp = client.post(
            "/api/v1/fuel-entries/?allow_odometer_decrease=true",
            json={
                "vehicle_id": vid, "fuel_type": "essence", "liters": 35.0,
                "price_per_liter": 1.80, "odometer_reading": 10000,
                "fueling_date": "2025-06-15", "is_full_tank": True,
            },
        )
        assert resp.status_code == 201

        resp = client.get(
            f"/api/v1/vehicles/{vid}/period-stats?start_date=2025-06-01&end_date=2025-06-30"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["distance_km"] == 0.0
        assert data["km_per_day"] == 0.0
        assert data["fuel_cost_per_100km"] is None

    def _fill(self, client, vid, odo, liters, price, fdate, fuel="essence", full=True):
        resp = client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid,
            "fuel_type": fuel,
            "liters": liters,
            "price_per_liter": price,
            "odometer_reading": odo,
            "fueling_date": fdate,
            "is_full_tank": full,
        })
        assert resp.status_code == 201

    def test_period_stats_essentials(self, client, created_vehicle):
        vid = created_vehicle["id"]
        # Outside the period (before)
        self._fill(client, vid, 10000, 40.0, 1.80, "2025-05-01")
        # Inside the period
        self._fill(client, vid, 10500, 35.0, 1.80, "2025-06-01")
        self._fill(client, vid, 11000, 35.0, 1.90, "2025-06-15")
        self._fill(client, vid, 11600, 42.0, 2.00, "2025-06-29")
        # Outside the period (after)
        self._fill(client, vid, 12000, 30.0, 1.80, "2025-07-10")

        resp = client.get(
            f"/api/v1/vehicles/{vid}/period-stats?start_date=2025-06-01&end_date=2025-06-30"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["days"] == 30
        assert data["fill_count"] == 3
        assert data["distance_km"] == 1100  # 11600 - 10500
        assert data["total_liters"] == 112.0
        # 35×1.80 + 35×1.90 + 42×2.00 = 63 + 66.5 + 84 = 213.5
        assert data["total_fuel_cost"] == 213.5
        # Consumption anchored at first full IN the period:
        # (35 + 42) × 100 / (11600 − 10500) = 7.0
        assert data["avg_consumption"] == 7.0
        # Liters-weighted price: 213.5 / 112 = 1.906
        assert data["avg_price_per_liter"] == 1.906
        # €/100km: 213.5 × 100 / 1100 = 19.41
        assert data["fuel_cost_per_100km"] == 19.41
        assert data["km_per_day"] == round(1100 / 30, 1)
        # No conversion on this vehicle → no E85 block
        assert data["e85_savings"] is None

    def test_period_stats_maintenance_and_cost_per_day(self, client, created_vehicle):
        vid = created_vehicle["id"]
        self._fill(client, vid, 10500, 40.0, 2.00, "2025-06-05")
        client.post("/api/v1/maintenances/", json={
            "vehicle_id": vid,
            "maintenance_type": "vidange",
            "cost": 90.0,
            "odometer_reading": 10500,
            "maintenance_date": "2025-06-10",
        })
        resp = client.get(
            f"/api/v1/vehicles/{vid}/period-stats?start_date=2025-06-01&end_date=2025-06-30"
        )
        data = resp.json()
        assert data["maintenance_cost"] == 90.0
        assert data["maintenance_count"] == 1
        # (80 fuel + 90 maintenance) / 30 days
        assert data["cost_per_day"] == round((80.0 + 90.0) / 30, 2)

    def test_period_stats_e85_savings(self, client, created_conversion, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        client.post("/api/v1/flexfuel/e10-prices", json={
            "reference_date": "2024-01-01", "price_per_liter": 1.80,
        })
        # E85 fill inside the period (conversion date is 2024-01-15)
        self._fill(client, vid, 50500, 40.0, 0.90, "2024-02-10", fuel="e85")
        # Essence booster inside the period
        self._fill(client, vid, 51000, 5.0, 1.80, "2024-02-20", fuel="essence", full=False)

        resp = client.get(
            f"/api/v1/vehicles/{vid}/period-stats?start_date=2024-02-01&end_date=2024-02-28"
        )
        data = resp.json()
        # Savings: 40 / 1.197 × 1.80 − 36 = 60.15 − 36 = 24.15 (opc 19.7%)
        assert data["e85_savings"] == round(40 / 1.197 * 1.80 - 36.0, 2)
        # E85 share of liters: 40 / 45
        assert data["e85_share_liters"] == round(40 / 45, 3)
        assert data["skipped_fills_no_e10_price"] == 0

    def test_period_stats_invalid_range(self, client, created_vehicle):
        vid = created_vehicle["id"]
        resp = client.get(
            f"/api/v1/vehicles/{vid}/period-stats?start_date=2025-06-30&end_date=2025-06-01"
        )
        assert resp.status_code == 422

    def test_period_stats_empty_period(self, client, created_vehicle):
        vid = created_vehicle["id"]
        resp = client.get(
            f"/api/v1/vehicles/{vid}/period-stats?start_date=2030-01-01&end_date=2030-01-31"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["fill_count"] == 0
        assert data["distance_km"] == 0
        assert data["avg_consumption"] is None


class TestSeasonalAutonomy:
    """Regression tests for _compute_seasonal_consumption (2026-07-05 debug
    session fixed real bugs here and left no tests behind)."""

    def _fill(self, client, vid, odo, liters, fdate, fuel="essence", full=True, price=1.80):
        resp = client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": fuel, "liters": liters,
            "price_per_liter": price, "odometer_reading": odo,
            "fueling_date": fdate, "is_full_tank": full,
        })
        assert resp.status_code == 201

    def test_range_formula_with_cushion(self, client, created_vehicle):
        """range_km = (tank - 5 L) × 100 / avg_consumption, overall and per-season."""
        vid = created_vehicle["id"]  # tank_capacity 50
        self._fill(client, vid, 10000, 40.0, "2025-06-01")
        self._fill(client, vid, 10500, 35.0, "2025-06-10")
        self._fill(client, vid, 11000, 35.0, "2025-06-20")

        data = client.get(f"/api/v1/vehicles/{vid}/stats").json()
        # Two segments of 35 L / 500 km → avg 7.0; (50−5)×100/7.0 = 642.86 → 643
        assert data["average_consumption"] == 7.0
        assert data["range_km"] == 643.0
        assert data["summer"]["avg_consumption"] == 7.0
        assert data["summer"]["range_km"] == 643.0
        assert data["summer"]["fill_count"] == 2

    def test_leading_partial_after_from_date_not_an_anchor(self, client, created_flexfuel_vehicle, sample_conversion_data):
        """FlexFuel: drop entries until the first FULL tank on/after the conversion
        date — a leading partial must not anchor a bogus 15 L/100 km segment."""
        vid = created_flexfuel_vehicle["id"]
        client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json={
            **sample_conversion_data, "conversion_date": "2025-05-20"})

        self._fill(client, vid, 50000, 40.0, "2025-05-10")                     # before conversion — excluded
        self._fill(client, vid, 50200, 15.0, "2025-06-01", full=False)          # first after from_date: partial
        self._fill(client, vid, 50400, 30.0, "2025-06-05")                      # anchor
        self._fill(client, vid, 50900, 35.0, "2025-06-20")

        data = client.get(f"/api/v1/vehicles/{vid}/stats").json()
        # Only one valid segment: 35 L / 500 km = 7.0. If the partial anchored,
        # the bogus segment would be 30 L / 200 km = 15 L/100 km.
        assert data["summer"]["avg_consumption"] == 7.0
        assert data["summer"]["fill_count"] == 1

    def test_pre_conversion_fills_excluded_from_season_bucket(self, client, created_flexfuel_vehicle, sample_conversion_data):
        """The season's E85 share must not be diluted by pre-conversion Essence segments."""
        vid = created_flexfuel_vehicle["id"]
        client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json={
            **sample_conversion_data, "conversion_date": "2025-06-10"})

        # Pre-conversion summer fills (essence)
        self._fill(client, vid, 50000, 40.0, "2025-06-01")
        self._fill(client, vid, 50500, 36.0, "2025-06-05")
        # Post-conversion summer fills (E85)
        self._fill(client, vid, 51000, 40.0, "2025-06-15", fuel="e85")
        self._fill(client, vid, 51400, 35.0, "2025-06-25", fuel="e85")

        data = client.get(f"/api/v1/vehicles/{vid}/stats").json()
        # Only the post-conversion segment 11000→11400 counts: 35 L / 400 km = 8.75, 100% E85
        assert data["summer"]["avg_consumption"] == 8.75
        assert data["summer"]["e85_fraction"] == 1.0
        assert data["summer"]["fill_count"] == 1

    def test_per_segment_normalisation_distance_weighted(self, client, created_flexfuel_vehicle, sample_conversion_data):
        """Worked example from CONTEXT.md: segments 7.2/7.5/8.1 L/100km with burned
        E85 fractions 0.0/0.5/1.0 over equal distances → e10 6.93, e85 8.30."""
        vid = created_flexfuel_vehicle["id"]
        client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json={
            **sample_conversion_data, "conversion_date": "2024-11-01"})

        self._fill(client, vid, 50000, 40.0, "2024-12-01", fuel="essence")       # anchor, prev E85 frac 0.0
        # Stop at 50500: 18 L essence booster + 18 L E85 full (same date/odo → 50% E85 added)
        self._fill(client, vid, 50500, 18.0, "2024-12-05", fuel="essence", full=False)
        self._fill(client, vid, 50500, 18.0, "2024-12-05", fuel="e85")
        self._fill(client, vid, 51000, 37.5, "2024-12-12", fuel="e85")
        self._fill(client, vid, 51500, 40.5, "2024-12-20", fuel="e85")

        data = client.get(f"/api/v1/vehicles/{vid}/stats").json()
        winter = data["winter"]
        # Segments: (7.2, frac 0.0) → (7.5, frac 0.5) → (8.1, frac 1.0)
        assert winter["avg_consumption"] == 7.6
        assert winter["e10_consumption"] == 6.93
        assert winter["e85_consumption"] == 8.30
        assert winter["e85_fraction"] == 0.52
        assert winter["fill_count"] == 3


class TestStatsBatchAndTimeline:
    def test_stats_batch_returns_active_vehicles_only(self, client, created_vehicle, sample_vehicle_data):
        sample_vehicle_data["license_plate"] = "ZZ-999-ZZ"
        v2 = client.post("/api/v1/vehicles/", json=sample_vehicle_data).json()
        client.post(f"/api/v1/vehicles/{created_vehicle['id']}/archive")

        resp = client.get("/api/v1/vehicles/stats/batch")
        assert resp.status_code == 200
        data = resp.json()
        assert str(v2["id"]) in data
        assert str(created_vehicle["id"]) not in data  # archived → excluded

    def test_timeline_merges_fuel_and_maintenance_desc(self, client, created_vehicle, sample_maintenance_data):
        vid = created_vehicle["id"]
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": "essence", "liters": 40.0,
            "price_per_liter": 1.80, "odometer_reading": 10500,
            "fueling_date": "2025-06-01", "is_full_tank": True})
        client.post("/api/v1/maintenances/", json={
            **sample_maintenance_data, "maintenance_date": "2025-07-01"})

        resp = client.get(f"/api/v1/vehicles/{vid}/timeline")
        assert resp.status_code == 200
        events = resp.json()["events"]
        assert [e["event_type"] for e in events] == ["maintenance", "fuel"]

        # Soft-deleted fuel entry must disappear from the timeline
        fuel_id = events[1]["event_id"]
        client.delete(f"/api/v1/fuel-entries/{fuel_id}")
        events = client.get(f"/api/v1/vehicles/{vid}/timeline").json()["events"]
        assert len(events) == 1 and events[0]["event_type"] == "maintenance"
