import asyncio
from datetime import datetime, timezone

import pytest

from tests.deep_factory import sample_input, sample_plan
from tests.integration.test_deep_sessions import create, headers, join


def prepare(client):
    created = create(client)
    assert join(client, created).status_code == 200
    sid = created["id"]
    input_path = f"/api/v1/deep/sessions/{sid}/me/input"
    plan_path = f"/api/v1/deep/sessions/{sid}/plan/confirm"
    for user in ("user-a", "user-b"):
        assert client.patch(input_path, json={"expectedRevision": 0, "input": sample_input()}, headers=headers(user)).status_code == 200
        assert client.post(plan_path, json={"planVersion": 1}, headers=headers(user)).status_code == 200
    return sid


def submission(share_finance=True, share_values=True):
    return {"expectedRevision": 1, "planVersion": 1, "consentVersion": "deep-sharing-v1",
            "shareFinance": share_finance, "shareValues": share_values}


def test_submit_requires_complete_answers_and_current_plan_confirmation(deep_context):
    client, _, _ = deep_context
    created = create(client)
    path = f'/api/v1/deep/sessions/{created["id"]}/me/input'
    assert client.patch(path, json={"expectedRevision": 0, "input": sample_input()}, headers=headers()).status_code == 200
    submit_path = f'/api/v1/deep/sessions/{created["id"]}/me/submit'
    assert client.post(submit_path, json=submission(), headers=headers()).status_code == 409
    assert client.post(f'/api/v1/deep/sessions/{created["id"]}/plan/confirm', json={"planVersion": 1}, headers=headers()).status_code == 200
    incomplete = sample_input()
    incomplete["values"].pop("D1")
    assert client.patch(path, json={"expectedRevision": 1, "input": incomplete}, headers=headers()).status_code == 200
    response = client.post(submit_path, json={**submission(), "expectedRevision": 2}, headers=headers())
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INPUT_INCOMPLETE"
    assert "values.D1" in response.json()["error"]["fieldErrors"]


def test_single_submit_returns_only_safe_status_and_locks_own_input_and_plan(deep_context):
    client, _, _ = deep_context
    sid = prepare(client)
    submit_path = f"/api/v1/deep/sessions/{sid}/me/submit"
    assert client.post(submit_path, json=submission(), headers=headers()).status_code == 200
    response = client.get(f"/api/v1/deep/sessions/{sid}/status", headers=headers())
    assert response.json() == {"status": "waiting", "partnerCompleted": False, "mySubmitted": True}
    assert client.patch(f"/api/v1/deep/sessions/{sid}/me/input",
                        json={"expectedRevision": 1, "input": sample_input()}, headers=headers()).status_code == 409
    assert client.patch(f"/api/v1/deep/sessions/{sid}/plan",
                        json={"expectedVersion": 1, "plan": sample_plan()}, headers=headers("user-b")).status_code == 409
    assert "monthlyNetIncome" not in response.text and "importantAreas" not in response.text


def test_identical_submit_retry_is_idempotent_but_scope_change_is_rejected(deep_context):
    client, _, _ = deep_context
    sid = prepare(client)
    path = f"/api/v1/deep/sessions/{sid}/me/submit"
    assert client.post(path, json=submission(), headers=headers()).status_code == 200
    assert client.post(path, json=submission(), headers=headers()).status_code == 200
    assert client.post(path, json=submission(share_finance=False), headers=headers()).status_code == 409


def test_both_submit_with_opt_out_is_publishable_but_scope_is_preserved(deep_context):
    client, repo, _ = deep_context
    sid = prepare(client)
    path = f"/api/v1/deep/sessions/{sid}/me/submit"
    for user in ("user-a", "user-b"):
        assert client.post(path, json=submission(share_finance=False), headers=headers(user)).status_code == 200
    status = client.get(f"/api/v1/deep/sessions/{sid}/status").json()
    assert status == {"status": "waiting", "partnerCompleted": True, "mySubmitted": True}
    document = asyncio.run(repo.get_for_member(sid, "user-a", datetime.now(timezone.utc)))
    assert document["members"]["A"]["consent"]["shareFinance"] is False
    assert document["members"]["B"]["consent"]["shareFinance"] is False


def test_simultaneous_participants_can_submit_without_losing_one_consent(deep_context):
    client, repo, _ = deep_context
    sid = prepare(client)

    async def run():
        now = datetime.now(timezone.utc)
        consent = {"version": "deep-sharing-v1", "shareFinance": True, "shareValues": True}
        results = await asyncio.gather(repo.submit(sid, "user-a", 1, 1, consent, now),
                                       repo.submit(sid, "user-b", 1, 1, consent, now))
        assert all(item["members"]["A"]["submittedAt"] or item["members"]["B"]["submittedAt"] for item in results)
        final = await repo.get_for_member(sid, "user-a", now)
        assert final["members"]["A"]["submittedAt"] and final["members"]["B"]["submittedAt"]

    asyncio.run(run())


@pytest.mark.parametrize("field,value,status", [("expectedRevision", 0, 409), ("planVersion", 2, 409), ("consentVersion", "other", 422)])
def test_submit_rejects_stale_revision_plan_or_consent_version(deep_context, field, value, status):
    client, _, _ = deep_context
    sid = prepare(client)
    response = client.post(f"/api/v1/deep/sessions/{sid}/me/submit", json={**submission(), field: value}, headers=headers())
    assert response.status_code == status
