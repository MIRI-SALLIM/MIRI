from datetime import datetime, timedelta, timezone
from typing import Any

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from deep.meeting.provider import RESERVATION_MICRO_USD, AiSettings

TOTAL_BUDGET_ID = "evaluation-total-v1"


async def reserve_total(collection: Any, settings: AiSettings) -> bool:
    if settings.total_micro_usd is not None:
        try:
            # No TTL or session identifier: resets and expiry must not replenish this budget.
            await collection.insert_one({"_id": TOTAL_BUDGET_ID, "version": 0, "calls": 0, "halted": False,
                                         "limitMicroUsd": settings.total_micro_usd, "priorMicroUsd": settings.prior_micro_usd,
                                         "reservedMicroUsd": settings.prior_micro_usd})
        except DuplicateKeyError:
            pass
    for _ in range(50):
        current = await collection.find_one({"_id": TOTAL_BUDGET_ID})
        if current is None:
            return settings.total_micro_usd is None
        limit = current["limitMicroUsd"]
        if settings.total_micro_usd is not None:
            if current["priorMicroUsd"] != settings.prior_micro_usd:
                return False
            limit = min(limit, settings.total_micro_usd)
        if current["halted"] or current["reservedMicroUsd"] + RESERVATION_MICRO_USD > limit:
            return False
        updated = await collection.find_one_and_update(
            {"_id": TOTAL_BUDGET_ID, "version": current["version"], "halted": False},
            {"$inc": {"version": 1, "calls": 1, "reservedMicroUsd": RESERVATION_MICRO_USD}},
            return_document=ReturnDocument.AFTER,
        )
        if updated:
            return True
    return False


async def reserve_budget(collection: Any, settings: AiSettings, now: datetime) -> str | None:
    day = now.astimezone(timezone.utc).date().isoformat()
    try:
        await collection.insert_one({"_id": day, "version": 0, "reservedMicroUsd": 0, "calls": 0,
                                     "halted": False, "expiresAt": now + timedelta(days=35)})
    except DuplicateKeyError:
        pass
    for _ in range(50):
        current = await collection.find_one({"_id": day})
        if (not current or current["halted"] or current["calls"] >= settings.daily_calls
                or current["reservedMicroUsd"] + RESERVATION_MICRO_USD > settings.daily_micro_usd):
            return None
        reserved = await collection.find_one_and_update(
            {"_id": day, "version": current["version"], "halted": False},
            {"$inc": {"version": 1, "calls": 1, "reservedMicroUsd": RESERVATION_MICRO_USD}},
            return_document=ReturnDocument.AFTER,
        )
        if reserved:
            # Conservative two-stage reservation: interruptions never refund an uncertain attempt.
            return day if await reserve_total(collection, settings) else None
    return None
