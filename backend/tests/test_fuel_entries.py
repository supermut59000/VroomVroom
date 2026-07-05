"""Tests for fuel entry CRUD and consumption calculation endpoints."""


class TestFuelEntryCRUD:
    def test_create_fuel_entry(self, client, sample_fuel_entry_data):
        resp = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)
        assert resp.status_code == 201
        data = resp.json()
        assert data["liters"] == 40.0
        assert data["price_per_liter"] == 1.85
        assert data["total_cost"] == 40.0 * 1.85
        assert data["station_name"] == "TotalEnergies"
        assert "id" in data

    def test_create_fuel_entry_auto_total_cost(self, client, sample_fuel_entry_data):
        resp = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)
        data = resp.json()
        expected = round(sample_fuel_entry_data["liters"] * sample_fuel_entry_data["price_per_liter"], 2)
        assert round(data["total_cost"], 2) == expected

    def test_create_fuel_entry_invalid_liters(self, client, sample_fuel_entry_data):
        sample_fuel_entry_data["liters"] = -5
        resp = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)
        assert resp.status_code == 422

    def test_create_fuel_entry_invalid_price(self, client, sample_fuel_entry_data):
        sample_fuel_entry_data["price_per_liter"] = 0
        resp = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)
        assert resp.status_code == 422

    def test_get_fuel_entry_by_id(self, client, sample_fuel_entry_data):
        create_resp = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)
        entry_id = create_resp.json()["id"]

        resp = client.get(f"/api/v1/fuel-entries/{entry_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == entry_id

    def test_get_fuel_entry_not_found(self, client):
        resp = client.get("/api/v1/fuel-entries/99999")
        assert resp.status_code == 404

    def test_update_fuel_entry(self, client, sample_fuel_entry_data):
        create_resp = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)
        entry_id = create_resp.json()["id"]

        resp = client.put(f"/api/v1/fuel-entries/{entry_id}", json={"liters": 45.0})
        assert resp.status_code == 200
        assert resp.json()["liters"] == 45.0

    def test_delete_fuel_entry(self, client, sample_fuel_entry_data):
        create_resp = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)
        entry_id = create_resp.json()["id"]

        resp = client.delete(f"/api/v1/fuel-entries/{entry_id}")
        assert resp.status_code == 204

        resp = client.get(f"/api/v1/fuel-entries/{entry_id}")
        assert resp.status_code == 404

    def test_delete_fuel_entry_not_found(self, client):
        resp = client.delete("/api/v1/fuel-entries/99999")
        assert resp.status_code == 404


class TestFuelEntryList:
    def test_list_fuel_entries(self, client, sample_fuel_entry_data):
        client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)

        resp = client.get("/api/v1/fuel-entries/")
        assert resp.status_code == 200
        data = resp.json()
        assert "entries" in data
        assert "total" in data
        assert data["total"] >= 1

    def test_list_by_vehicle(self, client, sample_fuel_entry_data, created_vehicle):
        client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)

        resp = client.get(f"/api/v1/fuel-entries/vehicle/{created_vehicle['id']}")
        assert resp.status_code == 200
        entries = resp.json()
        assert len(entries) >= 1
        assert all(e["vehicle_id"] == created_vehicle["id"] for e in entries)

    def test_latest_by_vehicle(self, client, sample_fuel_entry_data, created_vehicle):
        # Create two entries
        client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)

        second = sample_fuel_entry_data.copy()
        second["odometer_reading"] = 11000
        second["fueling_date"] = "2025-07-15"
        client.post("/api/v1/fuel-entries/", json=second)

        resp = client.get(f"/api/v1/fuel-entries/vehicle/{created_vehicle['id']}/latest")
        assert resp.status_code == 200
        assert resp.json()["odometer_reading"] == 11000

    def test_pagination(self, client, sample_fuel_entry_data):
        # Create 3 entries
        for i in range(3):
            entry = sample_fuel_entry_data.copy()
            entry["odometer_reading"] = 10500 + (i * 500)
            entry["fueling_date"] = f"2025-06-{15 + i}"
            client.post("/api/v1/fuel-entries/", json=entry)

        resp = client.get("/api/v1/fuel-entries/?per_page=2&page=1")
        data = resp.json()
        assert len(data["entries"]) == 2
        assert data["total"] == 3
        assert data["pages"] == 2


class TestFuelStatistics:
    def test_statistics_empty(self, client, created_vehicle):
        resp = client.get(f"/api/v1/fuel-entries/vehicle/{created_vehicle['id']}/statistics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_entries"] == 0
        assert data["average_consumption"] is None

    def test_statistics_with_entries(self, client, created_vehicle):
        vid = created_vehicle["id"]

        # Entry 1: reference point
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid,
            "fuel_type": "essence",
            "liters": 40.0,
            "price_per_liter": 1.80,
            "odometer_reading": 10500,
            "fueling_date": "2025-06-01",
            "is_full_tank": True,
        })
        # Entry 2: 500km later, 35L
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid,
            "fuel_type": "essence",
            "liters": 35.0,
            "price_per_liter": 1.85,
            "odometer_reading": 11000,
            "fueling_date": "2025-07-01",
            "is_full_tank": True,
        })

        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/statistics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_entries"] == 2
        assert data["total_distance"] == 500
        assert data["average_consumption"] == 7.0  # 35L / 500km * 100

    def test_average_consumption_distance_weighted(self, client, created_vehicle):
        """A 600 km highway segment must weigh more than a 100 km city one."""
        vid = created_vehicle["id"]
        fills = [
            {"odometer_reading": 10000, "liters": 40.0, "fueling_date": "2025-06-01"},
            {"odometer_reading": 10100, "liters": 8.0, "fueling_date": "2025-06-05"},   # 8 L/100 over 100 km
            {"odometer_reading": 10700, "liters": 36.0, "fueling_date": "2025-06-20"},  # 6 L/100 over 600 km
        ]
        for f in fills:
            client.post("/api/v1/fuel-entries/", json={
                "vehicle_id": vid,
                "fuel_type": "essence",
                "price_per_liter": 1.80,
                "is_full_tank": True,
                **f,
            })

        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/statistics")
        # Weighted: (8 + 36) × 100 / 700 = 6.29 — NOT the simple mean 7.0
        assert resp.json()["average_consumption"] == 6.29

    def test_leading_partial_is_not_an_anchor(self, client, created_vehicle):
        """History starting with a partial: segments anchor at the first FULL tank."""
        vid = created_vehicle["id"]
        fills = [
            {"odometer_reading": 10000, "liters": 15.0, "is_full_tank": False, "fueling_date": "2025-06-01"},
            {"odometer_reading": 10200, "liters": 30.0, "is_full_tank": True, "fueling_date": "2025-06-05"},
            {"odometer_reading": 10700, "liters": 35.0, "is_full_tank": True, "fueling_date": "2025-06-20"},
        ]
        for f in fills:
            client.post("/api/v1/fuel-entries/", json={
                "vehicle_id": vid,
                "fuel_type": "essence",
                "price_per_liter": 1.80,
                **f,
            })

        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/statistics")
        # Only one valid segment: 35 L / 500 km = 7.0. The leading partial and
        # the partial→full pseudo-segment must not pollute the average.
        assert resp.json()["average_consumption"] == 7.0


class TestConsumptionHistory:
    def test_consumption_history(self, client, created_vehicle):
        vid = created_vehicle["id"]

        # 3 entries for a consumption history chart
        entries = [
            {"odometer_reading": 10500, "liters": 40.0, "fueling_date": "2025-06-01"},
            {"odometer_reading": 11000, "liters": 35.0, "fueling_date": "2025-07-01"},
            {"odometer_reading": 11600, "liters": 42.0, "fueling_date": "2025-08-01"},
        ]
        for e in entries:
            client.post("/api/v1/fuel-entries/", json={
                "vehicle_id": vid,
                "fuel_type": "essence",
                "price_per_liter": 1.80,
                "is_full_tank": True,
                **e,
            })

        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/consumption-history")
        assert resp.status_code == 200
        data = resp.json()
        assert data["vehicle_id"] == vid
        assert len(data["data_points"]) == 3

        # First point has no consumption (reference)
        assert data["data_points"][0]["consumption"] is None
        # Second: 35L / 500km * 100 = 7.0
        assert data["data_points"][1]["consumption"] == 7.0
        # Third: 42L / 600km * 100 = 7.0
        assert data["data_points"][2]["consumption"] == 7.0


class TestPartialFillConsumption:
    def test_partial_fills_accumulate(self, client, created_vehicle):
        """Partial fills should accumulate until next full tank."""
        vid = created_vehicle["id"]

        entries = [
            {"odometer_reading": 10000, "liters": 40.0, "is_full_tank": True, "fueling_date": "2025-06-01"},
            {"odometer_reading": 10250, "liters": 20.0, "is_full_tank": False, "fueling_date": "2025-06-15"},
            {"odometer_reading": 10500, "liters": 20.0, "is_full_tank": True, "fueling_date": "2025-07-01"},
        ]
        for e in entries:
            client.post("/api/v1/fuel-entries/", json={
                "vehicle_id": vid,
                "fuel_type": "essence",
                "price_per_liter": 1.80,
                **e,
            })

        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/statistics")
        data = resp.json()
        # Consumption = (20 partial + 20 full) / 500km * 100 = 8.0
        assert data["average_consumption"] == 8.0
