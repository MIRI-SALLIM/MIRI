from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from auth.models import Principal

CHALLENGE_LIFETIME = timedelta(minutes=10)
SESSION_LIFETIME = timedelta(days=7)


class AuthRepository:
    """Mongo-only account storage; the caller handles database unavailability."""

    def __init__(self, database: Any) -> None:
        self.database = database

    async def ensure_indexes(self) -> None:
        from auth.reviewer_repository import ReviewerRepository

        await self.database["users"].create_index([("provider", 1), ("providerUserId", 1)], unique=True)
        await self.database["users"].create_index("id", unique=True)
        for name, key in (("auth_challenges", "stateHash"), ("auth_sessions", "tokenHash")):
            await self.database[name].create_index(key, unique=True)
            await self.database[name].create_index("expiresAt", expireAfterSeconds=0)
        await self.database["auth_sessions"].create_index("userId")
        await self.database["auth_rate_limits"].create_index("expiresAt", expireAfterSeconds=0)
        await ReviewerRepository(self.database).ensure_indexes()

    async def upsert_user(self, kakao_id: str, now: datetime) -> Principal:
        identity = {"provider": "kakao", "providerUserId": kakao_id}
        users = self.database["users"]
        try:
            user = await users.find_one_and_update(
                identity, {"$setOnInsert": {**identity, "id": str(uuid4()), "createdAt": now}},
                upsert=True, return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError:
            user = await users.find_one(identity)
            if user is None:
                raise
        return Principal(user_id=user["id"], authenticated_at=now)

    async def issue_session(
        self, user_id: str, token_hash: str, now: datetime, expires_at: datetime | None = None,
    ) -> None:
        await self.database["auth_sessions"].insert_one({
            "userId": user_id, "tokenHash": token_hash, "issuedAt": now,
            "expiresAt": min(now + SESSION_LIFETIME, expires_at) if expires_at else now + SESSION_LIFETIME,
        })

    async def create_challenge(
        self, state_hash: str, browser_hash: str, return_to: str, now: datetime,
    ) -> None:
        await self.database["auth_challenges"].insert_one({
            "stateHash": state_hash, "browserHash": browser_hash, "returnTo": return_to,
            "expiresAt": now + CHALLENGE_LIFETIME,
        })

    async def consume_challenge(
        self, state_hash: str, browser_hash: str, now: datetime,
    ) -> dict[str, Any] | None:
        result = await self.database["auth_challenges"].find_one_and_delete({
            "stateHash": state_hash, "browserHash": browser_hash, "expiresAt": {"$gt": now},
        })
        return result

    async def lookup_session(self, token_hash: str, now: datetime) -> Principal | None:
        session = await self.database["auth_sessions"].find_one({
            "tokenHash": token_hash, "expiresAt": {"$gt": now},
        })
        if session is None:
            return None
        user = await self.database["users"].find_one({"id": session["userId"]})
        if user is None:
            return None
        if user.get("provider") == "reviewer":
            from auth.reviewer_repository import ReviewerRepository

            room = await ReviewerRepository(self.database).active_room(user.get("reviewerRunId", ""), now)
            if room is None or room["users"].get(user.get("reviewerRole")) != user["id"]:
                return None
        issued_at = session["issuedAt"]
        if issued_at.tzinfo is None:
            issued_at = issued_at.replace(tzinfo=timezone.utc)
        return Principal(user_id=user["id"], authenticated_at=issued_at, provider=user.get("provider", "kakao"),
                         reviewer_run_id=user.get("reviewerRunId"), reviewer_role=user.get("reviewerRole"),
                         reviewer_version=user.get("reviewerVersion"))

    async def revoke_session(self, token_hash: str) -> None:
        await self.database["auth_sessions"].delete_one({"tokenHash": token_hash})

    async def delete_user(self, user_id: str) -> None:
        # Invalidates authorization first, even if subsequent session cleanup fails.
        await self.database["users"].delete_one({"id": user_id})
        await self.database["auth_sessions"].delete_many({"userId": user_id})

    async def allow_attempt(self, ip_hash: str, action: str, limit: int, now: datetime) -> bool:
        window = int(now.timestamp()) // 600
        counter_id = f"{action}:{ip_hash}:{window}"
        update = {"$inc": {"count": 1}, "$setOnInsert": {
            "expiresAt": datetime.fromtimestamp((window + 1) * 600, timezone.utc),
        }}
        counters = self.database["auth_rate_limits"]
        try:
            counter = await counters.find_one_and_update(
                {"_id": counter_id}, update, upsert=True, return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError:
            # Another worker created this exact fixed-window counter first.
            counter = await counters.find_one_and_update(
                {"_id": counter_id}, update, upsert=True, return_document=ReturnDocument.AFTER,
            )
        return int(counter["count"]) <= limit
