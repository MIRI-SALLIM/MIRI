from datetime import datetime, timezone
from typing import Any

from deep.meeting.contracts import CompleteMeeting
from deep.meeting.generation import explanation
from deep.meeting.storage import MeetingStorage
from deep.service import DeepService


async def complete_meeting(service: DeepService, session_id: str, user_id: str, body: CompleteMeeting) -> dict[str, Any]:
    own = await MeetingStorage(service.repo).complete(session_id, user_id, body, datetime.now(timezone.utc))
    result = await explanation(service, session_id, user_id, generate=body.allowAiProcessing,
                               expected_revision=own["revision"], require_total_budget=True)
    return {"own": own, "explanation": result}
