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


class TestPeriodStats:
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
