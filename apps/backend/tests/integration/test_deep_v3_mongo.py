"""Opt-in isolated Mongo verification; never reads the application Atlas URI."""
import asyncio
from datetime import datetime, timezone

from deep.repository import DeepRepository
from deep.service import DeepService
from deep.v3_report import result_with_agreements
from tests.deep_mongo_support import isolated_deep_database
from tests.integration.test_deep_v3 import terms
from tests.v3_factory import v3_input, v3_plan


def test_v3_real_mongo_storage_publication_and_agreement_cas():
    async def run():
        async with isolated_deep_database() as db:
            repo = DeepRepository(db)
            await repo.ensure_indexes()
            now = datetime.now(timezone.utc)
            document = await repo.create("a", "v3", "v3", now, question_version="deep-v3")
            sid = document["id"]
            await repo.join(document["invitationCode"], "b", "join", now, question_version="deep-v3")
            await repo.update_plan(sid, "a", 1, v3_plan(), now)
            for user in ("a", "b"):
                await repo.save_input(sid, user, 0, v3_input(), now)
                await repo.confirm_plan(sid, user, 2, now)
            consent = {"version": "deep-sharing-v2", "shareFinance": True, "shareValues": True}
            await asyncio.gather(*(repo.submit(sid, user, 1, 2, consent, now) for user in ("a", "b")))
            service = DeepService(repo)
            results = await asyncio.gather(*(result_with_agreements(service, sid, user) for user in ("a", "b")))
            assert results[0]["report"] == results[1]["report"]
            assert await db["deep_reports"].count_documents({"sessionId": sid}) == 1
            agreement = await repo.propose_agreement(sid, "a", {"expectedRound": 1, "text": "분담", "terms": terms()}, now)
            await asyncio.gather(*(repo.change_agreement(sid, user, agreement["id"], 1, "confirm", {}, now) for user in ("a", "b")))
            assert (await result_with_agreements(service, sid, "a"))["operatingStatus"]["status"] == "agreed"
            await repo.change_agreement(sid, "b", agreement["id"], 1, "edit", {"text": "새 분담", "terms": terms(900000)}, now)
            result = await result_with_agreements(service, sid, "a")
            assert result["report"] == results[0]["report"]
            assert result["operatingStatus"]["status"] == "proposed"
            assert not result["agreements"][0]["myConfirmed"] and not result["agreements"][0]["partnerConfirmed"]
            await repo.withdraw(sid, "a", now)
            assert await db["deep_reports"].count_documents({"sessionId": sid}) == 0
            assert await db["deep_agreements"].count_documents({"sessionId": sid}) == 0
    asyncio.run(run())
