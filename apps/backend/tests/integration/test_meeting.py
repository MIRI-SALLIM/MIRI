import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from tests.integration.test_deep_sessions import headers
from tests.integration.test_deep_v3 import ready, start


def save(client, path, user="user-a", revision=0, **answers):
    return client.patch(path + "/meeting/me", headers=headers(user), json={
        "expectedRound": 1, "planVersion": 2, "expectedRevision": revision,
        "answers": {"contributionMeaning": "initialProposal", "adjustableMonthlyWon": 1_000_000, **answers},
    })


def consent(client, path, user="user-a", revision=1, **overrides):
    return client.post(path + "/meeting/me/consent", headers=headers(user), json={
        "expectedRound": 1, "planVersion": 2, "expectedRevision": revision,
        "consentVersion": "money-meeting-consent-v2", "shareWithPartner": True, "allowAiProcessing": True, **overrides,
    })


def both_ready(client, path):
    for user in ("user-a", "user-b"):
        assert save(client, path, user).status_code == 200
        assert consent(client, path, user).status_code == 200


def test_own_answers_are_private_until_both_explicit_permissions(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client)
    response = client.get(path + "/meeting/me")
    assert response.status_code == 200, response.text
    mine = response.json()
    assert mine["revision"] == 0 and mine["answers"] is None and mine["consent"] is None
    assert len(mine["questions"]) == 2
    assert client.get(path + "/meeting/context").json() == {"status": "waiting"}
    assert save(client, path).status_code == 200
    partner = client.get(path + "/meeting/me", headers=headers("user-b")).json()
    assert partner == mine
    assert consent(client, path, allowAiProcessing=False).status_code == 200
    assert save(client, path, "user-b", adjustableMonthlyWon=900_000).status_code == 200
    assert consent(client, path, "user-b").status_code == 200
    assert client.get(path + "/meeting/context").json() == {"status": "waiting"}
    assert consent(client, path, revision=2).status_code == 200
    response = client.get(path + "/meeting/context")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "ready" and data["providerStatus"] == "disabled"
    assert data["clarifications"]["A"]["adjustableMonthlyWon"] == 1_000_000
    assert data["clarifications"]["B"]["adjustableMonthlyWon"] == 900_000
    assert next(row["valueWon"] for row in data["brief"]["facts"] if row["id"] == "contribution_gap") == 400_000
    assert "SECRET-PRIVATE-NOTE" not in response.text and "user-a" not in response.text


def test_edit_and_revoke_invalidate_consent_and_stale_grants(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client)
    both_ready(client, path)
    edited = save(client, path, revision=2, adjustableMonthlyWon=1_100_000)
    assert edited.status_code == 200
    assert edited.json()["consent"] is None and edited.json()["revision"] == 3
    assert client.get(path + "/meeting/context").json() == {"status": "waiting"}
    assert consent(client, path, revision=2).status_code == 409
    assert consent(client, path, revision=3).status_code == 200
    revoked = client.delete(path + "/meeting/me/consent", headers=headers())
    assert revoked.status_code == 200 and revoked.json()["revision"] == 5
    assert client.delete(path + "/meeting/me/consent", headers=headers()).json() == revoked.json()
    assert consent(client, path, revision=4).status_code == 409
    assert client.get(path + "/meeting/context").json() == {"status": "waiting"}


@pytest.mark.parametrize("answers", [
    {"adjustableMonthlyWon": True}, {"adjustableMonthlyWon": "1000000"}, {"adjustableMonthlyWon": 1.0},
    {"adjustableMonthlyWon": -1}, {"adjustableMonthlyWon": 2**53}, {"adjustableMonthlyWon": 799_999},
    {"contributionMeaning": "unknown"}, {"contributionMeaning": "selfReportedLimit"},
    {"privateNote": "SECRET-INJECTION"},
])
def test_invalid_or_contradictory_answer_is_not_saved(deep_context, answers):
    client, _, _ = deep_context
    path, _ = ready(client)
    response = save(client, path, **answers)
    assert response.status_code == 422, response.text
    assert "SECRET-INJECTION" not in response.text
    assert client.get(path + "/meeting/me").json()["revision"] == 0


@pytest.mark.parametrize("overrides,code", [
    ({"expectedRevision": 0}, 409), ({"expectedRound": 2}, 409), ({"planVersion": 1}, 409),
    ({"consentVersion": "future"}, 422), ({"shareWithPartner": False}, 422),
    ({"allowAiProcessing": "true"}, 422),
])
def test_consent_cannot_apply_to_wrong_revision_or_scope(deep_context, overrides, code):
    client, _, _ = deep_context
    path, _ = ready(client)
    assert save(client, path).status_code == 200
    assert consent(client, path, **overrides).status_code == code
    assert client.get(path + "/meeting/me").json()["consent"] is None


def test_unknown_adjustment_remains_explicit(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client)
    assert save(client, path, contributionMeaning="unknown", adjustableMonthlyWon=None).status_code == 200
    assert consent(client, path).status_code == 200
    assert client.get(path + "/meeting/me").json()["answers"]["adjustableMonthlyWon"] is None


def test_unpublished_and_nonmember_guards(deep_context):
    client, _, _ = deep_context
    draft = start(client)
    assert client.get(draft + "/meeting/me").status_code == 409
    assert client.get(draft + "/meeting/me", headers=headers("outsider")).status_code == 404


def test_unshared_finances_are_not_used(deep_context):
    client, _, _ = deep_context
    private, _ = ready(client, finance=False)
    assert client.get(private + "/meeting/me").status_code == 409


def test_expiry_and_origin_guards(deep_context):
    client, _, db = deep_context
    path, _ = ready(client)
    assert client.post(path + "/meeting/me/consent", json={}, headers={"Origin": "https://evil.invalid"}).status_code == 403
    assert client.get(path.replace("/v3", "") + "/meeting/me").status_code == 404
    row = next(row for row in db["deep_sessions"].documents if row["id"] == path.split("/")[-1])
    row["expiresAt"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert client.get(path + "/meeting/me").status_code == 410


def test_new_round_clears_additional_data(deep_context):
    client, _, db = deep_context
    path, _ = ready(client)
    both_ready(client, path)
    for user in ("user-a", "user-b"):
        assert client.post(path + "/rounds", json={"expectedRound": 1}, headers=headers(user)).status_code == 200
    row = next(row for row in db["deep_sessions"].documents if row["id"] == path.split("/")[-1])
    assert row.get("meeting") is None
    assert client.get(path + "/meeting/context").status_code == 409


def test_withdraw_clears_additional_data(deep_context):
    client, _, db = deep_context
    path, _ = ready(client)
    both_ready(client, path)
    assert client.post(path + "/withdraw", json={}, headers=headers()).status_code == 200
    row = next(row for row in db["deep_sessions"].documents if row["id"] == path.split("/")[-1])
    assert row.get("meeting") is None
    assert client.get(path + "/meeting/context").status_code == 410


def test_revocation_during_context_read_prevents_response(deep_context, monkeypatch):
    from deep.meeting.storage import MeetingStorage

    client, repo, _ = deep_context
    path, _ = ready(client)
    both_ready(client, path)
    load = repo.load_report_for_member

    async def revoke_before_return(session_id, user_id, now):
        report = await load(session_id, user_id, now)
        await MeetingStorage(repo).revoke_consent(session_id, "user-b", now)
        return report

    monkeypatch.setattr(repo, "load_report_for_member", revoke_before_return)
    response = client.get(path + "/meeting/context")
    assert response.status_code == 409 and "clarifications" not in response.text


def test_account_deletion_blocks_meeting_reads(deep_context):
    client, repo, db = deep_context
    path, _ = ready(client)
    both_ready(client, path)
    asyncio.run(repo.delete_account_data("user-a", datetime.now(timezone.utc)))
    assert client.get(path + "/meeting/context", headers=headers("user-b")).status_code == 410
    row = next(row for row in db["deep_sessions"].documents if row["id"] == path.split("/")[-1])
    assert row.get("meeting") is None
