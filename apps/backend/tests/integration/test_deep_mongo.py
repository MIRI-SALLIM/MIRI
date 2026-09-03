"""Run in CI against its disposable Mongo service, never production Atlas."""

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from deep.errors import DeepError
from deep.repository import DeepRepository
from deep.service import DeepService
from deep.state import can_publish
from tests.deep_factory import ready_document, sample_input, sample_plan
from tests.deep_mongo_support import isolated_deep_database

CONSENT = {"version": "deep-sharing-v1", "shareFinance": True, "shareValues": True}


def NOW():
    return datetime.now(timezone.utc)


async def seed(repo, *, submitted=False):
    document = ready_document()
    unique = uuid4().hex
    document.update(id=unique, invitationCode="INV-" + unique, idempotencyKey=unique)
    if not submitted:
        document["status"] = "collecting"
        for member in document["members"].values():
            member.update(submittedAt=None, consent=None)
    await repo.sessions.insert_one(deepcopy(document))
    return document


def assert_expected_outcomes(outcomes):
    assert all(not isinstance(item, BaseException) or isinstance(item, DeepError) for item in outcomes), outcomes
    assert any(not isinstance(item, BaseException) for item in outcomes), outcomes


@pytest.mark.parametrize("race", ["patch_submit", "plan_submit", "two_submits", "report_withdraw", "agreement_edit_confirm", "invite_join"])
def test_deep_real_mongo_races(race):
    async def run():
        async with isolated_deep_database() as db:
            repo = DeepRepository(db)
            await repo.ensure_indexes()
            for _ in range(5):
                document = await seed(repo, submitted=race in {"report_withdraw", "agreement_edit_confirm"})
                sid = document["id"]
                if race == "patch_submit":
                    edited = sample_input()
                    edited["values"]["D1"] = 5
                    outcomes = await asyncio.gather(repo.save_input(sid, "user-a", 1, edited, NOW()),
                                                    repo.submit(sid, "user-a", 1, 1, CONSENT, NOW()), return_exceptions=True)
                    stored = await repo.get_for_member(sid, "user-a", NOW())
                    member = stored["members"]["A"]
                    if member["submittedAt"]:
                        assert member["revision"] == 1 and member["input"]["values"]["D1"] == 3
                    else:
                        assert member["revision"] == 2 and member["input"]["values"]["D1"] == 5
                    assert sum(isinstance(item, DeepError) for item in outcomes) == 1
                elif race == "plan_submit":
                    plan = sample_plan() | {"startMonth": "2027-01"}
                    outcomes = await asyncio.gather(repo.update_plan(sid, "user-b", 1, plan, NOW()),
                                                    repo.submit(sid, "user-a", 1, 1, CONSENT, NOW()), return_exceptions=True)
                    stored = await repo.get_for_member(sid, "user-a", NOW())
                    if stored["members"]["A"]["submittedAt"]:
                        assert stored["plan"]["version"] == 1
                    else:
                        assert stored["plan"]["version"] == 2
                        assert all(m["confirmedPlanVersion"] == 0 for m in stored["members"].values())
                    assert sum(isinstance(item, DeepError) for item in outcomes) == 1
                elif race == "two_submits":
                    outcomes = await asyncio.gather(*(repo.submit(sid, user, 1, 1, CONSENT, NOW()) for user in ("user-a", "user-b")),
                                                    return_exceptions=True)
                    assert not any(isinstance(item, BaseException) for item in outcomes)
                    assert can_publish(await repo.get_for_member(sid, "user-a", NOW()), NOW())
                    results = await asyncio.gather(DeepService(repo).result(sid, "user-a"), DeepService(repo).result(sid, "user-b"))
                    assert results[0] == results[1] and results[0]["status"] == "ready"
                    assert await db["deep_reports"].count_documents({"sessionId": sid}) == 1
                elif race == "report_withdraw":
                    outcomes = await asyncio.gather(DeepService(repo).result(sid, "user-a"), repo.withdraw(sid, "user-b", NOW()),
                                                    return_exceptions=True)
                    assert (await repo.sessions.find_one({"id": sid}))["status"] == "closed"
                    with pytest.raises(DeepError):
                        await DeepService(repo).result(sid, "user-a")
                    assert await db["deep_reports"].count_documents({"sessionId": sid}) == 0
                elif race == "agreement_edit_confirm":
                    await DeepService(repo).result(sid, "user-a")
                    agreement = await repo.propose_agreement(sid, "user-a", {"expectedRound": 1, "text": "old"}, NOW())
                    await repo.change_agreement(sid, "user-a", agreement["id"], 1, "confirm", {}, NOW())
                    outcomes = await asyncio.gather(
                        repo.change_agreement(sid, "user-a", agreement["id"], 1, "edit", {"text": "new"}, NOW()),
                        repo.change_agreement(sid, "user-b", agreement["id"], 1, "confirm", {}, NOW()), return_exceptions=True)
                    stored = await db["deep_agreements"].find_one({"id": agreement["id"]})
                    assert stored["text"] == "new" and stored["version"] == 2
                    assert stored["confirmations"] == [] and stored["status"] == "proposed"
                else:
                    created = await repo.create("user-a", uuid4().hex, "same-payload", NOW())
                    outcomes = await asyncio.gather(*(repo.join(created["invitationCode"], user, uuid4().hex, NOW())
                                                      for user in ("user-b", "user-c")), return_exceptions=True)
                    assert sum(isinstance(item, DeepError) for item in outcomes) == 1
                    assert (await repo.get_for_member(created["id"], "user-a", NOW()))["members"]["B"]["userId"] in {"user-b", "user-c"}
                assert_expected_outcomes(outcomes)
    asyncio.run(run())
