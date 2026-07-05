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
