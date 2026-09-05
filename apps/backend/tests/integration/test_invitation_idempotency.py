from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import main as main_module
from main import app
from services.session_repository import utc_now


def test_lost_join_cookie_is_recovered_without_replacing_participant_or_answers():
    with TestClient(app) as client:
        created = client.post("/api/v1/sessions", json={}).json()
        path = f"/api/v1/invitations/{created['invitationCode']}/join"
        headers = {"Idempotency-Key": str(uuid4())}
        first = client.post(path, json={"nickname": "guest"}, headers=headers)
        assert first.status_code == 200
        cookie = first.cookies[main_module.PARTICIPANT_COOKIE_NAME]
        client.cookies.clear()  # The first Set-Cookie never reached the browser.

        replay = client.post(path, json={"nickname": "guest"}, headers=headers)
        assert replay.status_code == 200
        assert replay.cookies[main_module.PARTICIPANT_COOKIE_NAME] == cookie
        assert replay.json() == first.json()
        assert "HttpOnly" in replay.headers["set-cookie"]
        assert "SameSite=lax" in replay.headers["set-cookie"]
        assert client.get("/api/v1/me/session").json()["myRole"] == "invitee"

        input_path = f"/api/v1/sessions/{created['id']}/me/input"
        assert client.patch(input_path, json={"answers": [0, 1, 2, 3, 0], "guesses": [None] * 5}).status_code == 200
        assert client.post(path, json={"nickname": "guest"}, headers=headers).status_code == 200
        assert client.get(input_path).json()["answers"] == [0, 1, 2, 3, 0]
        stored = main_module._session_repository._memory[created["id"]]
        assert len(stored["participants"]) == 2
        assert cookie.split(":", 1)[1] not in repr(stored)
        assert headers["Idempotency-Key"] not in repr(stored)
        assert headers["Idempotency-Key"] not in replay.text


@pytest.mark.parametrize("change", ["key", "nickname", "no-key"])
def test_join_recovery_does_not_admit_another_request(change):
    with TestClient(app) as client:
        created = client.post("/api/v1/sessions", json={}).json()
        path = f"/api/v1/invitations/{created['invitationCode']}/join"
        headers = {"Idempotency-Key": str(uuid4())}
        assert client.post(path, json={"nickname": "guest"}, headers=headers).status_code == 200
        client.cookies.clear()
        if change == "key":
            headers = {"Idempotency-Key": str(uuid4())}
        elif change == "no-key":
            headers = {}
        denied = client.post(path, json={"nickname": "other" if change == "nickname" else "guest"}, headers=headers)
        assert denied.status_code == 409
        assert denied.json()["error"]["code"] == "SESSION_ALREADY_JOINED"
        assert "set-cookie" not in denied.headers
        assert client.get("/api/v1/me/session").status_code == 401


def test_replay_does_not_reopen_an_expired_invitation():
    with TestClient(app) as client:
        created = client.post("/api/v1/sessions", json={}).json()
        path = f"/api/v1/invitations/{created['invitationCode']}/join"
        headers = {"Idempotency-Key": str(uuid4())}
        assert client.post(path, json={}, headers=headers).status_code == 200
        main_module._session_repository._memory[created["id"]]["expiresAt"] = utc_now() - timedelta(seconds=1)
        client.cookies.clear()
        denied = client.post(path, json={}, headers=headers)
        assert denied.status_code == 404
        assert "set-cookie" not in denied.headers


def test_join_recovery_key_is_scoped_to_the_session():
    with TestClient(app) as client:
        headers = {"Idempotency-Key": str(uuid4())}
        cookies = []
        for _ in range(2):
            created = client.post("/api/v1/sessions", json={}).json()
            path = f"/api/v1/invitations/{created['invitationCode']}/join"
            response = client.post(path, json={}, headers=headers)
            assert response.status_code == 200
            cookies.append(response.cookies[main_module.PARTICIPANT_COOKIE_NAME].split(":", 1)[1])
        assert cookies[0] != cookies[1]
