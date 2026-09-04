import asyncio
from datetime import datetime, timezone

from deep.service import DeepService
from tests.integration.test_deep_sessions import headers
from tests.integration.test_deep_submit import prepare, submission


def complete(client, sid, share_finance=True, share_values=True):
    for user in ("user-a", "user-b"):
        assert client.post(f"/api/v1/deep/sessions/{sid}/me/submit", json=submission(share_finance, share_values), headers=headers(user)).status_code == 200


def test_waiting_result_contains_no_input_or_interim_score(deep_context):
    client, _, _ = deep_context
    sid = prepare(client)
    assert client.post(f"/api/v1/deep/sessions/{sid}/me/submit", json=submission(), headers=headers()).status_code == 200
    response = client.get(f"/api/v1/deep/sessions/{sid}/result", headers=headers("user-b"))
    assert response.status_code == 200
    assert response.json() == {"status": "waiting", "partnerCompleted": True}


def test_ready_result_is_identical_for_both_members_and_cached_once(deep_context):
    client, _, db = deep_context
    sid = prepare(client)
    complete(client, sid)
    path = f"/api/v1/deep/sessions/{sid}/result"
    a = client.get(path, headers=headers())
    b = client.get(path, headers=headers("user-b"))
    assert a.status_code == b.status_code == 200
    assert a.json() == b.json()
    assert a.json()["status"] == "ready"
    assert "no-store" in a.headers["cache-control"]
    assert "contextNotes" not in a.text and "providerUserId" not in a.text
    assert len(db["deep_reports"].documents) == 1
    assert client.get(path, headers=headers("user-c")).status_code == 404
    expires = db["deep_sessions"].documents[0]["expiresAt"]
    assert db["deep_reports"].documents[0]["expiresAt"] == expires
    client.get(path)
    assert db["deep_sessions"].documents[0]["expiresAt"] == expires


def test_opted_out_finance_is_unavailable_in_http_result(deep_context):
    client, _, _ = deep_context
    sid = prepare(client)
    complete(client, sid, share_finance=False)
    response = client.get(f"/api/v1/deep/sessions/{sid}/result")
    assert response.status_code == 200
    assert response.json()["report"]["cashflow"]["reason"] == "sharing_not_authorized"
    assert "6000000" not in response.text


def test_concurrent_report_requests_share_one_immutable_report_without_loser_deleting_it(deep_context):
    client, repo, db = deep_context
    sid = prepare(client)
    complete(client, sid)

    async def run():
        service = DeepService(repo)
        results = await asyncio.gather(service.result(sid, "user-a"), service.result(sid, "user-b"))
        assert results[0] == results[1]
        assert results[0]["status"] == "ready"
        assert len(db["deep_reports"].documents) == 1
        document = await repo.get_for_member(sid, "user-a", datetime.now(timezone.utc))
        assert document["reportId"] == db["deep_reports"].documents[0]["id"]

    asyncio.run(run())
