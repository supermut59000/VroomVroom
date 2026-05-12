import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.core.database import Base
from app.api.deps import get_db
from app.core.config import settings

# In-memory SQLite for tests (fast, no external deps)
SQLALCHEMY_TEST_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_TEST_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create all tables once for the test session."""
    # Import all models so Base.metadata knows about them
    from app.models.vehicle import Vehicle  # noqa: F401
    from app.models.fuel_entry import FuelEntry  # noqa: F401
    from app.models.maintenance import Maintenance  # noqa: F401
    from app.models.flexfuel_conversion import FlexfuelConversion  # noqa: F401
    from app.models.e10_reference_price import E10ReferencePrice  # noqa: F401

    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    """Fresh database session per test, rolled back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db):
    """FastAPI test client with overridden DB dependency."""
    from app.main import app

    def override_get_db():
        yield db

    # Disable API key auth for tests
    original_api_key = settings.API_KEY
    settings.API_KEY = ""

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    settings.API_KEY = original_api_key


@pytest.fixture()
def client_with_auth(db):
    """FastAPI test client with API key auth enabled."""
    from app.main import app

    def override_get_db():
        yield db

    original_api_key = settings.API_KEY
    settings.API_KEY = "test-secret-key"

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    settings.API_KEY = original_api_key


# ── Reusable test data factories ──


@pytest.fixture()
def sample_vehicle_data():
    """Minimal valid vehicle payload."""
    return {
        "brand": "Peugeot",
        "model": "208",
        "year": 2022,
        "license_plate": "AB-123-CD",
        "fuel_type": "essence",
        "initial_odometer": 10000,
        "tank_capacity": 50.0,
    }


@pytest.fixture()
def created_vehicle(client, sample_vehicle_data):
    """Create a vehicle and return the response dict."""
    resp = client.post("/api/v1/vehicles/", json=sample_vehicle_data)
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture()
def sample_fuel_entry_data(created_vehicle):
    """Minimal valid fuel entry payload tied to created_vehicle."""
    return {
        "vehicle_id": created_vehicle["id"],
        "fuel_type": "essence",
        "liters": 40.0,
        "price_per_liter": 1.85,
        "odometer_reading": 10500,
        "fueling_date": "2025-06-15",
        "is_full_tank": True,
        "station_name": "TotalEnergies",
    }


@pytest.fixture()
def sample_maintenance_data(created_vehicle):
    """Minimal valid maintenance payload tied to created_vehicle."""
    return {
        "vehicle_id": created_vehicle["id"],
        "maintenance_type": "vidange",
        "cost": 89.90,
        "odometer_reading": 10500,
        "maintenance_date": "2025-06-15",
        "service_provider": "Speedy",
        "next_maintenance_date": "2026-06-15",
        "next_maintenance_odometer": 25000,
    }


@pytest.fixture()
def flexfuel_vehicle_data():
    """Vehicle payload for a FlexFuel-capable car."""
    return {
        "brand": "Opel",
        "model": "Corsa",
        "year": 2018,
        "license_plate": "FF-001-FF",
        "fuel_type": "e85",
        "initial_odometer": 50000,
        "tank_capacity": 50.0,
    }


@pytest.fixture()
def created_flexfuel_vehicle(client, flexfuel_vehicle_data):
    resp = client.post("/api/v1/vehicles/", json=flexfuel_vehicle_data)
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture()
def sample_conversion_data(created_flexfuel_vehicle):
    return {
        "vehicle_id": created_flexfuel_vehicle["id"],
        "conversion_date": "2024-01-15",
        "kit_cost": 770.0,
        "overconsumption_pct": 19.7,
        "kit_brand": "Biogastech",
        "installer": "Garage Dupont",
        "target_ethanol_pct": 77.0,
        "ethanol_tolerance_pct": 5.0,
    }


@pytest.fixture()
def created_conversion(client, sample_conversion_data, created_flexfuel_vehicle):
    vid = created_flexfuel_vehicle["id"]
    resp = client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json=sample_conversion_data)
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture()
def sample_e10_price_data():
    return {"reference_date": "2024-06-01", "price_per_liter": 1.85, "notes": "Station Total"}
