from copy import deepcopy
from datetime import datetime
from typing import Any

from deep.errors import DeepError
from deep.meeting.contracts import (
    CURRENT_CONSENT_VERSION,
    MeetingWrite,
    SaveMeetingAnswers,
    SaveMeetingConsent,
)
from deep.meeting.questions import CONSENT_NOTICE, questions
from deep.repository import DeepRepository, member_role
from deep.state import can_publish, publication_stamp


def require_ready(document: dict[str, Any], now: datetime) -> None:
    if document["questionVersion"] != "deep-v3":
        raise DeepError("NOT_FOUND", 404)
    if (document["status"] != "ready" or not document.get("reportId") or not can_publish(document, now)
            or document.get("publicationStamp") != publication_stamp(document)):
        raise DeepError("MEETING_REPORT_NOT_READY")
    if not all(member["consent"]["shareFinance"] is True for member in document["members"].values()):
        raise DeepError("MEETING_FINANCE_NOT_SHARED")


def meeting_state(document: dict[str, Any]) -> dict[str, Any]:
    context = {"round": document["round"], "planVersion": document["plan"]["version"], "reportId": document.get("reportId")}
    stored = document.get("meeting")
    if stored and all(stored.get(key) == value for key, value in context.items()):
        return deepcopy(stored)
    return {**context, "members": {role: {"revision": 0, "answers": None, "consent": None} for role in ("A", "B")}}


def own_response(document: dict[str, Any], user_id: str) -> dict[str, Any]:
    state = meeting_state(document)
    mine = state["members"][member_role(document, user_id)]
    if mine["consent"] and mine["consent"].get("consentVersion") != CURRENT_CONSENT_VERSION:
        mine["consent"] = None
    return {"round": state["round"], "planVersion": state["planVersion"],
            **mine, "questions": questions(),
            "consentVersion": CURRENT_CONSENT_VERSION, "consentNotice": CONSENT_NOTICE}


def check_write(document: dict[str, Any], mine: dict[str, Any], body: MeetingWrite) -> None:
    if body.expectedRound != document["round"]:
        raise DeepError("ROUND_VERSION_CONFLICT")
    if body.planVersion != document["plan"]["version"]:
        raise DeepError("PLAN_VERSION_CONFLICT")
    if body.expectedRevision != mine["revision"]:
        raise DeepError("REVISION_CONFLICT")


class MeetingStorage:
    def __init__(self, repo: DeepRepository) -> None:
        self.repo = repo

    async def get_own(self, session_id: str, user_id: str, now: datetime) -> dict[str, Any]:
        document = await self.repo.get_for_member(session_id, user_id, now)
        require_ready(document, now)
        return own_response(document, user_id)

    async def save_answers(self, session_id: str, user_id: str, body: SaveMeetingAnswers, now: datetime) -> dict[str, Any]:
        def build(document: dict[str, Any], role: str) -> tuple[dict[str, Any], dict[str, Any]]:
            require_ready(document, now)
            state = meeting_state(document)
            mine = state["members"][role]
            check_write(document, mine, body)
            offered = document["members"][role]["input"]["contribution"]["ownMonthly"]["value"]
            if offered is None and body.answers.contributionMeaning != "unknown":
                raise DeepError("MEETING_KNOWN_CONTRIBUTION_REQUIRED", 422)
            limit = body.answers.adjustableMonthlyWon
            if limit is not None and (offered is None or limit < offered):
                raise DeepError("MEETING_ADJUSTMENT_BELOW_PROPOSAL", 422)
            mine.update(revision=mine["revision"] + 1, answers=body.answers.model_dump(mode="json"), consent=None)
            state.pop("generation", None)
            return {"meeting": state}, {}
        updated = await self.repo._change_for_member(session_id, user_id, now, build)
        return own_response(updated, user_id)

    async def save_consent(self, session_id: str, user_id: str, body: SaveMeetingConsent, now: datetime) -> dict[str, Any]:
        def build(document: dict[str, Any], role: str) -> tuple[dict[str, Any], dict[str, Any]]:
            require_ready(document, now)
            state = meeting_state(document)
            mine = state["members"][role]
            check_write(document, mine, body)
            if mine["answers"] is None:
                raise DeepError("MEETING_ANSWERS_REQUIRED")
            mine.update(revision=mine["revision"] + 1, consent={
                "consentVersion": body.consentVersion, "shareWithPartner": body.shareWithPartner,
                "allowAiProcessing": body.allowAiProcessing, "recordedAt": now,
            })
            state.pop("generation", None)
            return {"meeting": state}, {}
        updated = await self.repo._change_for_member(session_id, user_id, now, build)
        return own_response(updated, user_id)

    async def revoke_consent(self, session_id: str, user_id: str, now: datetime) -> dict[str, Any]:
        def build(document: dict[str, Any], role: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
            if document["questionVersion"] != "deep-v3":
                raise DeepError("NOT_FOUND", 404)
            state = meeting_state(document)
            mine = state["members"][role]
            if mine["consent"] is None and not state.get("generation"):
                return None
            mine.update(revision=mine["revision"] + 1, consent=None)
            state.pop("generation", None)
            return {"meeting": state}, {}
        updated = await self.repo._change_for_member(session_id, user_id, now, build)
        return own_response(updated, user_id)
