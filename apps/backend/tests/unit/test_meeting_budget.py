import asyncio
from datetime import datetime, timedelta, timezone

from deep.meeting.ledger import reserve_budget
from deep.meeting.provider import RESERVATION_MICRO_USD, AiSettings
from tests.mongo_fakes import MemoryDatabase


def test_concurrent_reservations_never_exceed_daily_budget():
    async def run():
        collection = MemoryDatabase()["budget"]
        settings = AiSettings(daily_micro_usd=RESERVATION_MICRO_USD * 3, daily_calls=20)
        now = datetime.now(timezone.utc)
        results = await asyncio.gather(*(reserve_budget(collection, settings, now) for _ in range(20)))
        assert sum(bool(result) for result in results) == 3
        assert collection.documents[0]["reservedMicroUsd"] == RESERVATION_MICRO_USD * 3
        assert await reserve_budget(collection, settings, now + timedelta(days=1))
    asyncio.run(run())


def test_call_cap_and_halt_fail_closed():
    async def run():
        collection = MemoryDatabase()["budget"]
        now = datetime.now(timezone.utc)
        settings = AiSettings(daily_calls=1)
        assert await reserve_budget(collection, settings, now)
        assert not await reserve_budget(collection, settings, now)
        collection.documents[0]["halted"] = True
        assert not await reserve_budget(collection, AiSettings(), now)
    asyncio.run(run())
