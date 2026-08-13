from __future__ import annotations

import hashlib
import hmac
import secrets
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any

from pymongo import ReturnDocument

INVITATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def digest_participant_token(token: str, pepper: str) -> str:
    """Return the only participant-token representation stored in MongoDB."""
    return hmac.new(
        pepper.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_participant_token() -> str:
    return secrets.token_urlsafe(32)


def generate_invitation_code() -> str:
    suffix = "".join(secrets.choice(INVITATION_ALPHABET) for _ in range(8))
    return f"INV-{suffix}"


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def as_iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return as_utc(value).isoformat()
    return str(value)


def question_count_for(config: dict[str, Any] | None) -> int:
    questions = config.get("questions", []) if isinstance(config, dict) else []
    return len(questions) if isinstance(questions, list) else 0


class SessionRepository:
    """Mongo-backed sessions with an isolated in-memory mode for local tests."""

    def __init__(self, database: Any | None = None, *, use_memory: bool = False) -> None:
        self._collection = None if use_memory or database is None else database["sessions"]
        self._memory: dict[str, dict[str, Any]] = {}

    @property
    def uses_memory(self) -> bool:
        return self._collection is None

    async def ensure_indexes(self) -> None:
        if self._collection is None:
            return
        await self._collection.create_index("id", unique=True, name="session_id_unique")
        await self._collection.create_index("invitationCode", unique=True, name="invitation_code_unique")
        await self._collection.create_index("participants.tokenHash", name="participant_token_hash")
        await self._collection.create_index(
            "expiresAt",
            expireAfterSeconds=0,
            name="session_expiry_ttl",
        )
        await self._collection.create_index(
            "creatorIdempotencyKey",
            unique=True,
            partialFilterExpression={"creatorIdempotencyKey": {"$type": "string"}},
            name="creator_idempotency_key",
        )

    async def create(
        self,
        *,
        nickname: str,
        mode: str,
        question_set_version: str,
        question_count: int,
        idempotency_key: str | None,
        pepper: str,
        now: datetime,
        ttl_days: int,
    ) -> tuple[dict[str, Any], str]:
        if idempotency_key:
            existing = await self._find_by_idempotency(idempotency_key)
            if existing is not None:
                token = generate_participant_token()
                token_hash = digest_participant_token(token, pepper)
                existing["participants"][0]["tokenHash"] = token_hash
                if self._collection is None:
                    self._memory[existing["id"]] = deepcopy(existing)
                else:
                    await self._collection.update_one(
                        {"id": existing["id"]},
                        {"$set": {"participants.0.tokenHash": token_hash}},
                    )
                return existing, token

        token = generate_participant_token()
        invitation_code = generate_invitation_code()
        while await self._find_by_code(invitation_code) is not None:
            invitation_code = generate_invitation_code()

        session_id = f"sess_{secrets.token_hex(12)}"
        document: dict[str, Any] = {
            "id": session_id,
            "mode": mode,
            "questionSetVersion": question_set_version,
            "invitationCode": invitation_code,
            "status": "in_progress",
            "createdAt": now,
            "expiresAt": now + timedelta(days=ttl_days),
            "creatorIdempotencyKey": idempotency_key,
            "participants": [
                {
                    "role": "creator",
                    "nickname": nickname,
                    "tokenHash": digest_participant_token(token, pepper),
                    "answers": [None] * question_count,
                    "guesses": [None] * question_count,
                    "completedAt": None,
                    "lastNudgedAt": None,
                }
            ],
        }

        if self._collection is None:
            self._memory[session_id] = deepcopy(document)
        else:
            await self._collection.insert_one(document)
        return document, token

    async def _find_by_idempotency(self, idempotency_key: str) -> dict[str, Any] | None:
        if self._collection is None:
            for document in self._memory.values():
                if document.get("creatorIdempotencyKey") == idempotency_key:
                    return deepcopy(document)
            return None
        return await self._collection.find_one({"creatorIdempotencyKey": idempotency_key})

    async def _find_by_code(self, invitation_code: str) -> dict[str, Any] | None:
        if self._collection is None:
            for document in self._memory.values():
                if document.get("invitationCode") == invitation_code:
                    return deepcopy(document)
            return None
        return await self._collection.find_one({"invitationCode": invitation_code})

    async def get_by_code(self, invitation_code: str) -> dict[str, Any] | None:
        return await self._find_by_code(invitation_code)

    async def get_by_id_and_token(
        self,
        session_id: str,
        token_hash: str,
        *,
        participant_only: bool = False,
        now: datetime | None = None,
    ) -> dict[str, Any] | None:
        query: dict[str, Any] = {
            "id": session_id,
            "participants.tokenHash": token_hash,
        }
        if now is not None:
            query["expiresAt"] = {"$gt": now}

        if self._collection is None:
            document = self._memory.get(session_id)
            if document is None:
                return None
            expires_at = document.get("expiresAt")
            if (
                now is not None
                and isinstance(expires_at, datetime)
                and as_utc(expires_at) <= as_utc(now)
            ):
                return None
            if any(
                participant.get("tokenHash") == token_hash
                for participant in document.get("participants", [])
            ):
                if participant_only:
                    return {
                        "id": document.get("id"),
                        "questionSetVersion": document.get("questionSetVersion"),
                        "expiresAt": document.get("expiresAt"),
                        "participants": [
                            deepcopy(participant)
                            for participant in document.get("participants", [])
                            if participant.get("tokenHash") == token_hash
                        ],
                    }
                return deepcopy(document)
            return None
        projection = None
        if participant_only:
            projection = {
                "_id": 0,
                "id": 1,
                "questionSetVersion": 1,
                "expiresAt": 1,
                "participants": {"$elemMatch": {"tokenHash": token_hash}},
            }
        return await self._collection.find_one(query, projection)

    async def join(
        self,
        *,
        invitation_code: str,
        nickname: str,
        question_count: int,
        pepper: str,
        now: datetime,
    ) -> tuple[dict[str, Any] | None, str | None]:
        token = generate_participant_token()
        participant = {
            "role": "invitee",
            "nickname": nickname,
            "tokenHash": digest_participant_token(token, pepper),
            "answers": [None] * question_count,
            "guesses": [None] * question_count,
            "completedAt": None,
            "lastNudgedAt": None,
        }
        query = {
            "invitationCode": invitation_code,
            "expiresAt": {"$gt": now},
            "participants.1": {"$exists": False},
        }
        if self._collection is None:
            document = await self._find_by_code(invitation_code)
            expires_at = document.get("expiresAt") if document is not None else None
            if (
                document is None
                or not isinstance(expires_at, datetime)
                or as_utc(expires_at) <= now
            ):
                return None, None
            if len(document.get("participants", [])) >= 2:
                return None, None
            document["participants"].append(participant)
            self._memory[document["id"]] = deepcopy(document)
            return document, token

        document = await self._collection.find_one_and_update(
            query,
            {"$push": {"participants": participant}},
            return_document=ReturnDocument.AFTER,
        )
        return document, token if document is not None else None

    async def update_input(
        self,
        *,
        session_id: str,
        token_hash: str,
        answers: list[int | None],
        guesses: list[int | None] | None,
        now: datetime,
    ) -> tuple[str, dict[str, Any] | None]:
        document = await self.get_by_id_and_token(
            session_id,
            token_hash,
            participant_only=True,
            now=now,
        )
        if document is None:
            return await self._classify_failed_mutation(session_id, token_hash, now)
        participant = next(
            (
                item
                for item in document.get("participants", [])
                if item.get("tokenHash") == token_hash
            ),
            None,
        )
        if participant is None:
            return "not_found", None
        if participant.get("completedAt") is not None:
            return "submitted", document

        new_guesses = guesses if guesses is not None else [None] * len(answers)
        if self._collection is None:
            document = deepcopy(self._memory[session_id])
            participant = next(
                item
                for item in document.get("participants", [])
                if item.get("tokenHash") == token_hash
            )
            participant["answers"] = list(answers)
            participant["guesses"] = list(new_guesses)
            self._memory[session_id] = deepcopy(document)
        else:
            updated = await self._collection.find_one_and_update(
                {
                    "id": session_id,
                    "expiresAt": {"$gt": now},
                    "participants": {
                        "$elemMatch": {
                            "tokenHash": token_hash,
                            "completedAt": None,
                        }
                    },
                },
                {
                    "$set": {
                        "participants.$.answers": answers,
                        "participants.$.guesses": new_guesses,
                    }
                },
                return_document=ReturnDocument.AFTER,
            )
            if updated is None:
                return await self._classify_failed_mutation(session_id, token_hash, now)
            document = updated
        return "ok", document

    async def submit(
        self,
        *,
        session_id: str,
        token_hash: str,
        answers: list[int | None],
        guesses: list[int | None] | None,
        now: datetime,
    ) -> tuple[str, dict[str, Any] | None]:
        document = await self.get_by_id_and_token(session_id, token_hash, now=now)
        if document is None:
            return await self._classify_failed_mutation(session_id, token_hash, now)
        participant = next(
            (
                item
                for item in document.get("participants", [])
                if item.get("tokenHash") == token_hash
            ),
            None,
        )
        if participant is None:
            return "not_found", None
        if participant.get("completedAt") is not None:
            return "already_submitted", document

        completed_at = now
        new_guesses = guesses if guesses is not None else [None] * len(answers)
        if self._collection is None:
            participant["answers"] = list(answers)
            participant["guesses"] = list(new_guesses)
            participant["completedAt"] = completed_at
            self._memory[session_id] = deepcopy(document)
        else:
            updated = await self._collection.find_one_and_update(
                {
                    "id": session_id,
                    "expiresAt": {"$gt": now},
                    "participants": {
                        "$elemMatch": {
                            "tokenHash": token_hash,
                            "completedAt": None,
                        }
                    },
                },
                {
                    "$set": {
                        "participants.$.answers": answers,
                        "participants.$.guesses": new_guesses,
                        "participants.$.completedAt": completed_at,
                    }
                },
                return_document=ReturnDocument.AFTER,
            )
            if updated is None:
                return await self._classify_failed_mutation(session_id, token_hash, now)
            document = updated
        return "ok", document

    async def _classify_failed_mutation(
        self,
        session_id: str,
        token_hash: str,
        now: datetime,
    ) -> tuple[str, dict[str, Any] | None]:
        document = await self.get_by_id_and_token(session_id, token_hash)
        if document is None:
            return "not_found", None
        expires_at = document.get("expiresAt")
        if isinstance(expires_at, datetime) and as_utc(expires_at) <= as_utc(now):
            return "expired", document
        participant = next(
            (
                item
                for item in document.get("participants", [])
                if item.get("tokenHash") == token_hash
            ),
            None,
        )
        if participant is not None and participant.get("completedAt") is not None:
            return "already_submitted", document
        return "not_found", None

    async def nudge(
        self,
        *,
        session_id: str,
        token_hash: str,
        now: datetime,
    ) -> tuple[str, dict[str, Any] | None]:
        document = await self.get_by_id_and_token(session_id, token_hash)
        if document is None:
            return "not_found", None
        participants = document.get("participants", [])
        participant_index = next(
            (
                index
                for index, item in enumerate(participants)
                if item.get("tokenHash") == token_hash
            ),
            None,
        )
        if participant_index is None:
            return "not_found", None
        if len(participants) < 2:
            return "partner_not_joined", document
        previous = participants[participant_index].get("lastNudgedAt")
        if (
            isinstance(previous, datetime)
            and as_utc(previous) + timedelta(hours=24) > now
        ):
            return "rate_limited", document
        if self._collection is None:
            participants[participant_index]["lastNudgedAt"] = now
            self._memory[session_id] = deepcopy(document)
        else:
            nudge_path = f"participants.{participant_index}.lastNudgedAt"
            document = await self._collection.find_one_and_update(
                {
                    "id": session_id,
                    "expiresAt": {"$gt": now},
                    f"participants.{participant_index}.tokenHash": token_hash,
                    "participants.1": {"$exists": True},
                    "$or": [
                        {nudge_path: None},
                        {nudge_path: {"$lt": now - timedelta(hours=24)}},
                    ],
                },
                {"$set": {nudge_path: now}},
                return_document=ReturnDocument.AFTER,
            )
            if document is None:
                return "rate_limited", await self.get_by_id_and_token(session_id, token_hash)
        return "ok", document
