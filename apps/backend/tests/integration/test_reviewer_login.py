import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from auth.dependencies import get_auth_repository
from auth.repository import AuthRepository
from main import app
from tests.mongo_fakes import MemoryDatabase
from tests.unit.test_reviewer_auth import reviewer_env

ORIGIN = {"Origin": "http://testserver"}
BASE = "/api/v1/auth/reviewer"


@pytest.fixture
def review_context(monkeypatch):
    env = {**reviewer_env(), "ENVIRONMENT": "test"}
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    db = MemoryDatabase()
    repo = AuthRepository(db)
    asyncio.run(repo.ensure_indexes())
    app.dependency_overrides[get_auth_repository] = lambda: repo
    with TestClient(app) as client:
        yield client, repo, db


def sign_in(client, role="a", code=None):
    payload = {"username": f"judge-{role}", "password": f"synthetic-password-{role}"}
    if code is not None:
        payload["roomCode"] = code
    response = client.post(BASE + "/login", json=payload, headers=ORIGIN)
    assert response.status_code == 200, response.text
    return response.json(), response.cookies.get("mrs_account")


def headers(token, **extra):
    return {**ORIGIN, "Cookie": f"mrs_account={token}", **extra}


def test_reviewer_login_creates_isolated_users_and_restores_with_room_code(review_context):
    client, _, db = review_context
    a, token_a = sign_in(client)
    b, token_b = sign_in(client, "b", a["roomCode"])
    restored, _ = sign_in(client, "a", a["roomCode"])
    other, _ = sign_in(client)
    assert restored["userId"] == a["userId"] != b["userId"]
    assert other["userId"] not in {a["userId"], b["userId"]}
    assert a["role"] == "A" and b["role"] == "B" and a["demo"] is True
    assert a["roomCode"] == b["roomCode"] != other["roomCode"]
    assert client.get("/api/v1/auth/me", headers=headers(token_a)).json() == {"userId": a["userId"]}
    assert client.get(BASE + "/context", headers=headers(token_b)).json()["role"] == "B"
    assert client.get("/api/v1/auth/kakao/start").status_code == 404
    stored = repr([c.documents for c in db.collections.values()])
    assert "synthetic-password" not in stored and a["roomCode"] not in stored and token_a not in stored


def test_wrong_password_origin_and_validation_never_echo_secrets(review_context):
    client, _, db = review_context
    payload = {"username": "judge-a", "password": "private-wrong-password"}
    response = client.post(BASE + "/login", json=payload, headers=ORIGIN)
    assert response.status_code == 401
    assert "private-wrong-password" not in response.text
    assert db["users"].documents == []
    assert client.post(BASE + "/login", json=payload).status_code == 403
    payload["password"] = "secret-value" * 100
    response = client.post(BASE + "/login", json=payload, headers=ORIGIN)
    assert response.status_code == 422
    assert "secret-value" not in response.text


def test_reset_invalidates_both_old_logins_and_keeps_other_room(review_context):
    client, _, db = review_context
    a, ta = sign_in(client)
    _, tb = sign_in(client, "b", a["roomCode"])
    other, tother = sign_in(client)
    assert client.post(BASE + "/reset", json={"confirm": False}, headers=headers(ta)).status_code == 422
    reset = client.post(BASE + "/reset", json={"confirm": True}, headers=headers(ta))
    assert reset.status_code == 200
    assert reset.json()["roomCode"] not in {a["roomCode"], other["roomCode"]}
    for token in (ta, tb):
        assert client.get("/api/v1/auth/me", headers=headers(token)).status_code == 401
    assert client.get("/api/v1/auth/me", headers=headers(tother)).status_code == 200
    response = client.post(BASE + "/login", json={"username": "judge-b", "password": "synthetic-password-b",
                                                "roomCode": a["roomCode"]}, headers=ORIGIN)
    assert response.status_code == 401
    assert len(db["reviewer_rooms"].documents) == 3


def test_room_expiry_and_feature_disable_revoke_existing_sessions(review_context, monkeypatch):
    client, _, db = review_context
    _, token = sign_in(client)
    monkeypatch.setenv("REVIEWER_LOGIN_ENABLED", "false")
    monkeypatch.setenv("KAKAO_LOGIN_ENABLED", "true")
    monkeypatch.setenv("KAKAO_REST_API_KEY", "key")
    monkeypatch.setenv("KAKAO_CLIENT_SECRET", "secret")
    assert client.get("/api/v1/auth/me", headers=headers(token)).status_code == 401
    monkeypatch.setenv("REVIEWER_LOGIN_ENABLED", "true")
    db["reviewer_rooms"].documents[0]["expiresAt"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert client.get("/api/v1/auth/me", headers=headers(token)).status_code == 401


def test_rotating_passwords_revokes_existing_reviewer_sessions(review_context, monkeypatch):
    from tests.unit.test_reviewer_auth import encoded

    client, _, _ = review_context
    _, token = sign_in(client)
    monkeypatch.setenv("REVIEWER_A_PASSWORD_HASH", encoded("a-new-synthetic-password"))
    assert client.get("/api/v1/auth/me", headers=headers(token)).status_code == 401


def test_password_attempts_rate_limited_before_hashing(review_context):
    client, _, _ = review_context
    for i in range(20):
        response = client.post(BASE + "/login", json={"username": "judge-a", "password": "wrong"},
                               headers={**ORIGIN, "X-Forwarded-For": f"10.0.0.{i}"})
        assert response.status_code == 401
    assert client.post(BASE + "/login", json={"username": "judge-a", "password": "wrong"}, headers=ORIGIN).status_code == 429


def test_login_cookie_is_private_and_preserves_light_cookie(review_context):
    client, _, _ = review_context
    client.cookies.set("mrs_participant", "light-cookie")
    response = client.post(BASE + "/login", json={"username": "judge-a", "password": "synthetic-password-a"}, headers=ORIGIN)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Domain=" not in cookie
    assert "no-store" in response.headers["cache-control"]
    assert client.cookies.get("mrs_participant") == "light-cookie"


def create_deep(client, token, key="one"):
    response = client.post("/api/v1/deep/sessions", json={}, headers=headers(token, **{"Idempotency-Key": key}))
    assert response.status_code == 201, response.text
    return response.json()


def test_demo_join_blocks_other_rooms_and_real_users_both_directions(review_context):
    client, repo, db = review_context
    a, ta = sign_in(client)
    _, tb = sign_in(client, "b", a["roomCode"])
    _, other_token = sign_in(client, "b")
    deep = create_deep(client, ta)
    join = f"/api/v1/deep/invitations/{deep['invitationCode']}/join"
    assert client.post(join, json={}, headers=headers(other_token, **{"Idempotency-Key": "other"})).status_code == 404

    async def real_user():
        from auth.security import token_digest
        now = datetime.now(timezone.utc)
        principal = await repo.upsert_user("synthetic-kakao", now)
        await repo.issue_session(principal.user_id, token_digest("real-user-token", "p" * 32), now)
    asyncio.run(real_user())
    assert client.post(join, json={}, headers=headers("real-user-token", **{"Idempotency-Key": "real"})).status_code == 404
    real_deep = create_deep(client, "real-user-token")
    assert client.post(f"/api/v1/deep/invitations/{real_deep['invitationCode']}/join", json={},
                       headers=headers(tb, **{"Idempotency-Key": "wrong-scope"})).status_code == 404
    assert client.post(join, json={}, headers=headers(tb, **{"Idempotency-Key": "same-room"})).status_code == 200
    assert client.get(f"/api/v1/deep/sessions/{deep['id']}/status", headers=headers(other_token)).status_code == 404
    # Reset is forbidden to an ordinary account, even when it knows reviewer endpoints.
    assert client.post(BASE + "/reset", json={"confirm": True}, headers=headers("real-user-token")).status_code == 403
    room = db["reviewer_rooms"].documents[0]
    stored = next(d for d in db["deep_sessions"].documents if d["id"] == deep["id"])
    assert stored["expiresAt"] <= room["expiresAt"]


def test_room_close_denies_repository_access_even_after_prior_authentication(review_context):
    from deep.errors import DeepError
    from deep.repository import DeepRepository

    client, _, db = review_context
    a, ta = sign_in(client)
    deep = create_deep(client, ta)
    db["reviewer_rooms"].documents[0]["status"] = "closed"

    async def stale_read():
        with pytest.raises(DeepError):
            await DeepRepository(db).get_for_member(deep["id"], a["userId"], datetime.now(timezone.utc))
    asyncio.run(stale_read())


def test_expired_deleted_reviewer_identity_is_not_treated_as_real_user(review_context):
    from deep.errors import DeepError
    from deep.repository import DeepRepository

    client, _, db = review_context
    a, _ = sign_in(client)

    async def stale_identity():
        await db["users"].delete_one({"id": a["userId"]})
        with pytest.raises(DeepError):
            await DeepRepository(db).create(a["userId"], "stale", "payload", datetime.now(timezone.utc))
    asyncio.run(stale_identity())


def test_reviewers_can_complete_deep_with_report_expiry_and_agreement(review_context):
    from tests.deep_factory import sample_input
    from tests.integration.test_deep_submit import submission

    client, _, db = review_context
    a, ta = sign_in(client)
    _, tb = sign_in(client, "b", a["roomCode"])
    deep = create_deep(client, ta)
    assert client.post(f"/api/v1/deep/invitations/{deep['invitationCode']}/join", json={},
                       headers=headers(tb, **{"Idempotency-Key": "join"})).status_code == 200
    path = f"/api/v1/deep/sessions/{deep['id']}"
    for token in (ta, tb):
        assert client.patch(path + "/me/input", json={"expectedRevision": 0, "input": sample_input()},
                            headers=headers(token)).status_code == 200
        assert client.post(path + "/plan/confirm", json={"planVersion": 1}, headers=headers(token)).status_code == 200
    for token in (ta, tb):
        assert client.post(path + "/me/submit", json=submission(), headers=headers(token)).status_code == 200
    result = client.get(path + "/result", headers=headers(ta))
    assert result.status_code == 200 and result.json()["status"] == "ready"
    room = db["reviewer_rooms"].documents[0]
    assert db["deep_reports"].documents[0]["expiresAt"] <= room["expiresAt"]
    agreement = client.post(path + "/agreements", json={"expectedRound": 1,
                                                       "text": "매월 함께 생활비를 점검한다"}, headers=headers(ta))
    assert agreement.status_code == 201, agreement.text
    item = agreement.json()
    for token in (ta, tb):
        confirmed = client.post(path + f"/agreements/{item['id']}/confirm", json={"expectedVersion": item["version"]},
                                headers=headers(token))
        assert confirmed.status_code == 200, confirmed.text
    for token in (ta, tb):
        assert client.post(path + "/rounds", json={"expectedRound": 1}, headers=headers(token)).status_code == 200
    stored = next(d for d in db["deep_sessions"].documents if d["id"] == deep["id"])
    assert stored["expiresAt"] <= room["expiresAt"]
    assert client.post(BASE + "/reset", json={"confirm": True}, headers=headers(tb)).status_code == 200
    assert client.get(path + "/result", headers=headers(ta)).status_code == 401


def test_concurrent_reset_makes_only_one_replacement_room(review_context):
    import httpx

    client, _, db = review_context
    a, ta = sign_in(client)
    _, tb = sign_in(client, "b", a["roomCode"])

    async def race():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as http:
            results = await asyncio.gather(*[http.post(BASE + "/reset", json={"confirm": True}, headers=headers(token))
                                             for token in (ta, tb, ta, tb)])
            assert sum(r.status_code == 200 for r in results) == 1
            assert all(r.status_code in {200, 401, 409} for r in results)
    asyncio.run(race())
    assert len(db["reviewer_rooms"].documents) == 2


def test_reset_partial_failure_closes_old_room_and_fresh_login_recovers(review_context, monkeypatch):
    from pymongo.errors import ConnectionFailure

    client, _, db = review_context
    a, ta = sign_in(client)
    _, tb = sign_in(client, "b", a["roomCode"])

    async def broken_insert(document):
        raise ConnectionFailure("synthetic-private-database-details")

    with monkeypatch.context() as patch:
        patch.setattr(db["users"], "insert_one", broken_insert)
        result = client.post(BASE + "/reset", json={"confirm": True}, headers=headers(ta))
    assert result.status_code == 503
    assert "synthetic-private" not in result.text
    assert client.get("/api/v1/auth/me", headers=headers(tb)).status_code == 401
    recovered, _ = sign_in(client)
    assert recovered["roomCode"] != a["roomCode"]
