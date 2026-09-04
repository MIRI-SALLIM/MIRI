import asyncio
from datetime import datetime, timezone

import pytest

from deep.errors import DeepError
from deep.meeting.contracts import SaveMeetingAnswers
from deep.meeting.storage import MeetingStorage
from tests.integration.test_deep_sessions import headers
from tests.integration.test_deep_v3 import ready
from tests.integration.test_meeting import both_ready


@pytest.mark.parametrize("same_actor", [False, True])
def test_concurrent_updates_preserve_partner_data_and_reject_stale_own_revision(deep_context, monkeypatch, same_actor):
    client, repo, _ = deep_context
    path, _ = ready(client)
    session_id = path.split("/")[-1]

    async def run():
        barrier = asyncio.Event()
        entered = 0
        commit = repo._commit

        async def competing_commit(document, fields, now, extra=None):
            nonlocal entered
            entered += 1
            if entered <= 2:
                if entered == 2:
                    barrier.set()
                await barrier.wait()
            return await commit(document, fields, now, extra)

        monkeypatch.setattr(repo, "_commit", competing_commit)
        store = MeetingStorage(repo)
        request = SaveMeetingAnswers.model_validate({"expectedRound": 1, "planVersion": 2, "expectedRevision": 0,
            "answers": {"contributionMeaning": "initialProposal", "adjustableMonthlyWon": 1_000_000}})
        results = await asyncio.gather(*(store.save_answers(session_id, user, request, datetime.now(timezone.utc))
            for user in ("user-a", "user-a" if same_actor else "user-b")), return_exceptions=True)
        if same_actor:
            assert sum(isinstance(result, dict) for result in results) == 1
            assert sum(isinstance(result, DeepError) and result.code == "REVISION_CONFLICT" for result in results) == 1
        else:
            assert all(isinstance(result, dict) for result in results)
            for user in ("user-a", "user-b"):
                mine = await store.get_own(session_id, user, datetime.now(timezone.utc))
                assert mine["revision"] == 1 and mine["answers"]["adjustableMonthlyWon"] == 1_000_000

    asyncio.run(run())


def test_withdraw_retry_erases_meeting_data_on_an_already_closed_session(deep_context):
    client, repo, db = deep_context
    path, _ = ready(client)
    both_ready(client, path)
    row = next(row for row in db["deep_sessions"].documents if row["id"] == path.split("/")[-1])
    row["status"] = "closed"
    asyncio.run(repo.withdraw(row["id"], "user-a", datetime.now(timezone.utc)))
    assert row.get("meeting") is None


def test_stale_report_bound_answers_are_not_reused_after_a_new_round(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client)
    both_ready(client, path)
    for user in ("user-a", "user-b"):
        assert client.post(path + "/rounds", json={"expectedRound": 1}, headers=headers(user)).status_code == 200
    for user in ("user-a", "user-b"):
        assert client.post(path + "/plan/confirm", json={"planVersion": 3}, headers=headers(user)).status_code == 200
        assert client.post(path + "/me/submit", json={"expectedRevision": 2, "planVersion": 3,
            "consentVersion": "deep-sharing-v2", "shareFinance": True, "shareValues": True}, headers=headers(user)).status_code == 200
    assert client.get(path + "/result").json()["status"] == "ready"
    mine = client.get(path + "/meeting/me").json()
    assert mine["round"] == 2 and mine["revision"] == 0 and mine["answers"] is None and mine["consent"] is None
    assert client.get(path + "/meeting/context").json() == {"status": "waiting"}
