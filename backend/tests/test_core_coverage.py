"""Coverage for the small core modules: calculations, DI, DB helpers."""

from datetime import date

import pytest

from app.utils.calculations import (
    calculate_cost_per_km,
    calculate_fuel_consumption,
)


class TestCalculationsEdgeCases:
    def test_consumption_zero_distance(self):
        assert calculate_fuel_consumption(0, 10.0) == 0.0

    def test_consumption_negative_distance(self):
        assert calculate_fuel_consumption(-5.0, 10.0) == 0.0

    def test_consumption_normal(self):
        assert calculate_fuel_consumption(100.0, 8.0) == 8.0

    def test_cost_zero_distance(self):
        assert calculate_cost_per_km(100.0, 0) == 0.0

    def test_cost_negative_distance(self):
        assert calculate_cost_per_km(100.0, -1) == 0.0

    def test_cost_normal(self):
        assert calculate_cost_per_km(200.0, 100.0) == 2.0


class _FakeSession:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


class TestGetDbGenerator:
    """Both get_db() factories must yield a session and close it on exit."""

    def test_api_deps_get_db(self, monkeypatch):
        import app.api.deps as deps

        fake = _FakeSession()
        monkeypatch.setattr(deps, "SessionLocal", lambda: fake)

        gen = deps.get_db()
        db = next(gen)
        assert db is fake
        with pytest.raises(StopIteration):
            next(gen)
        assert fake.closed

    def test_core_database_get_db(self, monkeypatch):
        import app.core.database as dbmod

        fake = _FakeSession()
        monkeypatch.setattr(dbmod, "SessionLocal", lambda: fake)

        gen = dbmod.get_db()
        db = next(gen)
        assert db is fake
        with pytest.raises(StopIteration):
            next(gen)
        assert fake.closed


class TestDatabaseConnectionCheck:
    def test_connection_success(self, monkeypatch, capsys):
        import app.core.database as dbmod

        class FakeConn:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def execute(self, *args):
                return "ok"

        class FakeEngine:
            def connect(self):
                return FakeConn()

        monkeypatch.setattr(dbmod, "engine", FakeEngine())
        assert dbmod.test_connection() is True
        assert "réussie" in capsys.readouterr().out

    def test_connection_failure(self, monkeypatch):
        import app.core.database as dbmod

        class FakeEngine:
            def connect(self):
                raise OSError("nope")

        monkeypatch.setattr(dbmod, "engine", FakeEngine())
        assert dbmod.test_connection() is False


class TestModelRepr:
    def test_maintenance_repr(self):
        from app.models.maintenance import Maintenance

        m = Maintenance(
            vehicle_id=1,
            maintenance_type="vidange",
            cost=10.0,
            odometer_reading=10000,
            maintenance_date=date(2025, 1, 1),
        )
        assert "Maintenance" in repr(m)
        assert "vidange" in repr(m)

    def test_vehicle_repr(self):
        from app.models.vehicle import Vehicle

        v = Vehicle(
            brand="Peugeot", model="208", year=2022,
            license_plate="AB-123-CD", initial_odometer=10000.0,
        )
        assert "Vehicle" in repr(v) and "Peugeot" in repr(v)

    def test_fuel_entry_repr(self):
        from app.models.fuel_entry import FuelEntry

        e = FuelEntry(
            vehicle_id=1, fuel_type="essence", liters=40.0,
            price_per_liter=1.85, total_cost=74.0,
            odometer_reading=10500, fueling_date=date(2025, 1, 1),
            is_full_tank=True,
        )
        assert "FuelEntry" in repr(e)

    def test_flexfuel_conversion_repr(self):
        from app.models.flexfuel_conversion import FlexfuelConversion

        c = FlexfuelConversion(
            vehicle_id=1, conversion_date=date(2025, 1, 1),
            kit_cost=1500.0, overconsumption_pct=20.0,
        )
        assert "FlexfuelConversion" in repr(c)

    def test_e10_reference_price_repr(self):
        from app.models.e10_reference_price import E10ReferencePrice

        p = E10ReferencePrice(reference_date=date(2025, 1, 1), price_per_liter=1.70)
        assert "E10ReferencePrice" in repr(p)
