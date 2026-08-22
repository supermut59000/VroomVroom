"""Tests for FlexFuel conversion, E10 prices, rentability, and soft delete."""


class TestFlexfuelConversionCRUD:
    def test_create_conversion(self, client, sample_conversion_data, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        resp = client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json=sample_conversion_data)
        assert resp.status_code == 201
        data = resp.json()
        assert data["kit_cost"] == 770.0
        assert data["overconsumption_pct"] == 19.7
        assert data["vehicle_id"] == vid
        assert data["target_ethanol_pct"] == 77.0

    def test_create_conversion_unknown_vehicle(self, client, sample_conversion_data):
        sample_conversion_data["vehicle_id"] = 99999
        resp = client.post("/api/v1/flexfuel/vehicles/99999/conversion", json=sample_conversion_data)
        assert resp.status_code == 404

    def test_create_conversion_duplicate(self, client, sample_conversion_data, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json=sample_conversion_data)
        resp = client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json=sample_conversion_data)
        assert resp.status_code == 409

    def test_get_conversion(self, client, created_conversion, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        resp = client.get(f"/api/v1/flexfuel/vehicles/{vid}/conversion")
        assert resp.status_code == 200
        assert resp.json()["kit_cost"] == 770.0

    def test_get_conversion_not_found(self, client, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        resp = client.get(f"/api/v1/flexfuel/vehicles/{vid}/conversion")
        assert resp.status_code == 404

    def test_update_conversion(self, client, created_conversion, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        resp = client.put(
            f"/api/v1/flexfuel/vehicles/{vid}/conversion",
            json={"kit_cost": 850.0, "overconsumption_pct": 20.0},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["kit_cost"] == 850.0
        assert data["overconsumption_pct"] == 20.0

    def test_delete_conversion_soft(self, client, created_conversion, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        resp = client.delete(f"/api/v1/flexfuel/vehicles/{vid}/conversion")
        assert resp.status_code == 204

        # Should no longer be found (soft-deleted)
        resp = client.get(f"/api/v1/flexfuel/vehicles/{vid}/conversion")
        assert resp.status_code == 404

    def test_delete_conversion_not_found(self, client, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        resp = client.delete(f"/api/v1/flexfuel/vehicles/{vid}/conversion")
        assert resp.status_code == 404

    def test_create_conversion_invalid_kit_cost(self, client, sample_conversion_data, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        sample_conversion_data["kit_cost"] = -100.0
        resp = client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json=sample_conversion_data)
        assert resp.status_code == 422

    def test_create_conversion_overconsumption_over_100(self, client, sample_conversion_data, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        sample_conversion_data["overconsumption_pct"] = 150.0
        resp = client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json=sample_conversion_data)
        assert resp.status_code == 422

    def test_deleted_conversion_can_be_recreated(self, client, sample_conversion_data, created_flexfuel_vehicle):
        """After a soft-delete, creating a new conversion for the same vehicle must succeed."""
        vid = created_flexfuel_vehicle["id"]
        client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json=sample_conversion_data)
        client.delete(f"/api/v1/flexfuel/vehicles/{vid}/conversion")
        resp = client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json=sample_conversion_data)
        assert resp.status_code == 201


class TestE10ReferencePriceCRUD:
    def test_create_e10_price(self, client, sample_e10_price_data):
        resp = client.post("/api/v1/flexfuel/e10-prices", json=sample_e10_price_data)
        assert resp.status_code == 201
        data = resp.json()
        assert data["price_per_liter"] == 1.85
        assert data["reference_date"] == "2024-06-01"

    def test_list_e10_prices(self, client, sample_e10_price_data):
        client.post("/api/v1/flexfuel/e10-prices", json=sample_e10_price_data)
        resp = client.get("/api/v1/flexfuel/e10-prices")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_update_e10_price(self, client, sample_e10_price_data):
        create_resp = client.post("/api/v1/flexfuel/e10-prices", json=sample_e10_price_data)
        pid = create_resp.json()["id"]
        resp = client.put(f"/api/v1/flexfuel/e10-prices/{pid}", json={"price_per_liter": 1.92})
        assert resp.status_code == 200
        assert resp.json()["price_per_liter"] == 1.92

    def test_delete_e10_price_soft(self, client, sample_e10_price_data):
        create_resp = client.post("/api/v1/flexfuel/e10-prices", json=sample_e10_price_data)
        pid = create_resp.json()["id"]

        resp = client.delete(f"/api/v1/flexfuel/e10-prices/{pid}")
        assert resp.status_code == 204

        # Should be gone from the list
        prices = client.get("/api/v1/flexfuel/e10-prices").json()
        ids = [p["id"] for p in prices]
        assert pid not in ids

    def test_delete_e10_price_not_found(self, client):
        resp = client.delete("/api/v1/flexfuel/e10-prices/99999")
        assert resp.status_code == 404

    def test_list_e10_prices_sorted_desc_by_date(self, client):
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2024-05-01", "price_per_liter": 1.80})
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2024-07-01", "price_per_liter": 1.88})
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2024-06-01", "price_per_liter": 1.85})

        prices = client.get("/api/v1/flexfuel/e10-prices").json()
        dates = [p["reference_date"] for p in prices]
        assert dates == sorted(dates, reverse=True)

    def test_update_e10_price_not_found(self, client):
        resp = client.put("/api/v1/flexfuel/e10-prices/99999", json={"price_per_liter": 1.92})
        assert resp.status_code == 404

    def test_create_e10_price_zero_invalid(self, client):
        resp = client.post(
            "/api/v1/flexfuel/e10-prices",
            json={"reference_date": "2024-06-01", "price_per_liter": 0},
        )
        assert resp.status_code == 422


class TestFlexfuelRentability:
    def _create_e85_fills(self, client, vehicle_id: int):
        """Create a sequence of E85 fills after conversion."""
        fills = [
            {"vehicle_id": vehicle_id, "fuel_type": "e85", "liters": 40.0,
             "price_per_liter": 0.85, "odometer_reading": 50500,
             "fueling_date": "2024-02-01", "is_full_tank": True},
            {"vehicle_id": vehicle_id, "fuel_type": "e85", "liters": 38.0,
             "price_per_liter": 0.82, "odometer_reading": 51000,
             "fueling_date": "2024-03-01", "is_full_tank": True},
        ]
        for fill in fills:
            resp = client.post("/api/v1/fuel-entries/", json=fill)
            assert resp.status_code == 201

    def test_rentability_no_conversion(self, client, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        resp = client.get(f"/api/v1/flexfuel/vehicles/{vid}/rentability")
        assert resp.status_code == 404

    def test_rentability_no_e10_prices(self, client, created_conversion, created_flexfuel_vehicle):
        vid = created_flexfuel_vehicle["id"]
        self._create_e85_fills(client, vid)
        resp = client.get(f"/api/v1/flexfuel/vehicles/{vid}/rentability")
        assert resp.status_code == 200
        data = resp.json()
        # All fills skipped because no E10 reference price exists
        assert data["skipped_fills_no_e10_price"] == 2
        assert data["total_savings"] == 0.0

    def test_rentability_with_savings(self, client, created_conversion, created_flexfuel_vehicle, sample_e10_price_data):
        vid = created_flexfuel_vehicle["id"]
        # Add an E10 price before the fills
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2024-01-01", "price_per_liter": 1.85})
        self._create_e85_fills(client, vid)

        resp = client.get(f"/api/v1/flexfuel/vehicles/{vid}/rentability")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_e85_fills"] == 2
        assert data["skipped_fills_no_e10_price"] == 0
        assert data["total_savings"] > 0
        assert data["kit_cost"] == 770.0
        # Not yet at break-even (only 2 fills)
        assert data["break_even_reached"] is False

    def test_rentability_break_even(self, client, created_flexfuel_vehicle, sample_conversion_data):
        vid = created_flexfuel_vehicle["id"]
        # Very cheap kit to trigger break-even quickly
        sample_conversion_data["kit_cost"] = 5.0
        client.post(f"/api/v1/flexfuel/vehicles/{vid}/conversion", json=sample_conversion_data)
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2024-01-01", "price_per_liter": 1.85})
        self._create_e85_fills(client, vid)

        resp = client.get(f"/api/v1/flexfuel/vehicles/{vid}/rentability")
        assert resp.status_code == 200
        data = resp.json()
        assert data["break_even_reached"] is True
        assert data["break_even_date"] is not None

    def test_rentability_monthly_avg_excludes_current_month(
        self, client, created_conversion, created_flexfuel_vehicle
    ):
        """monthly_average_savings must exclude the current (partial) month."""
        import datetime
        vid = created_flexfuel_vehicle["id"]
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2023-01-01", "price_per_liter": 1.85})

        today = datetime.date.today().strftime("%Y-%m-%d")
        fills = [
            # Past fill (should count toward monthly average)
            {"vehicle_id": vid, "fuel_type": "e85", "liters": 40.0, "price_per_liter": 0.85,
             "odometer_reading": 50500, "fueling_date": "2024-02-01", "is_full_tank": True},
            # Current-month fill (should NOT drag the average)
            {"vehicle_id": vid, "fuel_type": "e85", "liters": 10.0, "price_per_liter": 0.85,
             "odometer_reading": 51000, "fueling_date": today, "is_full_tank": True},
        ]
        for fill in fills:
            client.post("/api/v1/fuel-entries/", json=fill)

        resp = client.get(f"/api/v1/flexfuel/vehicles/{vid}/rentability")
        data = resp.json()
        # monthly_average_savings = completed savings / full months since conversion
        # Feb-2024 fill savings: 40/1.197 × 1.85 − 40×0.85 = 27.82 (asserted exactly)
        # The current-month fill (dated today) must NOT be in completed_savings.
        import datetime as dt
        today_obj = dt.date.today()
        months_elapsed = (today_obj.year - 2024) * 12 + (today_obj.month - 1)
        assert months_elapsed > 0
        # Unrounded formula matches the service: (40/1.197×1.85) − 34 = 27.8212…
        feb_savings = (40 / 1.197) * 1.85 - 34.0
        expected = round(feb_savings / months_elapsed, 2)
        assert data["monthly_average_savings"] == expected

    def test_soft_deleted_e85_fill_excluded_from_rentability(
        self, client, created_conversion, created_flexfuel_vehicle
    ):
        """Regression: soft-deleted E85 entries must NOT be included.
        Bug: calculate_rentability was missing is_active == True filter."""
        vid = created_flexfuel_vehicle["id"]
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2024-01-01", "price_per_liter": 1.85})

        entry_id = client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": "e85", "liters": 40.0,
            "price_per_liter": 0.85, "odometer_reading": 50500,
            "fueling_date": "2024-02-01", "is_full_tank": True,
        }).json()["id"]

        before = client.get(f"/api/v1/flexfuel/vehicles/{vid}/rentability").json()
        assert before["total_e85_fills"] == 1
        assert before["total_savings"] > 0

        client.delete(f"/api/v1/fuel-entries/{entry_id}")

        after = client.get(f"/api/v1/flexfuel/vehicles/{vid}/rentability").json()
        assert after["total_e85_fills"] == 0
        assert after["total_savings"] == 0.0

    def test_savings_formula_accuracy(self, client, created_conversion, created_flexfuel_vehicle):
        """Verify: equivalent_e10 = e85_liters / (1 + opc/100); savings = equiv * e10_price - actual."""
        vid = created_flexfuel_vehicle["id"]
        e10_price, opc = 1.90, 19.7
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2024-01-01", "price_per_liter": e10_price})
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": "e85", "liters": 45.0,
            "price_per_liter": 0.82, "odometer_reading": 50500,
            "fueling_date": "2024-02-01", "is_full_tank": True,
        })

        dp = client.get(f"/api/v1/flexfuel/vehicles/{vid}/rentability").json()["data_points"][0]
        expected_equiv = 45.0 / (1 + opc / 100)
        expected_savings = expected_equiv * e10_price - 45.0 * 0.82

        assert abs(dp["equivalent_e10_liters"] - expected_equiv) < 0.01
        assert abs(dp["savings"] - expected_savings) < 0.01

    def test_fill_before_conversion_date_excluded(self, client, created_conversion, created_flexfuel_vehicle):
        """E85 fills dated before conversion_date (2024-01-15) must not be counted."""
        vid = created_flexfuel_vehicle["id"]
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2023-06-01", "price_per_liter": 1.75})
        # Fill on 2024-01-01 — before conversion_date 2024-01-15
        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": "e85", "liters": 30.0,
            "price_per_liter": 0.79, "odometer_reading": 50200,
            "fueling_date": "2024-01-01", "is_full_tank": True,
        })
        data = client.get(f"/api/v1/flexfuel/vehicles/{vid}/rentability").json()
        assert data["total_e85_fills"] == 0

    def test_uses_most_recent_e10_price_before_fill_date(self, client, created_conversion, created_flexfuel_vehicle):
        """The most recent E10 price on or before the fill date is used — not a future price."""
        vid = created_flexfuel_vehicle["id"]
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2024-01-01", "price_per_liter": 1.80})
        # Later price, after the fill date — must NOT be used
        client.post("/api/v1/flexfuel/e10-prices", json={"reference_date": "2024-09-01", "price_per_liter": 1.99})

        client.post("/api/v1/fuel-entries/", json={
            "vehicle_id": vid, "fuel_type": "e85", "liters": 40.0,
            "price_per_liter": 0.85, "odometer_reading": 50500,
            "fueling_date": "2024-02-01", "is_full_tank": True,
        })

        dp = client.get(f"/api/v1/flexfuel/vehicles/{vid}/rentability").json()["data_points"][0]
        assert dp["e10_reference_price"] == 1.80
