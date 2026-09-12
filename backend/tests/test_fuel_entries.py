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

    def test_create_sp98_fuel_entry(self, client, sample_fuel_entry_data):
        sample_fuel_entry_data["fuel_type"] = "sp98"
        resp = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)

        assert resp.status_code == 201
        assert resp.json()["fuel_type"] == "sp98"

    def test_client_retry_is_idempotent(self, client, sample_fuel_entry_data):
        sample_fuel_entry_data["client_request_id"] = "0d03fe3d-ae3a-4455-83f2-5ef4c72d6077"
        first = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)
        retry = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)

        assert retry.status_code == 201
        assert retry.json()["id"] == first.json()["id"]
        assert client.get("/api/v1/fuel-entries/").json()["total"] == 1

    def test_same_odometer_blend_fills_remain_distinct(self, client, sample_fuel_entry_data):
        partial = {
            **sample_fuel_entry_data,
            "fuel_type": "essence",
            "is_full_tank": False,
            "client_request_id": "f81e6a3c-31b7-40cc-a765-7548ed81766c",
        }
        full = {
            **sample_fuel_entry_data,
            "fuel_type": "e85",
            "is_full_tank": True,
            "client_request_id": "eb53db74-e4ef-454d-9dda-bf90102f6014",
        }

        first = client.post("/api/v1/fuel-entries/", json=partial)
        second = client.post("/api/v1/fuel-entries/", json=full)

        assert first.status_code == second.status_code == 201
        assert first.json()["id"] != second.json()["id"]
        assert client.get("/api/v1/fuel-entries/").json()["total"] == 2

    def test_create_fuel_entry_below_initial_odometer_rejected(self, client, sample_fuel_entry_data):
        sample_fuel_entry_data["odometer_reading"] = 9999
        resp = client.post(
            "/api/v1/fuel-entries/?allow_odometer_decrease=true",
            json=sample_fuel_entry_data,
        )
        assert resp.status_code == 422
        assert "kilométrage initial" in resp.json()["detail"]

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

    def test_update_rejects_out_of_sequence_odometer(self, client, sample_fuel_entry_data):
        first = client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data).json()
        later = {
            **sample_fuel_entry_data,
            "odometer_reading": 11000,
            "fueling_date": "2025-07-15",
        }
        client.post("/api/v1/fuel-entries/", json=later)

        resp = client.put(
            f"/api/v1/fuel-entries/{first['id']}",
            json={"odometer_reading": 12000},
        )
        assert resp.status_code == 422

    def test_update_allows_equal_odometer_blend_pair(self, client, sample_fuel_entry_data):
        partial = client.post("/api/v1/fuel-entries/", json={
            **sample_fuel_entry_data,
            "fuel_type": "essence",
            "is_full_tank": False,
        }).json()
        client.post("/api/v1/fuel-entries/", json={
            **sample_fuel_entry_data,
            "fuel_type": "e85",
            "is_full_tank": True,
        })

        resp = client.put(
            f"/api/v1/fuel-entries/{partial['id']}",
            json={"odometer_reading": sample_fuel_entry_data["odometer_reading"], "liters": 5.0},
        )
        assert resp.status_code == 200
        assert resp.json()["odometer_reading"] == sample_fuel_entry_data["odometer_reading"]

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

    def test_latest_same_stop_prefers_full_tank(self, client, sample_fuel_entry_data, created_vehicle):
        client.post("/api/v1/fuel-entries/", json={
            **sample_fuel_entry_data,
            "fuel_type": "essence",
            "is_full_tank": False,
        })
        full = client.post("/api/v1/fuel-entries/", json={
            **sample_fuel_entry_data,
            "fuel_type": "e85",
            "is_full_tank": True,
        }).json()

        resp = client.get(f"/api/v1/fuel-entries/vehicle/{created_vehicle['id']}/latest")
        assert resp.status_code == 200
        assert resp.json()["id"] == full["id"]

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


class TestOdometerDecreaseOverride:
    """Success paths for the confirmed historical-correction override (2026-08-14 feature)."""

    def test_create_below_latest_with_override(self, client, created_vehicle):
        vid = created_vehicle["id"]
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": "essence", "liters": 40.0,
            "price_per_liter": 1.80, "odometer_reading": 10500,
            "fueling_date": "2025-06-01", "is_full_tank": True})

        resp = client.post("/api/v1/fuel-entries/?allow_odometer_decrease=true", json={
            "vehicle_id": vid, "fuel_type": "essence", "liters": 20.0,
            "price_per_liter": 1.80, "odometer_reading": 10300,
            "fueling_date": "2025-05-20", "is_full_tank": False})
        assert resp.status_code == 201
        assert resp.json()["odometer_reading"] == 10300

    def test_update_below_latest_with_override(self, client, created_vehicle):
        vid = created_vehicle["id"]
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": "essence", "liters": 40.0,
            "price_per_liter": 1.80, "odometer_reading": 10500,
            "fueling_date": "2025-06-01", "is_full_tank": True})
        e2 = client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": "essence", "liters": 35.0,
            "price_per_liter": 1.80, "odometer_reading": 11000,
            "fueling_date": "2025-07-01", "is_full_tank": True}).json()

        resp = client.put(f"/api/v1/fuel-entries/{e2['id']}?allow_odometer_decrease=true", json={
            "odometer_reading": 10600, "fueling_date": "2025-06-25"})
        assert resp.status_code == 200
        assert resp.json()["odometer_reading"] == 10600


class TestSameStopTiebreaker:
    def test_booster_folds_into_closing_full(self, client, created_vehicle):
        """Backend Bug 3 (2026-05-27): the (date, odometer, is_full_tank ASC, id)
        sort must feed a same-stop booster into the closing full's segment."""
        vid = created_vehicle["id"]
        entries = [
            {"odometer_reading": 10000, "liters": 40.0, "is_full_tank": True, "fueling_date": "2025-06-01"},
            {"odometer_reading": 10500, "liters": 5.0, "is_full_tank": False, "fueling_date": "2025-06-10"},
            {"odometer_reading": 10500, "liters": 40.0, "is_full_tank": True, "fueling_date": "2025-06-10"},
            {"odometer_reading": 11500, "liters": 35.0, "is_full_tank": True, "fueling_date": "2025-06-20"},
        ]
        for e in entries:
            client.post("/api/v1/fuel-entries/", json={
                "vehicle_id": vid, "fuel_type": "essence",
                "price_per_liter": 1.80, **e})

        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/consumption-history")
        data = resp.json()["data_points"]
        # Index 0 = anchor (None), 1 = display-only partial (None), 2 = the full's
        # segment, 3 = next full's segment. Booster folded in: 45 L / 500 km = 9.0
        # (a leaked booster would give 8.0).
        assert data[1]["consumption"] is None
        assert data[2]["consumption"] == 9.0
        assert data[3]["consumption"] == 3.5


class TestBoundaryInputs:
    def test_pagination_beyond_last_page_returns_empty(self, client, sample_fuel_entry_data):
        for i in range(6):
            sample_fuel_entry_data["odometer_reading"] = 10500 + i
            client.post("/api/v1/fuel-entries/", json=sample_fuel_entry_data)

        resp = client.get("/api/v1/fuel-entries/?page=4&per_page=2")
        assert resp.status_code == 200
        body = resp.json()
        assert body["entries"] == []
        assert body["pages"] == 3

    def test_zero_distance_segment_does_not_crash(self, client, created_vehicle):
        """Two fulls at the same odometer: distance 0 → segment skipped, no div-by-zero."""
        vid = created_vehicle["id"]
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": "essence", "liters": 40.0,
            "price_per_liter": 1.80, "odometer_reading": 10000,
            "fueling_date": "2025-06-01", "is_full_tank": True})
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": "essence", "liters": 35.0,
            "price_per_liter": 1.80, "odometer_reading": 10000,
            "fueling_date": "2025-06-10", "is_full_tank": True})

        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/statistics")
        assert resp.status_code == 200
        # Only the anchor exists → no valid segment → None, not a crash or a bogus number
        assert resp.json()["average_consumption"] is None


class TestStationLookup:
    """Station autocomplete (/stations) + GPS nearest-station — were untested."""

    def test_station_names_distinct_sorted_nulls_excluded(self, client, created_vehicle, sample_fuel_entry_data):
        vid = created_vehicle["id"]
        client.post("/api/v1/fuel-entries/", json={**sample_fuel_entry_data, "station_name": "TotalEnergies", "odometer_reading": 10500, "fueling_date": "2025-06-15"})
        client.post("/api/v1/fuel-entries/", json={**sample_fuel_entry_data, "station_name": "Zebra", "odometer_reading": 10600, "fueling_date": "2025-07-01"})
        client.post("/api/v1/fuel-entries/", json={**sample_fuel_entry_data, "station_name": "Zebra", "odometer_reading": 10700, "fueling_date": "2025-07-02"})
        client.post("/api/v1/fuel-entries/", json={**sample_fuel_entry_data, "station_name": None, "odometer_reading": 10800, "fueling_date": "2025-07-03"})

        resp = client.get("/api/v1/fuel-entries/stations")
        assert resp.status_code == 200
        assert resp.json() == ["TotalEnergies", "Zebra"]

    def test_station_names_filtered_by_vehicle(self, client, created_vehicle, sample_fuel_entry_data, sample_vehicle_data):
        vid = created_vehicle["id"]
        other = client.post("/api/v1/vehicles/", json={**sample_vehicle_data, "license_plate": "ZZ-999-AA"}).json()
        client.post("/api/v1/fuel-entries/", json={**sample_fuel_entry_data, "station_name": "StationA"})
        client.post("/api/v1/fuel-entries/", json={**sample_fuel_entry_data, "vehicle_id": other["id"], "station_name": "StationB", "odometer_reading": 10600, "fueling_date": "2025-07-01"})

        assert client.get("/api/v1/fuel-entries/stations").json() == ["StationA", "StationB"]
        assert client.get(f"/api/v1/fuel-entries/stations?vehicle_id={vid}").json() == ["StationA"]

    def test_station_names_empty_without_entries(self, client, created_vehicle):
        assert client.get("/api/v1/fuel-entries/stations").json() == []

    def test_nearest_station_within_radius(self, client, created_vehicle, sample_fuel_entry_data):
        vid = created_vehicle["id"]
        client.post("/api/v1/fuel-entries/", json={
            **sample_fuel_entry_data,
            "station_name": "StationGps",
            "location": "Testville",
            "latitude": 50.0,
            "longitude": 1.5,
        })
        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/nearest-station?lat=50.0005&lon=1.5")
        assert resp.status_code == 200
        body = resp.json()
        assert body["station_name"] == "StationGps"
        assert body["location"] == "Testville"
        assert body["distance_m"] < 100  # 55 m away

    def test_nearest_station_outside_radius_404(self, client, created_vehicle, sample_fuel_entry_data):
        vid = created_vehicle["id"]
        client.post("/api/v1/fuel-entries/", json={
            **sample_fuel_entry_data,
            "station_name": "StationLointaine",
            "latitude": 50.02,  # ~2.2 km away
            "longitude": 1.5,
        })
        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/nearest-station?lat=50.0&lon=1.5")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Aucune station connue à proximité"

    def test_nearest_station_ignores_entries_without_gps(self, client, created_vehicle, sample_fuel_entry_data):
        vid = created_vehicle["id"]
        client.post("/api/v1/fuel-entries/", json={**sample_fuel_entry_data, "station_name": "SansGps"})
        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/nearest-station?lat=50.0&lon=1.5")
        assert resp.status_code == 404

    def test_nearest_station_prefers_most_recent_within_radius(self, client, created_vehicle, sample_fuel_entry_data):
        vid = created_vehicle["id"]
        # Older fill 100 m away, newer fill 200 m away — both inside the 250 m
        # radius, and the endpoint walks date DESC: the newer one must win.
        client.post("/api/v1/fuel-entries/", json={
            **sample_fuel_entry_data,
            "station_name": "StationAncienne",
            "latitude": 50.0009,
            "longitude": 1.5,
            "odometer_reading": 10600,
            "fueling_date": "2025-06-10",
        })
        client.post("/api/v1/fuel-entries/", json={
            **sample_fuel_entry_data,
            "station_name": "StationRecente",
            "latitude": 50.0018,
            "longitude": 1.5,
            "odometer_reading": 10700,
            "fueling_date": "2025-06-15",
        })
        resp = client.get(f"/api/v1/fuel-entries/vehicle/{vid}/nearest-station?lat=50.0&lon=1.5")
        assert resp.status_code == 200
        assert resp.json()["station_name"] == "StationRecente"
