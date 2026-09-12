"""Serve the full app on a file-based SQLite database (no MariaDB required).

Used by the integration tests (backend/tests/test_integration_http.py) and the
browser smoke tests (frontend-react/e2e). Not a production entry point.

Env:
    VV_SQLITE_DB  path of the SQLite file (default /tmp/vroomvroom-dev.sqlite3)
    VV_PORT       port to listen on (default 18055)
"""

import os
from datetime import date

# Settings requires DB_* but the MariaDB engine is never used below.
os.environ.setdefault("DB_HOST", "sqlite-dev")
os.environ.setdefault("DB_USER", "x")
os.environ.setdefault("DB_PASSWORD", "x")
# Dev origin for the e2e frontend (vite preview on 3056).
os.environ.setdefault(
    "BACKEND_CORS_ORIGINS", "http://localhost:3056,http://127.0.0.1:3056"
)

DB_PATH = os.environ.get("VV_SQLITE_DB", "/tmp/vroomvroom-dev.sqlite3")
PORT = int(os.environ.get("VV_PORT", "18055"))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
import app.core.database as core_db

# Import all models so create_all() sees every table.
from app.models import (  # noqa: F401
    Vehicle,
    FuelEntry,
    Maintenance,
    FlexfuelConversion,
    E10ReferencePrice,
)

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
Base.metadata.create_all(engine)
dev_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# deps.py and main.py captured SessionLocal at import time — rebind both.
core_db.engine = engine
core_db.SessionLocal = dev_session
import app.api.deps as deps
import app.main as app_main

deps.SessionLocal = dev_session
app_main.SessionLocal = dev_session


def seed_if_empty() -> None:
    """One vehicle + one fill on a fresh DB so the dashboard renders."""
    from app.models import FuelEntry, Vehicle

    db = dev_session()
    try:
        if db.query(Vehicle).count() > 0:
            return
        vehicle = Vehicle(
            brand="Peugeot",
            model="208",
            year=2022,
            license_plate="SMOKE-01",
            fuel_type="essence",
            initial_odometer=10000.0,
            tank_capacity=50.0,
        )
        db.add(vehicle)
        db.flush()
        db.add(
            FuelEntry(
                vehicle_id=vehicle.id,
                fuel_type="essence",
                liters=40.0,
                price_per_liter=1.85,
                total_cost=74.0,
                odometer_reading=10500,
                fueling_date=date(2025, 6, 15),
                is_full_tank=True,
                station_name="TotalEnergies",
            )
        )
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn

    seed_if_empty()
    uvicorn.run(app_main.app, host="127.0.0.1", port=PORT, log_level="warning")
