import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from deep.errors import DeepError
from deep.meeting.explanation import validate_grounding
from deep.meeting.ledger import reserve_budget
from deep.meeting.models import ExplanationDraft, MeetingBrief
from deep.meeting.provider import (
    MAX_OUTPUT_TOKENS,
    MODEL,
    PROMPT_VERSION,
    RESERVED_INPUT_TOKENS,
    AiSettings,
    OpenAIProvider,
    ProviderFailure,
)
from deep.meeting.service import prepared_context
from deep.meeting.storage import meeting_state
from deep.meeting.templates import template_cards
from deep.repository import as_utc, member_role
from deep.service import DeepService


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Snapshot:
    document: dict[str, Any]
    key: str
    brief: MeetingBrief
    clarifications: dict[str, Any]


async def snapshot(service: DeepService, session_id: str, user_id: str) -> Snapshot | None:
    document, result, context = await prepared_context(service, session_id, user_id)
    if context["status"] == "waiting":
        return None
    role = member_role(document, user_id)
    agreements = [{**{key: item[key] for key in ("id", "version", "status", "terms")},
                   "confirmedA": item["myConfirmed" if role == "A" else "partnerConfirmed"],
                   "confirmedB": item["partnerConfirmed" if role == "A" else "myConfirmed"]}
                  for item in result["agreements"]]
    state = meeting_state(document)
    identity = {"sessionId": session_id, "round": state["round"], "planVersion": state["planVersion"],
                "reportId": state["reportId"], "members": state["members"],
                "agreements": sorted(agreements, key=lambda item: item["id"]),
                "brief": context["brief"].model_dump(mode="json"), "model": MODEL, "promptVersion": PROMPT_VERSION}
    key = hashlib.sha256(json.dumps(identity, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()
    return Snapshot(document, key, context["brief"], context["clarifications"])


def fallback(current: Snapshot, reason: str) -> dict[str, Any]:
    return {"status": "ready", "source": "template", "reason": reason,
            "brief": current.brief, "cards": template_cards(current.brief, current.clarifications)}


async def still_current(service: DeepService, session_id: str, user_id: str, key: str) -> Snapshot:
    current = await snapshot(service, session_id, user_id)
    if current is None or current.key != key:
        raise DeepError("REVISION_CONFLICT")
    return current


async def explanation(service: DeepService, session_id: str, user_id: str, *, generate: bool = False) -> dict[str, Any]:
    current = await snapshot(service, session_id, user_id)
    if current is None:
        return {"status": "waiting"}
    settings = AiSettings.load()
    if not settings.enabled:
        return fallback(current, "disabled")
    if not current.brief.issues:
        return fallback(current, "no_issues")
    cached = meeting_state(current.document).get("generation")
    if cached and cached["key"] == current.key:
        try:
            draft = validate_grounding(ExplanationDraft.model_validate({"cards": cached["cards"]}), current.brief)
        except (ValidationError, DeepError):
            return fallback(current, "provider_unavailable")
        return {"status": "ready", "source": "ai", "reason": None, "brief": current.brief, "cards": draft.cards}

    attempts = service.repo.database["deep_meeting_attempts"]
    existing = await attempts.find_one({"_id": current.key})
    current = await still_current(service, session_id, user_id, current.key)
    if existing:
        reason = existing["status"]
        if reason == "pending" and as_utc(existing["deadline"]) <= utcnow():
            reason = "interrupted"
        # A completed attempt without its matching cache must never trigger another paid call.
        return fallback(current, "interrupted" if reason == "completed" else reason)
    if not generate:
        return fallback(current, "not_generated")

    now = utcnow()
    attempt_key = current.key
    deadline = now + timedelta(seconds=30)
    try:
        await attempts.insert_one({"_id": current.key, "sessionId": session_id, "status": "pending",
                                   "deadline": deadline, "expiresAt": current.document["expiresAt"]})
    except DuplicateKeyError:
        return await explanation(service, session_id, user_id)

    async def finish(status: str) -> None:
        await attempts.find_one_and_update({"_id": attempt_key}, {"$set": {"status": status}})

    budgets = service.repo.database["deep_meeting_budgets"]
    try:
        day = await reserve_budget(budgets, settings, now)
        if day is None:
            await finish("budget_exhausted")
            current = await still_current(service, session_id, user_id, current.key)
            return fallback(current, "budget_exhausted")
        current = await still_current(service, session_id, user_id, current.key)
        if utcnow() >= deadline or utcnow().date().isoformat() != day:
            await finish("interrupted")
            return fallback(current, "interrupted")
        try:
            generated = await OpenAIProvider(settings).generate(current.brief, current.clarifications)
            if generated.input_tokens > RESERVED_INPUT_TOKENS or generated.output_tokens > MAX_OUTPUT_TOKENS:
                raise ProviderFailure(budget_violation=True)
        except ProviderFailure as error:
            if error.budget_violation:
                await budgets.find_one_and_update({"_id": day}, {"$set": {"halted": True}})
            await finish("provider_unavailable")
            current = await still_current(service, session_id, user_id, current.key)
            return fallback(current, "provider_unavailable")
        current = await still_current(service, session_id, user_id, current.key)
        if utcnow() >= deadline:
            await finish("interrupted")
            return fallback(current, "interrupted")
        draft = validate_grounding(generated.draft, current.brief)
        state = meeting_state(current.document)
        state["generation"] = {"key": current.key, "cards": draft.model_dump(mode="json")["cards"]}
        updated = await service.repo._commit(current.document, {"meeting": state}, utcnow())
        if updated is None:
            raise DeepError("REVISION_CONFLICT")
        await still_current(service, session_id, user_id, current.key)
        await attempts.find_one_and_update({"_id": attempt_key}, {"$set": {
            "inputTokens": generated.input_tokens, "outputTokens": generated.output_tokens,
            "model": MODEL, "promptVersion": PROMPT_VERSION,
        }})
        await finish("completed")
        return await explanation(service, session_id, user_id)
    except DeepError as error:
        if error.status_code in (404, 410):
            # Closing/purge may have completed just before this attempt was inserted.
            await attempts.delete_one({"_id": attempt_key})
        else:
            await finish("interrupted")
        raise
