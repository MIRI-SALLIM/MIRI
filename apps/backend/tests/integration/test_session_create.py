from datetime import timedelta, timezone

from fastapi.testclient import TestClient

import main as main_module
from main import app


def test_create_session_persists_digest_and_recovers_active_session():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
            headers={"Idempotency-Key": "integration-create"},
        )

        assert response.status_code == 201
        assert "HttpOnly" in response.headers["set-cookie"]
        assert "SameSite=lax" in response.headers["set-cookie"]
        assert "Path=/" in response.headers["set-cookie"]

        session_id = response.json()["id"]
        document = main_module._session_repository._memory[session_id]
        participant = document["participants"][0]
        assert participant["tokenHash"]
        assert "token" not in participant
        assert len(participant["answers"]) == 5
        assert len(participant["guesses"]) == 5
        assert document["questionSetVersion"] == "light-v1"
        assert document["expiresAt"] - document["createdAt"] == timedelta(days=7)

        repeated = client.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
            headers={"Idempotency-Key": "integration-create"},
        )
        assert repeated.status_code == 201
        assert repeated.json()["id"] == session_id

        recovered = client.get("/api/v1/me/session")
        assert recovered.status_code == 200
        assert recovered.json()["id"] == session_id


def test_invitation_code_uses_plan_alphabet_and_expiry_is_utc():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
        )

        assert response.status_code == 201
        code = response.json()["invitationCode"]
        assert code.startswith("INV-")
        assert len(code) == 12
        assert all(character in "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" for character in code[4:])

        document = main_module._session_repository._memory[response.json()["id"]]
        assert document["createdAt"].tzinfo == timezone.utc
        assert document["expiresAt"].tzinfo == timezone.utc


def test_join_uses_the_question_count_pinned_on_the_session():
    creator = TestClient(app)
    partner = TestClient(app)
    original_config = None
    try:
        created = creator.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
        )
        assert created.status_code == 201
        session_id = created.json()["id"]

        original_config = main_module._config_cache.get("light_questions")
        main_module._config_cache["light_questions"] = {"questions": [{"id": "changed"}]}
        joined = partner.post(
            f"/api/v1/invitations/{created.json()['invitationCode']}/join",
            json={"nickname": "partner"},
        )
        assert joined.status_code == 200
        document = main_module._session_repository._memory[session_id]
        assert len(document["participants"][1]["answers"]) == 5
        assert len(document["participants"][1]["guesses"]) == 5
    finally:
        if original_config is not None:
            main_module._config_cache["light_questions"] = original_config
        else:
            main_module._config_cache.pop("light_questions", None)
        creator.close()
        partner.close()
