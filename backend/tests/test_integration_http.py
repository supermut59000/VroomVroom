"""Integration tests: boot the real uvicorn server (SQLite) and drive it over real HTTP.

Covers what TestClient unit tests can't: the full ASGI stack, uvicorn, real TCP
round-trips, and the seeded startup path. The server runs dev_sqlite_server.py
in a subprocess with a fresh temp database per test module.
"""

import os
import socket
import subprocess
import sys
import tempfile
import time

import httpx
import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def server():
    port = _free_port()
    db_fd, db_path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(db_fd)
    os.unlink(db_path)  # the server creates the file

    env = {
        **os.environ,
        "VV_SQLITE_DB": db_path,
        "VV_PORT": str(port),
        "DB_HOST": "x",
        "DB_USER": "x",
        "DB_PASSWORD": "x",
    }
    proc = subprocess.Popen(
        [sys.executable, "dev_sqlite_server.py"],
        cwd=BACKEND_DIR,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        deadline = time.time() + 30
        last_err = None
        while time.time() < deadline:
            if proc.poll() is not None:
                out = proc.stdout.read().decode(errors="replace")
                raise RuntimeError(f"server exited early:\n{out}")
            try:
                if httpx.get(f"{base}/health", timeout=2).status_code == 200:
                    break
            except Exception as e:  # noqa: BLE001 — server not up yet
                last_err = e
            time.sleep(0.2)
        else:
            raise RuntimeError(f"server did not come up: {last_err}")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        if os.path.exists(db_path):
            os.unlink(db_path)


@pytest.fixture()
def client(server):
    with httpx.Client(base_url=server, timeout=10) as c:
        yield c


def _make_vehicle(client: httpx.Client, plate: str) -> dict:
    r = client.post(
        "/api/v1/vehicles/",
        json={
            "brand": "Peugeot",
            "model": "208",
            "year": 2022,
            "license_plate": plate,
            "fuel_type": "essence",
            "initial_odometer": 10000,
            "tank_capacity": 50.0,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _make_fill(client: httpx.Client, vehicle_id: int, **overrides) -> httpx.Response:
    payload = {
        "vehicle_id": vehicle_id,
        "fuel_type": "essence",
        "liters": 40.0,
        "price_per_liter": 1.85,
        "odometer_reading": 10500,
        "fueling_date": "2025-06-15",
        "is_full_tank": True,
        "station_name": "TotalEnergies",
    }
    payload.update(overrides)
    return client.post("/api/v1/fuel-entries/", json=payload)


class TestServerUp:
    def test_health_is_healthy_over_real_http(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "healthy"}

    def test_seed_vehicle_is_served(self, client):
        r = client.get("/api/v1/vehicles/")
        assert r.status_code == 200
        vehicles = r.json()
        assert any(v["license_plate"] == "SMOKE-01" for v in vehicles)


class TestVehicleLifecycle:
    def test_create_fill_stats_and_force_delete(self, client):
        vehicle = _make_vehicle(client, "INT-LIFE-1")
        vid = vehicle["id"]

        assert _make_fill(client, vid).status_code == 201
        r = _make_fill(
            client,
            vid,
            odometer_reading=11000,
            fueling_date="2025-06-22",
            station_name="Shell",
        )
        assert r.status_code == 201

        stats = client.get(f"/api/v1/vehicles/{vid}/stats").json()
        assert stats["total_fuel_entries"] == 2
        # Fill-to-fill: 40 L over 10500 → 11000 = 8.0 L/100km
        assert stats["average_consumption"] == pytest.approx(8.0)
        assert stats["total_fuel_cost"] == pytest.approx(148.0)

        # Soft delete: hidden from the default (active-only) list, still GET-able.
        r = client.delete(f"/api/v1/vehicles/{vid}")
        assert r.status_code == 204
        plates = [v["license_plate"] for v in client.get("/api/v1/vehicles/").json()]
        assert "INT-LIFE-1" not in plates
        assert client.get(f"/api/v1/vehicles/{vid}").status_code == 200

        # Force delete: gone, cascade removes the fuel entries.
        r = client.delete(f"/api/v1/vehicles/{vid}", params={"force": "true"})
        assert r.status_code == 204
        assert client.get(f"/api/v1/vehicles/{vid}").status_code == 404
        assert client.get(f"/api/v1/fuel-entries/vehicle/{vid}").json() == []

    def test_unknown_vehicle_404(self, client):
        assert client.get("/api/v1/vehicles/999999").status_code == 404


class TestOfflineSyncContract:
    """What the PWA offline queue relies on over the wire."""

    def test_client_request_id_makes_retries_idempotent(self, client):
        vehicle = _make_vehicle(client, "INT-IDEM-1")
        vid = vehicle["id"]
        request_id = "6f1e0c4e-8f2a-4c3b-9d5e-1a2b3c4d5e6f"

        first = _make_fill(client, vid, client_request_id=request_id)
        assert first.status_code == 201
        # Retry with the same request id = idempotent success: the existing
        # entry is returned (201, same id), NOT a duplicate and NOT a 409.
        second = _make_fill(client, vid, client_request_id=request_id)
        assert second.status_code == 201
        assert second.json()["id"] == first.json()["id"]
        entries = client.get(f"/api/v1/fuel-entries/vehicle/{vid}").json()
        assert len(entries) == 1

    def test_odometer_decrease_blocked_then_allowed(self, client):
        vehicle = _make_vehicle(client, "INT-ODO-1")
        vid = vehicle["id"]
        assert _make_fill(client, vid, odometer_reading=10500).status_code == 201

        blocked = _make_fill(client, vid, odometer_reading=10400, fueling_date="2025-06-10")
        assert blocked.status_code == 422

        # allow_odometer_decrease is a query param, not part of the JSON body.
        allowed = client.post(
            "/api/v1/fuel-entries/",
            params={"allow_odometer_decrease": "true"},
            json={
                "vehicle_id": vid,
                "fuel_type": "essence",
                "liters": 40.0,
                "price_per_liter": 1.85,
                "odometer_reading": 10400,
                "fueling_date": "2025-06-10",
                "is_full_tank": True,
                "station_name": "BP",
            },
        )
        assert allowed.status_code == 201
