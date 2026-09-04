from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from pymongo.errors import ConnectionFailure

from main import app
from tests.deep_factory import known, sample_input, sample_plan

ORIGIN = {"Origin": "http://testserver"}


def headers(user="user-a", key="create-a"):
    return {**ORIGIN, "X-Test-User": user, "Idempotency-Key": key}


def create(client, key="create-a", user="user-a"):
    response = client.post("/api/v1/deep/sessions", json={}, headers=headers(user, key))
    assert response.status_code == 201, response.text
    return response.json()


def join(client, created, user="user-b"):
    return client.post(f'/api/v1/deep/invitations/{created["invitationCode"]}/join', json={}, headers=headers(user, "join-b"))


def test_created_session_recovers_only_own_input_and_retries_are_idempotent(deep_context):
    client, _, _ = deep_context
    created = create(client)
    assert create(client) == created
    assert set(created) == {"id", "role", "round", "invitationCode", "questionVersion"}
    assert created["questionVersion"] == "deep-v2"
    own = client.get(f'/api/v1/deep/sessions/{created["id"]}/me/input').json()
    assert set(own) == {"revision", "input"}
    assert own["revision"] == 0
    assert "guesses" not in own["input"]
    assert own["input"]["income"]["monthlyNetIncome"]["status"] == "unknown"


def test_self_invite_third_account_and_client_role_injection_are_rejected(deep_context):
    client, _, _ = deep_context
    created = create(client)
    assert join(client, created, "user-a").status_code == 409
    assert join(client, created).status_code == 200
    assert join(client, created).status_code == 200
    assert join(client, created, "user-c").status_code == 409
    assert client.post("/api/v1/deep/sessions", json={"userId": "user-c", "role": "B"}, headers=headers()).status_code == 422


def test_private_drafts_and_revision_conflicts_never_expose_partner_input(deep_context):
    client, _, _ = deep_context
    created = create(client)
    assert join(client, created).status_code == 200
    path = f'/api/v1/deep/sessions/{created["id"]}/me/input'
    data = sample_input()
    data["income"]["monthlyNetIncome"] = known(1234567)
    data["contextNotes"]["D1"] = "PRIVATE-ONLY-A"
    saved = client.patch(path, json={"expectedRevision": 0, "input": data}, headers=headers())
    assert saved.status_code == 200 and saved.json()["revision"] == 1
    assert client.patch(path, json={"expectedRevision": 0, "input": data}, headers=headers()).status_code == 409
    partner = client.get(path, headers=headers("user-b"))
    assert "PRIVATE-ONLY-A" not in partner.text and "1234567" not in partner.text
    assert client.get(path, headers=headers("user-c")).status_code == 404
    assert client.get(f'/api/v1/deep/sessions/{created["id"]}/members/A/input', headers=headers("user-b")).status_code == 404


def test_plan_edit_resets_both_confirmations_and_checks_version(deep_context):
    client, _, _ = deep_context
    created = create(client)
    join(client, created)
    path = f'/api/v1/deep/sessions/{created["id"]}/plan'
    for user in ("user-a", "user-b"):
        assert client.post(path + "/confirm", json={"planVersion": 1}, headers=headers(user)).status_code == 200
    before = client.get(path).json()
    assert before["myConfirmed"] and before["partnerConfirmed"]
    changed = client.patch(path, json={"expectedVersion": 1, "plan": sample_plan()}, headers=headers("user-b"))
    assert changed.status_code == 200
    assert changed.json()["version"] == 2
    assert not changed.json()["myConfirmed"] and not changed.json()["partnerConfirmed"]
    assert client.post(path + "/confirm", json={"planVersion": 1}, headers=headers()).status_code == 409


def test_origin_and_idempotency_key_are_required_for_mutations(deep_context):
    client, _, _ = deep_context
    assert client.post("/api/v1/deep/sessions", json={}, headers={"Idempotency-Key": "x"}).status_code == 403
    assert client.post("/api/v1/deep/sessions", json={}, headers=ORIGIN).status_code == 422


def test_logical_expiry_hides_invites_and_blocks_member_access_before_ttl_cleanup(deep_context):
    client, _, db = deep_context
    created = create(client)
    db["deep_sessions"].documents[0]["expiresAt"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert join(client, created).status_code == 404
    assert client.get(f'/api/v1/deep/sessions/{created["id"]}/me/input').status_code == 410


def test_authenticated_questions_default_to_v2_and_keep_v1_read_only(deep_context):
    client, _, _ = deep_context
    response = client.get("/api/v1/deep/questions")
    assert response.status_code == 200
    assert response.json()["version"] == "deep-v2"
    assert len(response.json()["questions"]) == 10
    assert len(client.get("/api/v1/deep/questions?version=deep-v1").json()["questions"]) == 8
    assert client.get("/api/v1/deep/questions?version=other").status_code == 404


def test_disabled_deep_and_light_cookie_do_not_authenticate(monkeypatch):
    with TestClient(app) as client:
        monkeypatch.setenv("DEEP_MODE_ENABLED", "false")
        assert client.get("/api/v1/deep/questions").status_code == 404
        for key, value in {"DEEP_MODE_ENABLED": "true", "KAKAO_REST_API_KEY": "test-key", "KAKAO_CLIENT_SECRET": "test-secret",
                           "PUBLIC_APP_ORIGIN": "http://testserver", "AUTH_SESSION_PEPPER": "p" * 32}.items():
            monkeypatch.setenv(key, value)
        assert client.get("/api/v1/deep/questions", headers={"Cookie": "mrs_participant=light"}).status_code == 401
        assert client.post("/api/v1/sessions", json={"mode": "deep"}).status_code == 422


def test_database_failure_returns_safe_503(deep_context, monkeypatch):
    client, repo, _ = deep_context

    async def broken(*args, **kwargs):
        raise ConnectionFailure("PRIVATE-DATABASE-URI")

    monkeypatch.setattr(repo, "create", broken)
    response = client.post("/api/v1/deep/sessions", json={}, headers=headers())
    assert response.status_code == 503
    assert "PRIVATE-DATABASE-URI" not in response.text


def test_join_rate_limit_cannot_be_bypassed_with_forwarded_header(deep_context):
    client, _, _ = deep_context
    created = create(client)
    for index in range(20):
        response = client.post(f'/api/v1/deep/invitations/{created["invitationCode"]}/join', json={},
                               headers={**headers("user-b", "join-b"), "X-Forwarded-For": f"10.0.0.{index}"})
        assert response.status_code == 200
    assert join(client, created).status_code == 429
