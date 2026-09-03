import hashlib
import secrets
from collections.abc import Callable
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from auth.repository import AuthRepository
from deep.agreements import confirm_agreement, defer_agreement, edit_agreement
from deep.errors import DeepError
from deep.reviewer_scope import user_room, validate_document_room, validate_join_room
from deep.schemas import DeepInput, SharedPlan
from deep.state import can_publish, publication_stamp
from deep.validation import validate_submission


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def member_role(document: dict[str, Any], user_id: str) -> str:
    for role, member in document["members"].items():
        if member and member["userId"] == user_id:
            return role
    raise DeepError("NOT_FOUND", 404)


def new_member(user_id: str) -> dict[str, Any]:
    return {"userId": user_id, "revision": 0, "input": DeepInput().model_dump(mode="json"),
            "submittedAt": None, "confirmedPlanVersion": 0, "consent": None}


def active(document: dict[str, Any], now: datetime) -> None:
    if document["status"] == "closed" or as_utc(document["expiresAt"]) <= now:
        raise DeepError("SESSION_EXPIRED_OR_CLOSED", 410)


class DeepRepository:
    """Single-document conditional updates; no production in-memory fallback."""

    def __init__(self, database: Any, draft_days: int = 30, report_days: int = 90) -> None:
        self.database = database
        self.sessions = database["deep_sessions"]
        self.draft_days = draft_days
        self.report_days = report_days

    async def ensure_indexes(self) -> None:
        await self.sessions.create_index("id", unique=True)
        await self.sessions.create_index("invitationCode", unique=True)
        await self.sessions.create_index([("creatorUserId", 1), ("idempotencyKey", 1)], unique=True)
        await self.sessions.create_index("expiresAt", expireAfterSeconds=0)
        await self.sessions.create_index("members.A.userId")
        await self.sessions.create_index("members.B.userId")
        await self.database["auth_rate_limits"].create_index("expiresAt", expireAfterSeconds=0)
        await self.database["deep_reports"].create_index([("sessionId", 1), ("publicationStamp", 1)], unique=True)
        await self.database["deep_reports"].create_index("id", unique=True)
        await self.database["deep_reports"].create_index("expiresAt", expireAfterSeconds=0)
        await self.database["deep_agreements"].create_index("id", unique=True)
        await self.database["deep_agreements"].create_index([("sessionId", 1), ("round", 1)])
        await self.database["deep_agreements"].create_index("expiresAt", expireAfterSeconds=0)
        await self.database["account_deletions"].create_index("userId", unique=True)
        await self.database["account_deletions"].create_index("expiresAt", expireAfterSeconds=0)

    async def _check_deleting_members(self, document: dict[str, Any]) -> None:
        await validate_document_room(self.database, document, datetime.now(timezone.utc))
        user_ids = [member["userId"] for member in document["members"].values() if member]
        if await self.database["account_deletions"].find_one({"userId": {"$in": user_ids}}):
            raise DeepError("SESSION_EXPIRED_OR_CLOSED", 410)

    async def _check_deleting_user(self, user_id: str) -> None:
        await user_room(self.database, user_id, datetime.now(timezone.utc))
        if await self.database["account_deletions"].find_one({"userId": user_id}):
            raise DeepError("ACCOUNT_DELETION_PENDING", 410)

    async def allow_attempt(self, actor_hash: str, action: str, now: datetime) -> bool:
        return await AuthRepository(self.database).allow_attempt(actor_hash, "deep-" + action, 20, now)

    async def create(self, user_id: str, idempotency_key: str, payload_hash: str, now: datetime) -> dict[str, Any]:
        await self._check_deleting_user(user_id)
        review_room = await user_room(self.database, user_id, now)
        key = hashlib.sha256(idempotency_key.encode()).hexdigest()
        identity = {"creatorUserId": user_id, "idempotencyKey": key}
        existing = await self.sessions.find_one(identity)
        if existing is not None:
            if existing["payloadHash"] != payload_hash:
                raise DeepError("IDEMPOTENCY_CONFLICT")
            active(existing, now)
            await self._check_deleting_members(existing)
            return existing
        for _ in range(3):
            document: dict[str, Any] = {**identity, "payloadHash": payload_hash, "id": str(uuid4()), "round": 1, "version": 0,
                        "status": "collecting", "invitationCode": "INV-" + secrets.token_urlsafe(16),
                        "members": {"A": new_member(user_id), "B": None},
                        "plan": {"version": 1, "data": SharedPlan(startMonth=now.strftime("%Y-%m")).model_dump(mode="json")},
                        "questionVersion": "deep-v2", "ruleVersion": "deep-rules-v1", "copyVersion": "deep-copy-ko-v1",
                        "consentVersion": "deep-sharing-v1", "reportId": None,
                        "createdAt": now, "expiresAt": now + timedelta(days=self.draft_days)}
            if review_room:
                document.update(reviewerRunId=review_room["id"], reviewerExpiresAt=review_room["expiresAt"],
                                expiresAt=min(document["expiresAt"], as_utc(review_room["expiresAt"])))
            try:
                await self.sessions.insert_one(document)
                try:
                    await self._check_deleting_user(user_id)
                except DeepError:
                    await self.withdraw(document["id"], user_id, now)
                    await self._erase_member_input(document["id"], user_id)
                    raise
                return document
            except DuplicateKeyError:
                existing = await self.sessions.find_one(identity)
                if existing is not None:
                    if existing["payloadHash"] != payload_hash:
                        raise DeepError("IDEMPOTENCY_CONFLICT") from None
                    active(existing, now)
                    await self._check_deleting_members(existing)
                    return existing
        raise DeepError("DEEP_UNAVAILABLE", 503)

    async def get_for_member(self, session_id: str, user_id: str, now: datetime) -> dict[str, Any]:
        document = await self.sessions.find_one({"id": session_id, "$or": [
            {"members.A.userId": user_id}, {"members.B.userId": user_id},
        ]})
        if document is None:
            raise DeepError("NOT_FOUND", 404)
        active(document, now)
        await self._check_deleting_members(document)
        return document

    async def _commit(
        self, document: dict[str, Any], fields: dict[str, Any], now: datetime,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        result = await self.sessions.find_one_and_update(
            {"id": document["id"], "version": document["version"], "status": {"$ne": "closed"},
             "expiresAt": {"$gt": now}, **(extra or {})},
            {"$set": fields, "$inc": {"version": 1}}, return_document=ReturnDocument.AFTER,
        )
        return result

    async def _change_for_member(
        self, session_id: str, user_id: str, now: datetime,
        build: Callable[[dict[str, Any], str], tuple[dict[str, Any], dict[str, Any]] | None],
    ) -> dict[str, Any]:
        for _ in range(5):
            document = await self.get_for_member(session_id, user_id, now)
            role = member_role(document, user_id)
            change = build(document, role)
            if change is None:
                return document
            fields, extra = change
            updated = await self._commit(document, fields, now, {f"members.{role}.userId": user_id, **extra})
            if updated is not None:
                await self._check_deleting_members(updated)
                return updated
        raise DeepError("REVISION_CONFLICT")

    async def join(self, code: str, user_id: str, idempotency_key: str, now: datetime) -> dict[str, Any]:
        await self._check_deleting_user(user_id)
        for _ in range(5):
            document = await self.sessions.find_one({"invitationCode": code, "status": {"$ne": "closed"}, "expiresAt": {"$gt": now}})
            if document is None:
                raise DeepError("NOT_FOUND", 404)
            await validate_join_room(self.database, document, user_id, now)
            await self._check_deleting_members(document)
            if document["members"]["A"]["userId"] == user_id:
                raise DeepError("SELF_INVITATION")
            partner = document["members"].get("B")
            if partner:
                if partner["userId"] == user_id:
                    return document
                raise DeepError("SESSION_FULL")
            updated = await self._commit(document, {"members.B": new_member(user_id)}, now, {"members.B": None})
            if updated is not None:
                try:
                    await self._check_deleting_members(updated)
                except DeepError:
                    await self.withdraw(updated["id"], user_id, now)
                    await self._erase_member_input(updated["id"], user_id)
                    raise
                return updated
        raise DeepError("REVISION_CONFLICT")

    async def save_input(
        self, session_id: str, user_id: str, expected_revision: int, data: dict[str, Any], now: datetime,
    ) -> dict[str, Any]:
        def build(document: dict[str, Any], role: str) -> tuple[dict[str, Any], dict[str, Any]]:
            member = document["members"][role]
            if member["revision"] != expected_revision:
                raise DeepError("REVISION_CONFLICT")
            if member["submittedAt"] is not None:
                raise DeepError("INPUT_LOCKED")
            return ({f"members.{role}.input": data, f"members.{role}.revision": expected_revision + 1},
                    {f"members.{role}.revision": expected_revision, f"members.{role}.submittedAt": None,
                     "status": {"$in": ["collecting", "waiting"]}})
        return await self._change_for_member(session_id, user_id, now, build)

    async def update_plan(
        self, session_id: str, user_id: str, expected_version: int, plan: dict[str, Any], now: datetime,
    ) -> dict[str, Any]:
        def build(document: dict[str, Any], role: str) -> tuple[dict[str, Any], dict[str, Any]]:
            if document["plan"]["version"] != expected_version:
                raise DeepError("PLAN_VERSION_CONFLICT")
            if any(member and member["submittedAt"] is not None for member in document["members"].values()):
                raise DeepError("PLAN_LOCKED")
            fields: dict[str, Any] = {"plan": {"version": expected_version + 1, "data": plan}}
            for label, member in document["members"].items():
                if member:
                    fields[f"members.{label}.confirmedPlanVersion"] = 0
            return fields, {"plan.version": expected_version, "members.A.submittedAt": None, "members.B.submittedAt": None}
        return await self._change_for_member(session_id, user_id, now, build)

    async def confirm_plan(self, session_id: str, user_id: str, plan_version: int, now: datetime) -> dict[str, Any]:
        def build(document: dict[str, Any], role: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
            if document["plan"]["version"] != plan_version:
                raise DeepError("PLAN_VERSION_CONFLICT")
            if document["members"][role]["confirmedPlanVersion"] == plan_version:
                return None
            return {f"members.{role}.confirmedPlanVersion": plan_version}, {"plan.version": plan_version}
        return await self._change_for_member(session_id, user_id, now, build)

    async def submit(
        self, session_id: str, user_id: str, expected_revision: int, plan_version: int,
        consent: dict[str, Any], now: datetime,
    ) -> dict[str, Any]:
        def build(document: dict[str, Any], role: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
            member = document["members"][role]
            if member["revision"] != expected_revision:
                raise DeepError("REVISION_CONFLICT")
            if document["plan"]["version"] != plan_version or member["confirmedPlanVersion"] != plan_version:
                raise DeepError("PLAN_VERSION_CONFLICT")
            if (consent.get("version") != document["consentVersion"]
                    or type(consent.get("shareFinance")) is not bool or type(consent.get("shareValues")) is not bool):
                raise DeepError("CONSENT_REQUIRED", 422)
            snapshot_consent = {"version": consent["version"], "shareFinance": consent["shareFinance"],
                                "shareValues": consent["shareValues"], "submittedRevision": expected_revision,
                                "round": document["round"]}
            if member["submittedAt"] is not None:
                if member["consent"] == snapshot_consent:
                    return None
                raise DeepError("INPUT_LOCKED")
            missing = validate_submission(DeepInput.model_validate(member["input"]))
            if missing:
                raise DeepError("INPUT_INCOMPLETE", 422, {item["field"]: [item["code"]] for item in missing})
            return ({f"members.{role}.submittedAt": now, f"members.{role}.consent": snapshot_consent, "status": "waiting"},
                    {f"members.{role}.revision": expected_revision, f"members.{role}.submittedAt": None,
                     f"members.{role}.confirmedPlanVersion": plan_version, "plan.version": plan_version})
        return await self._change_for_member(session_id, user_id, now, build)

    async def claim_publication(self, session_id: str, expected_version: int, now: datetime) -> dict[str, Any] | None:
        document = await self.sessions.find_one({"id": session_id, "version": expected_version})
        if document is None or not can_publish(document, now):
            return None
        await self._check_deleting_members(document)
        stamp = publication_stamp(document)
        if document.get("publicationStamp") == stamp:
            return document
        expires = now + timedelta(days=self.report_days)
        if document.get("reviewerExpiresAt"):
            expires = min(expires, as_utc(document["reviewerExpiresAt"]))
        return await self._commit(document, {"publicationStamp": stamp, "publicationExpiresAt": expires}, now)

    async def store_report(self, session_id: str, stamp: str, report: dict[str, Any], expires_at: datetime) -> str:
        identity = {"sessionId": session_id, "publicationStamp": stamp}
        collection = self.database["deep_reports"]
        try:
            stored = await collection.find_one_and_update(identity, {"$setOnInsert": {
                **identity, "id": str(uuid4()), "report": report, "expiresAt": expires_at,
            }}, upsert=True, return_document=ReturnDocument.AFTER)
        except DuplicateKeyError:
            stored = await collection.find_one(identity)
            if stored is None:
                raise
        return str(stored["id"])

    async def publish_report_pointer(
        self, session_id: str, expected_version: int, stamp: str, report_id: str, now: datetime,
    ) -> bool:
        document = await self.sessions.find_one({"id": session_id, "version": expected_version, "publicationStamp": stamp})
        if document is None or not can_publish(document, now) or publication_stamp(document) != stamp:
            return False
        await self._check_deleting_members(document)
        updated = await self._commit(document, {"reportId": report_id, "status": "ready",
                                                 "expiresAt": document["publicationExpiresAt"]}, now,
                                     {"publicationStamp": stamp})
        return updated is not None

    async def load_report_for_member(self, session_id: str, user_id: str, now: datetime) -> dict[str, Any]:
        document = await self.get_for_member(session_id, user_id, now)
        if not can_publish(document, now) or document.get("publicationStamp") != publication_stamp(document):
            raise DeepError("PUBLICATION_NOT_READY")
        stored = await self.database["deep_reports"].find_one({
            "sessionId": session_id, "publicationStamp": document["publicationStamp"], "id": document["reportId"],
            "expiresAt": {"$gt": now},
        })
        if stored is None:
            raise DeepError("REPORT_UNAVAILABLE", 503)
        latest = await self.get_for_member(session_id, user_id, datetime.now(timezone.utc))
        if latest.get("reportId") != document["reportId"] or not can_publish(latest, datetime.now(timezone.utc)):
            raise DeepError("PUBLICATION_NOT_READY")
        result: dict[str, Any] = stored["report"]
        return result

    async def cleanup_obsolete_report(self, session_id: str, stamp: str, now: datetime) -> None:
        document = await self.sessions.find_one({"id": session_id})
        obsolete = (document is None or document["status"] == "closed" or as_utc(document["expiresAt"]) <= now
                    or document.get("publicationStamp") != stamp)
        if obsolete:
            await self.database["deep_reports"].delete_many({"sessionId": session_id, "publicationStamp": stamp})

    async def purge_session_artifacts(self, session_id: str) -> None:
        for name in ("deep_reports", "deep_agreements"):
            await self.database[name].delete_many({"sessionId": session_id})

    async def withdraw(self, session_id: str, user_id: str, now: datetime) -> dict[str, Any]:
        # Closing/cleanup is allowed even if logically expired or already closed.
        query = {"id": session_id, "$or": [{"members.A.userId": user_id}, {"members.B.userId": user_id}]}
        document = await self.sessions.find_one(query)
        if document is None:
            raise DeepError("NOT_FOUND", 404)
        if document["status"] != "closed":
            document = await self.sessions.find_one_and_update(query, {"$set": {
                "status": "closed", "closedAt": now, "reportId": None,
            }, "$inc": {"version": 1}}, return_document=ReturnDocument.AFTER)
            if document is None:
                raise DeepError("NOT_FOUND", 404)
        await self.purge_session_artifacts(session_id)
        return document

    async def request_round(self, session_id: str, user_id: str, expected_round: int, now: datetime) -> dict[str, Any]:
        def build(document: dict[str, Any], role: str) -> tuple[dict[str, Any], dict[str, Any]]:
            if document["round"] != expected_round:
                raise DeepError("ROUND_VERSION_CONFLICT")
            if not document["members"].get("B"):
                raise DeepError("PARTNER_REQUIRED")
            requested = sorted(set(document.get("roundRequests", [])) | {user_id})
            if set(requested) != {member["userId"] for member in document["members"].values()}:
                return {"roundRequests": requested}, {"round": expected_round}
            members = deepcopy(document["members"])
            for member in members.values():
                member.update(revision=member["revision"] + 1, submittedAt=None, confirmedPlanVersion=0, consent=None)
            expires = now + timedelta(days=self.draft_days)
            if document.get("reviewerExpiresAt"):
                expires = min(expires, as_utc(document["reviewerExpiresAt"]))
            return {"round": expected_round + 1, "members": members, "roundRequests": [],
                    "plan.version": document["plan"]["version"] + 1, "reportId": None, "publicationStamp": None,
                    "publicationExpiresAt": None, "status": "collecting",
                    "expiresAt": expires}, {"round": expected_round}
        return await self._change_for_member(session_id, user_id, now, build)

    async def _agreement_session(self, session_id: str, user_id: str, now: datetime) -> dict[str, Any]:
        document = await self.get_for_member(session_id, user_id, now)
        if document["status"] != "ready" or not can_publish(document, now):
            raise DeepError("PUBLICATION_NOT_READY")
        return document

    async def propose_agreement(self, session_id: str, user_id: str, payload: dict[str, Any], now: datetime) -> dict[str, Any]:
        document = await self._agreement_session(session_id, user_id, now)
        if payload["expectedRound"] != document["round"]:
            raise DeepError("ROUND_VERSION_CONFLICT")
        agreement = {"id": str(uuid4()), "sessionId": session_id, "round": document["round"], "version": 1,
                     "text": payload["text"], "reviewOn": payload.get("reviewOn"), "status": "proposed", "confirmations": [],
                     "participants": [member["userId"] for member in document["members"].values()],
                     "createdAt": now, "expiresAt": document["expiresAt"]}
        await self.database["deep_agreements"].insert_one(agreement)
        try:
            current = await self._agreement_session(session_id, user_id, datetime.now(timezone.utc))
            if current["round"] != agreement["round"]:
                raise DeepError("ROUND_VERSION_CONFLICT")
        except DeepError:
            await self.database["deep_agreements"].delete_many({"id": agreement["id"], "sessionId": session_id})
            raise
        return agreement

    async def list_agreements(self, session_id: str, user_id: str, now: datetime) -> list[dict[str, Any]]:
        document = await self._agreement_session(session_id, user_id, now)
        records = await self.database["deep_agreements"].find({
            "sessionId": session_id, "round": document["round"], "expiresAt": {"$gt": now},
        }).to_list(length=None)
        current = await self._agreement_session(session_id, user_id, datetime.now(timezone.utc))
        if current["round"] != document["round"]:
            raise DeepError("ROUND_VERSION_CONFLICT")
        return sorted(records, key=lambda record: (record["createdAt"], record["id"]))

    async def change_agreement(
        self, session_id: str, user_id: str, agreement_id: str, expected_version: int,
        action: str, payload: dict[str, Any], now: datetime,
    ) -> dict[str, Any]:
        collection = self.database["deep_agreements"]
        for _ in range(5):
            document = await self._agreement_session(session_id, user_id, now)
            query = {"id": agreement_id, "sessionId": session_id, "round": document["round"], "expiresAt": {"$gt": now}}
            agreement = await collection.find_one(query)
            if agreement is None or user_id not in agreement["participants"]:
                raise DeepError("NOT_FOUND", 404)
            if agreement["version"] != expected_version:
                raise DeepError("AGREEMENT_VERSION_CONFLICT")
            if action == "confirm":
                changed = confirm_agreement(agreement, user_id, expected_version)
                update = {"$addToSet": {"confirmations": user_id}, "$set": {"status": changed["status"]}}
            else:
                changed = defer_agreement(agreement, expected_version) if action == "defer" else edit_agreement(agreement, expected_version, payload["text"])
                fields = {key: changed[key] for key in ("version", "text", "confirmations", "status")}
                if action == "edit":
                    fields["reviewOn"] = payload.get("reviewOn")
                update = {"$set": fields}
            result = await collection.find_one_and_update(
                {**query, "version": expected_version, "confirmations": agreement["confirmations"], "status": agreement["status"]},
                update, return_document=ReturnDocument.AFTER,
            )
            if result is not None:
                current = await self._agreement_session(session_id, user_id, datetime.now(timezone.utc))
                if current["round"] != document["round"]:
                    raise DeepError("ROUND_VERSION_CONFLICT")
                return result
        raise DeepError("AGREEMENT_VERSION_CONFLICT")

    async def _erase_member_input(self, session_id: str, user_id: str) -> None:
        document = await self.sessions.find_one({"id": session_id})
        if document is None:
            return
        role = member_role(document, user_id)
        await self.sessions.find_one_and_update({"id": session_id, f"members.{role}.userId": user_id}, {"$set": {
            f"members.{role}.input": {}, f"members.{role}.consent": None,
        }})

    async def delete_account_data(self, user_id: str, now: datetime) -> None:
        try:
            await self.database["account_deletions"].find_one_and_update({"userId": user_id}, {"$setOnInsert": {
                "userId": user_id, "requestedAt": now, "completedAt": None,
            }}, upsert=True)
        except DuplicateKeyError:
            # Concurrent delete request already installed the same authorization tombstone.
            pass
        documents = await self.sessions.find({"$or": [{"members.A.userId": user_id}, {"members.B.userId": user_id}]}).to_list(length=None)
        for document in documents:
            await self.withdraw(document["id"], user_id, now)
            await self._erase_member_input(document["id"], user_id)

    async def complete_account_deletion(self, user_id: str, now: datetime) -> None:
        await self.database["account_deletions"].find_one_and_update({"userId": user_id}, {"$set": {
            "completedAt": now, "expiresAt": now + timedelta(days=7),
        }})
