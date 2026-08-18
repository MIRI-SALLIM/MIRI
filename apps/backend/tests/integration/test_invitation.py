from datetime import timedelta

import main as main_module
from fastapi.testclient import TestClient
from main import app
from services.session_repository import utc_now


def test_invitation_preview_is_safe_and_unavailable_codes_are_neutral():
    creator = TestClient(app)
    guest = TestClient(app)
    try:
        created = creator.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
        )
        assert created.status_code == 201
        code = created.json()["invitationCode"]

        preview = guest.get(f"/api/v1/invitations/{code}")
        assert preview.status_code == 200
        assert set(preview.json()) == {"mode", "duration", "expiresAt"}

        invalid = guest.get("/api/v1/invitations/INV-NOT-FOUND")
        assert invalid.status_code == 404
        invalid_error = invalid.json()["error"]
        assert invalid_error["code"] == "INVITATION_NOT_FOUND"

        joined = guest.post(
            f"/api/v1/invitations/{code}/join",
            json={"nickname": "guest"},
        )
        assert joined.status_code == 200
        full = guest.get(f"/api/v1/invitations/{code}")
        assert full.status_code == 404
        assert full.json()["error"] == invalid_error

        expired_created = creator.post(
            "/api/v1/sessions",
            json={"nickname": "expired", "mode": "light"},
        )
        assert expired_created.status_code == 201
        expired_id = expired_created.json()["id"]
        expired_code = expired_created.json()["invitationCode"]
        repository = main_module._session_repository
        assert repository is not None
        repository._memory[expired_id]["expiresAt"] = utc_now() - timedelta(seconds=1)

        expired = guest.get(f"/api/v1/invitations/{expired_code}")
        assert expired.status_code == 404
        assert expired.json()["error"] == invalid_error
    finally:
        creator.close()
        guest.close()


def test_only_one_guest_can_join_a_session():
    creator = TestClient(app)
    guest_a = TestClient(app)
    guest_b = TestClient(app)
    try:
        created = creator.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
        )
        assert created.status_code == 201
        code = created.json()["invitationCode"]

        first = guest_a.post(
            f"/api/v1/invitations/{code}/join",
            json={"nickname": "guest-a"},
        )
        second = guest_b.post(
            f"/api/v1/invitations/{code}/join",
            json={"nickname": "guest-b"},
        )
        assert first.status_code == 200
        assert second.status_code == 409
        assert second.json()["error"]["code"] == "SESSION_ALREADY_JOINED"

        repository = main_module._session_repository
        assert repository is not None
        assert len(repository._memory[created.json()["id"]]["participants"]) == 2
    finally:
        creator.close()
        guest_a.close()
        guest_b.close()


def test_joining_an_expired_invitation_is_neutral():
    creator = TestClient(app)
    guest = TestClient(app)
    try:
        created = creator.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
        )
        assert created.status_code == 201
        session_id = created.json()["id"]
        code = created.json()["invitationCode"]
        repository = main_module._session_repository
        assert repository is not None
        repository._memory[session_id]["expiresAt"] = utc_now() - timedelta(seconds=1)

        response = guest.post(
            f"/api/v1/invitations/{code}/join",
            json={"nickname": "guest"},
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "INVITATION_NOT_FOUND"
    finally:
        creator.close()
        guest.close()
