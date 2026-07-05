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
