from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from deep.dependencies import PrincipalDependency, ServiceDependency
from deep.meeting.contracts import (
    MeetingContext,
    MeetingExplanation,
    OwnMeeting,
    SaveMeetingAnswers,
    SaveMeetingConsent,
)
from deep.meeting.generation import explanation
from deep.meeting.service import meeting_context
from deep.meeting.storage import MeetingStorage
from deep.router import MUTATION, DeepRoute

router = APIRouter(prefix="/sessions/{session_id}/meeting", route_class=DeepRoute)


@router.get("/me", response_model=OwnMeeting)
async def own_meeting(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    return await MeetingStorage(service.repo).get_own(session_id, principal.user_id, datetime.now(timezone.utc))


@router.patch("/me", response_model=OwnMeeting, dependencies=MUTATION)
async def save_answers(session_id: str, body: SaveMeetingAnswers, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    return await MeetingStorage(service.repo).save_answers(session_id, principal.user_id, body, datetime.now(timezone.utc))


@router.post("/me/consent", response_model=OwnMeeting, dependencies=MUTATION)
async def save_consent(session_id: str, body: SaveMeetingConsent, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    return await MeetingStorage(service.repo).save_consent(session_id, principal.user_id, body, datetime.now(timezone.utc))


@router.delete("/me/consent", response_model=OwnMeeting, dependencies=MUTATION)
async def revoke_consent(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    return await MeetingStorage(service.repo).revoke_consent(session_id, principal.user_id, datetime.now(timezone.utc))


@router.get("/context", response_model=MeetingContext)
async def get_context(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    return await meeting_context(service, session_id, principal.user_id)


@router.get("/explanation", response_model=MeetingExplanation)
async def get_explanation(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    return await explanation(service, session_id, principal.user_id)


@router.post("/explanation", response_model=MeetingExplanation, dependencies=MUTATION)
async def generate_explanation(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    return await explanation(service, session_id, principal.user_id, generate=True)
