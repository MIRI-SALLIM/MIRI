from datetime import datetime, timezone
from typing import Any

from deep.errors import DeepError
from deep.meeting.brief import build_brief
from deep.meeting.contracts import CURRENT_CONSENT_VERSION
from deep.meeting.models import MeetingPermissions
from deep.meeting.provider import AiSettings
from deep.meeting.storage import meeting_state, require_ready
from deep.service import DeepService
from deep.v3_report import result_with_agreements


async def prepared_context(service: DeepService, session_id: str, user_id: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    now = datetime.now(timezone.utc)
    before = await service.repo.get_for_member(session_id, user_id, now)
    require_ready(before, now)
    state = meeting_state(before)
    for mine in state["members"].values():
        consent = mine["consent"] or {}
        if (mine["answers"] is None or consent.get("consentVersion") != CURRENT_CONSENT_VERSION
                or consent.get("shareWithPartner") is not True or consent.get("allowAiProcessing") is not True):
            return before, {}, {"status": "waiting"}
    result = await result_with_agreements(service, session_id, user_id)
    after = await service.repo.get_for_member(session_id, user_id, datetime.now(timezone.utc))
    require_ready(after, datetime.now(timezone.utc))
    if before["version"] != after["version"]:
        raise DeepError("REVISION_CONFLICT")
    # These permissions are derived from server state above, never from the HTTP payload.
    brief = build_brief(result, MeetingPermissions(aiA=True, aiB=True, financeA=True, financeB=True))
    return after, result, {"status": "ready", "providerStatus": "configured" if AiSettings.load().enabled else "disabled", "brief": brief,
                           "clarifications": {role: state["members"][role]["answers"] for role in ("A", "B")}}


async def meeting_context(service: DeepService, session_id: str, user_id: str) -> dict[str, Any]:
    return (await prepared_context(service, session_id, user_id))[2]
