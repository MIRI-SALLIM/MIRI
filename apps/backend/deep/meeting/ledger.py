from datetime import datetime, timedelta, timezone
from typing import Any

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from deep.meeting.provider import RESERVATION_MICRO_USD, AiSettings


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
            return day
    return None
