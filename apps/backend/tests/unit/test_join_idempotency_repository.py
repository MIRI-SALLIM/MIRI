import asyncio
from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest

from services.session_repository import SessionRepository, utc_now
from tests.mongo_fakes import MemoryDatabase

PEPPER = "test-join-replay-pepper-at-least-32-bytes"


@pytest.mark.parametrize("mongo_boundary", [False, True])
@pytest.mark.parametrize("same_key", [False, True])
def test_join_race_has_one_slot_and_stable_credentials(mongo_boundary, same_key):
    async def scenario():
        db = MemoryDatabase()
        repo = SessionRepository(db if mongo_boundary else None)
        now = utc_now()
        created, _ = await repo.create(nickname=None, mode="light", question_set_version="light-v1",
                                      question_count=5, idempotency_key=None, pepper=PEPPER, now=now, ttl_days=7)
        key = str(uuid4())

        async def join(request_key):
            return await repo.join(invitation_code=created["invitationCode"], nickname=None,
                                   question_count=5, pepper=PEPPER, now=now, idempotency_key=request_key)

        results = await asyncio.gather(join(key), join(key if same_key else str(uuid4())))
        winners = [(doc, token) for doc, token in results if doc is not None]
        assert len(winners) == (2 if same_key else 1)
        assert len({token for _, token in winners}) == 1
        document = await repo.get_by_code(created["invitationCode"])
        assert len(document["participants"]) == 2
        assert document["participants"][1]["answers"] == [None] * 5

    asyncio.run(scenario())


def test_mongo_join_replay_survives_repository_restart_and_preserves_input():
    async def scenario():
        db = MemoryDatabase()
        repo = SessionRepository(db)
        now = utc_now()
        created, _ = await repo.create(nickname=None, mode="light", question_set_version="light-v1",
                                      question_count=5, idempotency_key=None, pepper=PEPPER, now=now, ttl_days=7)
        args: dict[str, Any] = {"invitation_code": created["invitationCode"], "nickname": "guest", "question_count": 5,
                                "pepper": PEPPER, "now": now, "idempotency_key": str(uuid4())}
        _, token = await repo.join(**args)
        stored = db["sessions"].documents[0]
        stored["participants"][1]["answers"] = [0, 1, None, 3, 0]
        stored["participants"][1]["completedAt"] = now
        restarted = SessionRepository(db)
        replay, recovered = await restarted.join(**args)
        assert recovered == token
        assert replay["participants"][1]["answers"] == [0, 1, None, 3, 0]
        assert replay["participants"][1]["completedAt"] == now
        assert token not in repr(stored)
        assert args["idempotency_key"] not in repr(stored)
        assert await restarted.join(**{**args, "nickname": "other"}) == (None, None)
        assert await restarted.join(**{**args, "idempotency_key": str(uuid4())}) == (None, None)
        assert await restarted.join(**{**args, "now": now + timedelta(days=7)}) == (None, None)
        db["sessions"].documents.clear()
        assert await restarted.join(**args) == (None, None)

    asyncio.run(scenario())
