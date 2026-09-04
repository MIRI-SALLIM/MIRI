import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from pymongo.errors import ConnectionFailure

from auth.dependencies import get_auth_repository, require_account
from auth.models import Principal
from auth.repository import AuthRepository
from deep.service import DeepService
from main import app
from tests.deep_factory import sample_input
from tests.integration.test_deep_privacy import complete
from tests.integration.test_deep_sessions import create, headers
from tests.integration.test_deep_submit import prepare, submission


def ready(client):
    sid = prepare(client)
    complete(client, sid)
    assert client.get(f"/api/v1/deep/sessions/{sid}/result").json()["status"] == "ready"
    return sid


def test_round_read_exposes_only_current_round_and_request_booleans(deep_context):
    client, _, _ = deep_context
    sid = ready(client)
    path = f"/api/v1/deep/sessions/{sid}/rounds"
    assert client.get(path).json() == {"round": 1, "myRequested": False, "partnerRequested": False}
    client.post(path, json={"expectedRound": 1}, headers=headers())
    assert client.get(path, headers=headers("user-b")).json() == {"round": 1, "myRequested": False, "partnerRequested": True}
    assert client.get(path, headers=headers("user-c")).status_code == 404
    client.post(path, json={"expectedRound": 1}, headers=headers("user-b"))
    assert client.get(path).json() == {"round": 2, "myRequested": False, "partnerRequested": False}


def test_stale_agreement_form_cannot_be_applied_to_a_later_round(deep_context):
    client, _, db = deep_context
    sid = ready(client)
    base = f"/api/v1/deep/sessions/{sid}"
    for user in ("user-a", "user-b"):
        client.post(base + "/rounds", json={"expectedRound": 1}, headers=headers(user))
    for user in ("user-a", "user-b"):
        assert client.post(base + "/plan/confirm", json={"planVersion": 2}, headers=headers(user)).status_code == 200
        payload = submission() | {"expectedRevision": 2, "planVersion": 2}
        assert client.post(base + "/me/submit", json=payload, headers=headers(user)).status_code == 200
    assert client.get(base + "/result").json()["status"] == "ready"
    stale = client.post(base + "/agreements", json={"expectedRound": 1, "text": "old-round-text"}, headers=headers())
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "ROUND_VERSION_CONFLICT"
    assert db["deep_agreements"].documents == []
    current = client.post(base + "/agreements", json={"expectedRound": 2, "text": "current-round-text"}, headers=headers())
    assert current.status_code == 201 and current.json()["round"] == 2


def test_agreement_confirm_edit_and_defer_require_current_version_and_two_people(deep_context):
    client, _, _ = deep_context
    sid = ready(client)
    base = f"/api/v1/deep/sessions/{sid}/agreements"
    response = client.post(base, json={"expectedRound": 1, "text": "월 공동비를 정한다", "reviewOn": None}, headers=headers())
    assert response.status_code == 201
    aid = response.json()["id"]
    path = base + "/" + aid
    for user, status in (("user-a", "proposed"), ("user-b", "agreed")):
        response = client.post(path + "/confirm", json={"expectedVersion": 1}, headers=headers(user))
        assert response.status_code == 200 and response.json()["status"] == status
    changed = client.patch(path, json={"expectedVersion": 1, "text": "공동비는 다음 달 재검토", "reviewOn": None}, headers=headers())
    assert changed.status_code == 200 and changed.json()["version"] == 2
    assert not changed.json()["myConfirmed"] and not changed.json()["partnerConfirmed"]
    assert client.post(path + "/confirm", json={"expectedVersion": 1}, headers=headers("user-b")).status_code == 409
    deferred = client.post(path + "/defer", json={"expectedVersion": 2}, headers=headers("user-b"))
    assert deferred.json()["version"] == 3 and deferred.json()["status"] == "deferred"
    assert client.get(base, headers=headers("user-c")).status_code == 404
    assert "participants" not in client.get(base).text


def test_new_round_requires_both_and_invalidates_stale_input_plan_and_report(deep_context):
    client, _, db = deep_context
    sid = ready(client)
    base = f"/api/v1/deep/sessions/{sid}"
    one = client.post(base + "/rounds", json={"expectedRound": 1}, headers=headers())
    assert one.status_code == 200 and one.json() == {"round": 1, "pending": True}
    assert db["deep_sessions"].documents[0]["status"] == "ready"
    two = client.post(base + "/rounds", json={"expectedRound": 1}, headers=headers("user-b"))
    assert two.status_code == 200 and two.json() == {"round": 2, "pending": False}
    doc = db["deep_sessions"].documents[0]
    assert doc["reportId"] is None and doc["members"]["A"]["consent"] is None
    assert doc["members"]["A"]["input"]["income"]["monthlyNetIncome"]["value"] == 3000000
    assert client.patch(base + "/me/input", json={"expectedRevision": 1, "input": sample_input()}, headers=headers()).status_code == 409
    assert client.post(base + "/me/submit", json=submission(), headers=headers()).status_code == 409
    assert client.get(base + "/result").json()["status"] == "waiting"


def test_withdraw_closes_before_purging_reports_and_is_retryable(deep_context, monkeypatch):
    client, _, db = deep_context
    sid = ready(client)
    base = f"/api/v1/deep/sessions/{sid}"
    collection = db["deep_reports"]
    original = collection.delete_many

    async def failed(*args, **kwargs):
        raise ConnectionFailure("PRIVATE-URI")

    monkeypatch.setattr(collection, "delete_many", failed)
    assert client.post(base + "/withdraw", json={}, headers=headers()).status_code == 503
    assert db["deep_sessions"].documents[0]["status"] == "closed"
    assert client.get(base + "/result", headers=headers("user-b")).status_code == 410
    monkeypatch.setattr(collection, "delete_many", original)
    assert client.post(base + "/withdraw", json={}, headers=headers()).status_code == 200
    assert db["deep_reports"].documents == []


def test_withdraw_during_report_creation_never_publishes_or_leaves_late_cache(deep_context, monkeypatch):
    client, repo, db = deep_context
    sid = prepare(client)
    complete(client, sid)
    original = repo.store_report

    async def withdrawn_store(session_id, stamp, report, expires_at):
        await repo.withdraw(session_id, "user-a", datetime.now(timezone.utc))
        return await original(session_id, stamp, report, expires_at)

    monkeypatch.setattr(repo, "store_report", withdrawn_store)

    async def run():
        with pytest.raises(Exception, match="SESSION_EXPIRED_OR_CLOSED"):
            await DeepService(repo).result(sid, "user-b")
        assert db["deep_reports"].documents == []
        assert db["deep_sessions"].documents[0]["reportId"] is None

    asyncio.run(run())


def test_account_delete_requires_recent_login_and_does_not_delete_partner_independent_data(deep_context):
    client, _, db = deep_context
    sid = ready(client)
    other = create(client, key="independent", user="user-b")
    account_repo = AuthRepository(db)
    app.dependency_overrides[get_auth_repository] = lambda: account_repo
    for user in ("user-a", "user-b"):
        asyncio.run(db["users"].insert_one({"id": user}))
    asyncio.run(account_repo.issue_session("user-a", "hash-a", datetime.now(timezone.utc)))
    app.dependency_overrides[require_account] = lambda: Principal("user-a", datetime.now(timezone.utc) - timedelta(minutes=11))
    assert client.delete("/api/v1/auth/account", headers=headers()).status_code == 401
    app.dependency_overrides[require_account] = lambda: Principal("user-a", datetime.now(timezone.utc))
    assert client.delete("/api/v1/auth/account", headers=headers()).status_code == 204
    assert asyncio.run(db["users"].find_one({"id": "user-a"})) is None
    assert asyncio.run(db["users"].find_one({"id": "user-b"})) is not None
    mine = asyncio.run(db["deep_sessions"].find_one({"id": sid}))
    assert mine["status"] == "closed" and mine["members"]["A"]["input"] == {}
    independent = asyncio.run(db["deep_sessions"].find_one({"id": other["id"]}))
    assert independent["status"] == "collecting"
    assert asyncio.run(db["auth_sessions"].find_one({"userId": "user-a"})) is None


def test_deletion_marker_blocks_partner_access_even_if_cleanup_fails(deep_context, monkeypatch):
    client, repo, _ = deep_context
    sid = ready(client)

    async def failed(*args, **kwargs):
        raise ConnectionFailure("PRIVATE-URI")

    monkeypatch.setattr(repo, "withdraw", failed)

    async def run():
        with pytest.raises(ConnectionFailure):
            await repo.delete_account_data("user-a", datetime.now(timezone.utc))
        with pytest.raises(Exception, match="SESSION_EXPIRED_OR_CLOSED"):
            await repo.get_for_member(sid, "user-b", datetime.now(timezone.utc))
        with pytest.raises(Exception, match="ACCOUNT_DELETION_PENDING"):
            await repo.create("user-a", "new", "payload", datetime.now(timezone.utc))

    asyncio.run(run())
