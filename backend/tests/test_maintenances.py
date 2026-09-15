"""Tests for maintenance CRUD endpoints."""


class TestMaintenanceCRUD:
    def test_create_maintenance(self, client, sample_maintenance_data):
        resp = client.post("/api/v1/maintenances/", json=sample_maintenance_data)
        assert resp.status_code == 201
        data = resp.json()
        assert data["maintenance_type"] == "vidange"
        assert data["cost"] == 89.90
        assert data["service_provider"] == "Speedy"
        assert data["next_maintenance_date"] == "2026-06-15"
        assert data["next_maintenance_odometer"] == 25000
        assert "id" in data

    def test_create_maintenance_missing_fields(self, client, created_vehicle):
        resp = client.post("/api/v1/maintenances/", json={
            "vehicle_id": created_vehicle["id"],
        })
        assert resp.status_code == 422

    def test_get_maintenance_by_id(self, client, sample_maintenance_data):
        create_resp = client.post("/api/v1/maintenances/", json=sample_maintenance_data)
        entry_id = create_resp.json()["id"]

        resp = client.get(f"/api/v1/maintenances/{entry_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == entry_id

    def test_get_maintenance_not_found(self, client):
        resp = client.get("/api/v1/maintenances/99999")
        assert resp.status_code == 404

    def test_update_maintenance(self, client, sample_maintenance_data):
        create_resp = client.post("/api/v1/maintenances/", json=sample_maintenance_data)
        entry_id = create_resp.json()["id"]

        resp = client.put(f"/api/v1/maintenances/{entry_id}", json={"cost": 120.00})
        assert resp.status_code == 200
        assert resp.json()["cost"] == 120.00

    def test_update_maintenance_rejects_odometer_below_initial(
        self, client, sample_maintenance_data
    ):
        entry_id = client.post("/api/v1/maintenances/", json=sample_maintenance_data).json()["id"]

        resp = client.put(
            f"/api/v1/maintenances/{entry_id}",
            json={"odometer_reading": 1},
        )
        assert resp.status_code == 422

    def test_delete_maintenance(self, client, sample_maintenance_data):
        create_resp = client.post("/api/v1/maintenances/", json=sample_maintenance_data)
        entry_id = create_resp.json()["id"]

        resp = client.delete(f"/api/v1/maintenances/{entry_id}")
        assert resp.status_code == 204

        resp = client.get(f"/api/v1/maintenances/{entry_id}")
        assert resp.status_code == 404


class TestMaintenanceByVehicle:
    def test_list_by_vehicle(self, client, sample_maintenance_data, created_vehicle):
        client.post("/api/v1/maintenances/", json=sample_maintenance_data)

        resp = client.get(f"/api/v1/maintenances/vehicle/{created_vehicle['id']}")
        assert resp.status_code == 200
        entries = resp.json()
        assert len(entries) >= 1
        assert all(e["vehicle_id"] == created_vehicle["id"] for e in entries)

    def test_statistics_by_vehicle(self, client, sample_maintenance_data, created_vehicle):
        client.post("/api/v1/maintenances/", json=sample_maintenance_data)

        # Add a second maintenance
        second = sample_maintenance_data.copy()
        second["maintenance_type"] = "freins"
        second["cost"] = 250.00
        second["odometer_reading"] = 15000
        second["maintenance_date"] = "2025-09-01"
        client.post("/api/v1/maintenances/", json=second)

        resp = client.get(f"/api/v1/maintenances/vehicle/{created_vehicle['id']}/statistics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_entries"] == 2
        assert data["total_cost"] == 89.90 + 250.00


class TestMaintenanceTypes:
    def test_all_maintenance_types(self, client, created_vehicle):
        types = [
            "vidange", "rotation_pneus", "freins", "changement_pneus",
            "batterie", "filtre_air", "bougies", "courroie_distribution",
            "controle_technique", "autre",
        ]
        for mt in types:
            resp = client.post("/api/v1/maintenances/", json={
                "vehicle_id": created_vehicle["id"],
                "maintenance_type": mt,
                "cost": 50.0,
                "odometer_reading": 10000,
                "maintenance_date": "2025-06-15",
            })
            assert resp.status_code == 201, f"Failed to create maintenance type: {mt}"

    def test_custom_maintenance_type_accepted(self, client, created_vehicle):
        # maintenance_type is deliberately free text (see
        # migrations/maintenance_type_to_varchar.sql) — user-defined types
        # like "lavomatique" must be accepted.
        resp = client.post("/api/v1/maintenances/", json={
            "vehicle_id": created_vehicle["id"],
            "maintenance_type": "lavomatique",
            "cost": 50.0,
            "odometer_reading": 10000,
            "maintenance_date": "2025-06-15",
        })
        assert resp.status_code == 201
        assert resp.json()["maintenance_type"] == "lavomatique"

    def test_maintenance_odometer_below_initial_rejected(self, client, created_vehicle):
        resp = client.post("/api/v1/maintenances/", json={
            "vehicle_id": created_vehicle["id"],
            "maintenance_type": "vidange",
            "cost": 50.0,
            "odometer_reading": 1,
            "maintenance_date": "2025-06-15",
        })
        assert resp.status_code == 422


class TestMaintenanceListEndpoint:
    """GET /api/v1/maintenances/ — filters, pagination, ordering."""

    def _create(self, client, base, **overrides):
        payload = {**base, **overrides}
        resp = client.post("/api/v1/maintenances/", json=payload)
        assert resp.status_code == 201
        return resp.json()

    def test_list_structure(self, client, sample_maintenance_data):
        self._create(client, sample_maintenance_data)
        resp = client.get("/api/v1/maintenances/")
        assert resp.status_code == 200
        data = resp.json()
        assert set(data) >= {"entries", "total", "page", "per_page", "pages"}
        assert data["total"] >= 1
        assert data["page"] == 1

    def test_list_filters_by_type_and_vehicle(self, client, sample_maintenance_data):
        self._create(client, sample_maintenance_data, maintenance_type="vidange")
        self._create(client, sample_maintenance_data, maintenance_type="freins")

        resp = client.get(
            f"/api/v1/maintenances/?vehicle_id={sample_maintenance_data['vehicle_id']}"
            f"&maintenance_type=vidange"
        )
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        assert all(e["maintenance_type"] == "vidange" for e in entries)

    def test_list_filters_by_date_range(self, client, sample_maintenance_data):
        self._create(client, sample_maintenance_data, maintenance_date="2025-01-10")
        self._create(client, sample_maintenance_data, maintenance_type="freins", maintenance_date="2025-06-15")

        resp = client.get(
            "/api/v1/maintenances/?start_date=2025-06-01&end_date=2025-06-30"
        )
        entries = resp.json()["entries"]
        assert all(e["maintenance_date"] >= "2025-06-01" for e in entries)
        assert any(e["maintenance_type"] == "freins" for e in entries)
        assert not any(e["maintenance_date"] == "2025-01-10" for e in entries)

    def test_list_pagination_and_asc_order(self, client, sample_maintenance_data):
        self._create(client, sample_maintenance_data, maintenance_date="2025-01-10")
        self._create(client, sample_maintenance_data, maintenance_type="freins", maintenance_date="2025-03-10")
        self._create(client, sample_maintenance_data, maintenance_type="batterie", maintenance_date="2025-05-10")

        page1 = client.get(
            "/api/v1/maintenances/?page=1&per_page=2&order_by=maintenance_date&order=asc"
        ).json()
        assert page1["per_page"] == 2
        assert page1["total"] >= 3
        assert page1["pages"] >= 2
        dates = [e["maintenance_date"] for e in page1["entries"]]
        assert dates == sorted(dates)

        page2 = client.get(
            "/api/v1/maintenances/?page=2&per_page=2&order_by=maintenance_date&order=asc"
        ).json()
        assert page2["page"] == 2
        first_ids = {e["id"] for e in page1["entries"]}
        assert not first_ids & {e["id"] for e in page2["entries"]}


class TestMaintenanceEdgeCases:
    def test_create_unknown_vehicle_422(self, client):
        resp = client.post("/api/v1/maintenances/", json={
            "vehicle_id": 99999,
            "maintenance_type": "vidange",
            "cost": 50.0,
            "odometer_reading": 10000,
            "maintenance_date": "2025-06-15",
        })
        assert resp.status_code == 422

    def test_update_unknown_404(self, client):
        resp = client.put("/api/v1/maintenances/99999", json={"cost": 10.0})
        assert resp.status_code == 404

    def test_delete_unknown_404(self, client):
        resp = client.delete("/api/v1/maintenances/99999")
        assert resp.status_code == 404

    def test_latest_no_entries_404(self, client, created_vehicle):
        resp = client.get(f"/api/v1/maintenances/vehicle/{created_vehicle['id']}/latest")
        assert resp.status_code == 404

    def test_latest_returns_most_recent(self, client, sample_maintenance_data):
        older = client.post("/api/v1/maintenances/", json={
            **sample_maintenance_data, "maintenance_type": "vidange", "maintenance_date": "2025-01-10"
        }).json()
        newer = client.post("/api/v1/maintenances/", json={
            **sample_maintenance_data, "maintenance_type": "freins", "maintenance_date": "2025-09-01"
        }).json()
        vid = sample_maintenance_data["vehicle_id"]
        resp = client.get(f"/api/v1/maintenances/vehicle/{vid}/latest")
        assert resp.status_code == 200
        assert resp.json()["id"] == newer["id"]

    def test_statistics_empty(self, client, created_vehicle):
        resp = client.get(f"/api/v1/maintenances/vehicle/{created_vehicle['id']}/statistics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_entries"] == 0
        assert data["total_cost"] == 0
        assert data["next_maintenance_date"] is None


class TestMaintenanceServerErrorHandlers:
    """The generic `except Exception → 500` branches must not leak."""

    def test_create_500(self, client, monkeypatch, sample_maintenance_data):
        from app.services.maintenance_service import MaintenanceService

        def boom(self, maintenance):
            raise RuntimeError("db down")

        monkeypatch.setattr(MaintenanceService, "create_maintenance", boom)
        resp = client.post("/api/v1/maintenances/", json=sample_maintenance_data)
        assert resp.status_code == 500

    def test_list_500(self, client, monkeypatch):
        from app.services.maintenance_service import MaintenanceService

        def boom(self, **kwargs):
            raise RuntimeError("db down")

        monkeypatch.setattr(MaintenanceService, "get_maintenances", boom)
        resp = client.get("/api/v1/maintenances/")
        assert resp.status_code == 500

    def test_by_vehicle_500(self, client, monkeypatch, created_vehicle):
        from app.services.maintenance_service import MaintenanceService

        def boom(self, **kwargs):
            raise RuntimeError("db down")

        monkeypatch.setattr(MaintenanceService, "get_maintenances_by_vehicle", boom)
        resp = client.get(f"/api/v1/maintenances/vehicle/{created_vehicle['id']}")
        assert resp.status_code == 500

    def test_statistics_500(self, client, monkeypatch, created_vehicle):
        from app.services.maintenance_service import MaintenanceService

        def boom(self, vehicle_id):
            raise RuntimeError("db down")

        monkeypatch.setattr(MaintenanceService, "get_maintenance_statistics_by_vehicle", boom)
        resp = client.get(f"/api/v1/maintenances/vehicle/{created_vehicle['id']}/statistics")
        assert resp.status_code == 500
