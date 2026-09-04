"""Room boundaries are enforced in persistence, not trusted from client claims."""
from datetime import datetime
from typing import Any

from auth.reviewer_repository import ReviewerRepository
from deep.errors import DeepError


async def user_room(database: Any, user_id: str, now: datetime) -> dict[str, Any] | None:
    user = await database["users"].find_one({"id": user_id, "provider": "reviewer"})
    if user is None:
        if user_id.startswith("reviewer:"):
            raise DeepError("SESSION_EXPIRED_OR_CLOSED", 410)
        return None
    room = await ReviewerRepository(database).active_room(user["reviewerRunId"], now)
    if room is None or room["users"].get(user["reviewerRole"]) != user_id:
        raise DeepError("SESSION_EXPIRED_OR_CLOSED", 410)
    return room


async def validate_document_room(database: Any, document: dict[str, Any], now: datetime) -> None:
    rid = document.get("reviewerRunId")
    if rid is None:
        return
    room = await ReviewerRepository(database).active_room(rid, now)
    if room is None:
        raise DeepError("SESSION_EXPIRED_OR_CLOSED", 410)
    allowed = set(room["users"].values())
    if any(member and member["userId"] not in allowed for member in document["members"].values()):
        raise DeepError("NOT_FOUND", 404)


async def validate_join_room(database: Any, document: dict[str, Any], user_id: str, now: datetime) -> None:
    room = await user_room(database, user_id, now)
    if document.get("reviewerRunId") != (room["id"] if room else None):
        raise DeepError("NOT_FOUND", 404)
