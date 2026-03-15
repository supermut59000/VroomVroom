"""Tests for API key authentication."""


class TestAPIKeyAuth:
    def test_request_without_key_returns_403(self, client_with_auth):
        resp = client_with_auth.get("/api/v1/vehicles/")
        assert resp.status_code == 403
        assert "Clé API" in resp.json()["detail"]

    def test_request_with_wrong_key_returns_403(self, client_with_auth):
        resp = client_with_auth.get(
            "/api/v1/vehicles/",
            headers={"X-API-Key": "wrong-key"},
        )
        assert resp.status_code == 403

    def test_request_with_valid_key_succeeds(self, client_with_auth):
        resp = client_with_auth.get(
            "/api/v1/vehicles/",
            headers={"X-API-Key": "test-secret-key"},
        )
        assert resp.status_code == 200

    def test_health_endpoint_no_auth_required(self, client_with_auth):
        """Health and root endpoints are outside the API router — no auth needed."""
        resp = client_with_auth.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"

    def test_docs_no_auth_required(self, client_with_auth):
        resp = client_with_auth.get("/docs")
        assert resp.status_code == 200

    def test_auth_disabled_when_key_empty(self, client):
        """When API_KEY is empty, all requests should pass without auth."""
        resp = client.get("/api/v1/vehicles/")
        assert resp.status_code == 200
