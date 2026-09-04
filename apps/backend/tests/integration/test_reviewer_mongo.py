"""Room CAS and identity isolation must also run in the disposable Mongo CI job."""
import asyncio
from datetime import datetime, timezone

import pytest

from auth.repository import AuthRepository
from auth.reviewer_repository import ReviewerRepository
from deep.errors import DeepError
from deep.repository import DeepRepository
from tests.deep_mongo_support import isolated_deep_database


async def check_room_races(db):
    auth = AuthRepository(db)
    await auth.ensure_indexes()
    rooms = ReviewerRepository(db)
    deep = DeepRepository(db)
    await deep.ensure_indexes()
    now = datetime.now(timezone.utc)
    room = await rooms.create_room("synthetic-version", "p" * 32, now)
    a, b = room["users"]["A"], room["users"]["B"]
    session_hash = "synthetic-hash:" + room["id"]
    await auth.issue_session(a, session_hash, now, room["expiresAt"])
    document = await deep.create(a, "key", "payload", now)
    await deep.join(document["invitationCode"], b, "key-b", now)
    await asyncio.gather(deep.request_round(document["id"], a, 1, now), deep.request_round(document["id"], b, 1, now))
    stored = await deep.get_for_member(document["id"], a, now)
    assert stored["round"] == 2 and stored["expiresAt"] <= room["expiresAt"]
    closed = await asyncio.gather(*[rooms.close_room(room["id"], now) for _ in range(8)])
    assert sum(closed) == 1
    assert await auth.lookup_session(session_hash, now) is None
    with pytest.raises(DeepError):
        await deep.get_for_member(document["id"], a, now)


def test_reviewer_repository_race_contract_at_memory_boundary():
    from tests.mongo_fakes import MemoryDatabase

    asyncio.run(check_room_races(MemoryDatabase()))


def test_reviewer_repository_races_on_real_mongo():
    async def run():
        async with isolated_deep_database() as db:
            for _ in range(5):
                await check_room_races(db)
    asyncio.run(run())
