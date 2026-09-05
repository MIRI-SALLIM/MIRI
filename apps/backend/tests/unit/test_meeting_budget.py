import asyncio
from datetime import datetime, timedelta, timezone

import pytest

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


def test_total_budget_includes_prior_usage_and_survives_new_days_and_settings():
    async def run():
        collection = MemoryDatabase()["budget"]
        now = datetime.now(timezone.utc)
        settings = AiSettings(total_micro_usd=RESERVATION_MICRO_USD * 3, prior_micro_usd=RESERVATION_MICRO_USD * 2)
        assert await reserve_budget(collection, settings, now)
        assert await reserve_budget(collection, settings, now + timedelta(days=1)) is None
        # Removing env configuration or recreating settings cannot bypass a persisted cap.
        assert await reserve_budget(collection, AiSettings(), now + timedelta(days=2)) is None
        total = await collection.find_one({"_id": "evaluation-total-v1"})
        assert total["reservedMicroUsd"] == RESERVATION_MICRO_USD * 3
        assert "expiresAt" not in total
    asyncio.run(run())


def test_concurrent_total_reservations_never_exceed_shared_limit():
    async def run():
        collection = MemoryDatabase()["budget"]
        now = datetime.now(timezone.utc)
        settings = AiSettings(daily_micro_usd=5_000_000, daily_calls=200,
                              total_micro_usd=RESERVATION_MICRO_USD * 2, prior_micro_usd=0)
        results = await asyncio.gather(*(reserve_budget(collection, settings, now) for _ in range(20)))
        assert sum(result is not None for result in results) == 2
        assert (await collection.find_one({"_id": "evaluation-total-v1"}))["reservedMicroUsd"] == RESERVATION_MICRO_USD * 2
    asyncio.run(run())


def test_changed_prior_usage_or_raised_limit_does_not_reset_persisted_total():
    async def run():
        collection = MemoryDatabase()["budget"]
        now = datetime.now(timezone.utc)
        settings = AiSettings(total_micro_usd=RESERVATION_MICRO_USD * 2, prior_micro_usd=RESERVATION_MICRO_USD)
        assert await reserve_budget(collection, settings, now)
        assert await reserve_budget(collection, AiSettings(total_micro_usd=5_000_000, prior_micro_usd=0), now) is None
        assert await reserve_budget(collection, AiSettings(total_micro_usd=5_000_000, prior_micro_usd=RESERVATION_MICRO_USD), now) is None
    asyncio.run(run())


@pytest.mark.parametrize("total,prior", [("5000001", "0"), ("-1", "0"), ("5000000", None),
                                       (None, "0"), ("invalid", "0"), ("1", "2"), ("5000000", "-1")])
def test_invalid_total_configuration_fails_closed(monkeypatch, total, prior):
    monkeypatch.setenv("DEEP_MEETING_AI_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-not-a-real-key")
    for name, value in (("DEEP_MEETING_AI_TOTAL_MICRO_USD", total), ("DEEP_MEETING_AI_PRIOR_MICRO_USD", prior)):
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    assert not AiSettings.load().enabled
