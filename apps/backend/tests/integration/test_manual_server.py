import pytest
from fastapi.testclient import TestClient

from tests.manual_server import create_app


def test_manual_server_rejects_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="local"):
        create_app()


def test_manual_server_uses_real_auth_and_no_external_services(monkeypatch):
    import os
    monkeypatch.setattr(os, "environ", os.environ.copy())
    monkeypatch.setenv("ENVIRONMENT", "test")
    app = create_app()
    origin = {"Origin": "http://127.0.0.1:5173"}
    with TestClient(app) as client:
        assert client.get("/api/v1/auth/me").status_code == 401
        path = "/api/v1/auth/reviewer/login"
        assert client.post(path, json={"username": "judge-a", "password": "wrong"}, headers=origin).status_code == 401
        response = client.post(path, json={"username": "judge-a", "password": "synthetic-password-a"}, headers=origin)
        assert response.status_code == 200
        assert client.get("/api/v1/auth/me").json()["userId"] == response.json()["userId"]
        assert client.get("/api/v1/auth/kakao/start").status_code == 404
        session = client.post("/api/v1/deep/v3/sessions", json={}, headers={**origin, "Idempotency-Key": "manual-test-create"})
        assert session.status_code == 201, session.text
    assert os.environ["DEEP_MEETING_AI_ENABLED"] == "false"
    assert os.environ["OPENAI_API_KEY"] == ""
    assert os.environ["MONGODB_URI"] == ""
