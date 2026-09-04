from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from pymongo import ReturnDocument

from auth.errors import AuthError
from auth.security import token_digest

ROOM_LIFETIME = timedelta(hours=24)


def room_code(room_id: str, pepper: str) -> str:
    return token_digest("reviewer-room:" + room_id, pepper)


class ReviewerRepository:
    def __init__(self, database: Any) -> None:
        self.database = database
        self.rooms = database["reviewer_rooms"]

    async def ensure_indexes(self) -> None:
        await self.rooms.create_index("id", unique=True)
        await self.rooms.create_index("codeHash", unique=True)
        await self.rooms.create_index("expiresAt", expireAfterSeconds=0)
        # Ordinary Kakao users have no expiresAt, so this TTL does not delete them.
        await self.database["users"].create_index("expiresAt", expireAfterSeconds=0)

    async def create_room(self, version: str, pepper: str, now: datetime) -> dict[str, Any]:
        rid = str(uuid4())
        room: dict[str, Any] = {"id": rid, "codeHash": token_digest(room_code(rid, pepper), pepper),
                "status": "preparing", "createdAt": now, "expiresAt": now + ROOM_LIFETIME,
                "credentialVersion": version, "users": {role: "reviewer:" + str(uuid4()) for role in ("A", "B")}}
        await self.rooms.insert_one(room)
        for role, uid in room["users"].items():
            await self.database["users"].insert_one({
                "id": uid, "provider": "reviewer", "providerUserId": f"{rid}:{role}", "createdAt": now,
                "expiresAt": room["expiresAt"], "reviewerRunId": rid, "reviewerRole": role,
                "reviewerVersion": version,
            })
        result = await self.rooms.find_one_and_update(
            {"id": rid, "status": "preparing"}, {"$set": {"status": "active"}}, return_document=ReturnDocument.AFTER)
        if result is None:
            raise AuthError("AUTH_UNAVAILABLE", 503)
        return result

    async def find_room(self, code: str, version: str, pepper: str, now: datetime) -> dict[str, Any]:
        room = await self.rooms.find_one({"codeHash": token_digest(code, pepper), "credentialVersion": version,
                                          "status": "active", "expiresAt": {"$gt": now}})
        if room is None:
            raise AuthError("REVIEWER_LOGIN_FAILED")
        return room

    async def active_room(self, rid: str, now: datetime) -> dict[str, Any] | None:
        return await self.rooms.find_one({"id": rid, "status": "active", "expiresAt": {"$gt": now}})

    async def close_room(self, rid: str, now: datetime) -> bool:
        result = await self.rooms.find_one_and_update(
            {"id": rid, "status": "active", "expiresAt": {"$gt": now}},
            {"$set": {"status": "closed", "closedAt": now}}, return_document=ReturnDocument.AFTER)
        return result is not None
