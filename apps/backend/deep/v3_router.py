import hashlib
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request

from auth.dependencies import SettingsDependency, get_enabled_settings, require_account
from deep import router as legacy
from deep.dependencies import (
    PrincipalDependency,
    ServiceDependency,
    require_session_version,
)
from deep.meeting.router import router as meeting_router
from deep.repository import member_role
from deep.router import MUTATION, DeepRoute, IdempotencyKey, limit_mutation
from deep.schemas import (
    ClosedDeepResponse,
    CreateDeepSessionRequest,
    DeepStatusResponse,
    RoundResponse,
    RoundStateResponse,
)
from deep.v3_models import (
    AgreementRequestV3,
    AgreementResponseV3,
    DeepInputV3,
    EditAgreementV3,
    OwnInputV3,
    PlanResponseV3,
    ResultV3,
    SaveInputV3,
    SessionV3,
    SharedPlanV3,
    SubmitV3,
    UpdatePlanV3,
)
from deep.v3_questions import questions_for_input
from deep.v3_report import result_with_agreements
from schemas import ErrorResponse

router = APIRouter(prefix="/api/v1/deep/v3", tags=["deep-v3"], route_class=DeepRoute,
                   dependencies=[Depends(get_enabled_settings), Depends(require_account), Depends(require_session_version)],
                   responses={code: {"model": ErrorResponse} for code in (401, 403, 404, 409, 410, 422, 429, 503)})
router.include_router(meeting_router)


@router.post("/sessions", status_code=201, response_model=SessionV3, dependencies=MUTATION)
async def create_session(request: Request, body: CreateDeepSessionRequest, key: IdempotencyKey,
                         principal: PrincipalDependency, service: ServiceDependency, settings: SettingsDependency) -> dict[str, Any]:
    await limit_mutation(request, principal, service, settings, "create")
    document = await service.repo.create(principal.user_id, key, hashlib.sha256(body.model_dump_json().encode()).hexdigest(),
                                         datetime.now(timezone.utc), question_version="deep-v3")
    return service.session_response(document, principal.user_id)


@router.post("/invitations/{code}/join", response_model=SessionV3, dependencies=MUTATION)
async def join_session(code: str, request: Request, body: CreateDeepSessionRequest, key: IdempotencyKey,
                       principal: PrincipalDependency, service: ServiceDependency, settings: SettingsDependency) -> dict[str, Any]:
    await limit_mutation(request, principal, service, settings, "join")
    document = await service.repo.join(code, principal.user_id, key, datetime.now(timezone.utc), question_version="deep-v3")
    return service.session_response(document, principal.user_id)


@router.get("/sessions/{session_id}/me/questions")
async def own_questions(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    document = await service.repo.get_for_member(session_id, principal.user_id, datetime.now(timezone.utc))
    mine = document["members"][member_role(document, principal.user_id)]["input"]
    return questions_for_input(DeepInputV3.model_validate(mine), SharedPlanV3.model_validate(document["plan"]["data"]))


@router.patch("/sessions/{session_id}/me/input", response_model=OwnInputV3, dependencies=MUTATION)
async def save_input(session_id: str, body: SaveInputV3, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    document = await service.repo.save_input(session_id, principal.user_id, body.expectedRevision,
                                            body.input.model_dump(mode="json"), datetime.now(timezone.utc))
    return service.own_input(document, principal.user_id)


@router.patch("/sessions/{session_id}/plan", response_model=PlanResponseV3, dependencies=MUTATION)
async def update_plan(session_id: str, body: UpdatePlanV3, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    document = await service.repo.update_plan(session_id, principal.user_id, body.expectedVersion,
                                             body.plan.model_dump(mode="json"), datetime.now(timezone.utc))
    return service.plan_response(document, principal.user_id)


@router.post("/sessions/{session_id}/me/submit", response_model=DeepStatusResponse, dependencies=MUTATION)
async def submit(session_id: str, body: SubmitV3, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    consent = {"version": body.consentVersion, "shareFinance": body.shareFinance, "shareValues": body.shareValues}
    document = await service.repo.submit(session_id, principal.user_id, body.expectedRevision, body.planVersion, consent, datetime.now(timezone.utc))
    return service.status_response(document, principal.user_id)


@router.get("/sessions/{session_id}/result", response_model=ResultV3)
async def get_result(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    return await result_with_agreements(service, session_id, principal.user_id)


@router.post("/sessions/{session_id}/agreements", response_model=AgreementResponseV3, status_code=201, dependencies=MUTATION)
async def propose_agreement(session_id: str, request: Request, body: AgreementRequestV3, principal: PrincipalDependency,
                            service: ServiceDependency, settings: SettingsDependency) -> dict[str, Any]:
    await limit_mutation(request, principal, service, settings, "agreement")
    agreement = await service.repo.propose_agreement(session_id, principal.user_id, body.model_dump(mode="json"), datetime.now(timezone.utc))
    return service.agreement_response(agreement, principal.user_id)


@router.patch("/sessions/{session_id}/agreements/{agreement_id}", response_model=AgreementResponseV3, dependencies=MUTATION)
async def edit_agreement(session_id: str, agreement_id: str, body: EditAgreementV3,
                         principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    agreement = await service.repo.change_agreement(session_id, principal.user_id, agreement_id, body.expectedVersion,
                                                    "edit", body.model_dump(mode="json"), datetime.now(timezone.utc))
    return service.agreement_response(agreement, principal.user_id)


# Reuse transport handlers only where their request schema and lifecycle are identical.
# The v3 router still supplies its own response schema and session-version guard.
router.add_api_route("/sessions/{session_id}/me/input", legacy.get_input, methods=["GET"], response_model=OwnInputV3)
router.add_api_route("/sessions/{session_id}/plan", legacy.get_plan, methods=["GET"], response_model=PlanResponseV3)
router.add_api_route("/sessions/{session_id}/plan/confirm", legacy.confirm_plan, methods=["POST"], response_model=PlanResponseV3, dependencies=MUTATION)
router.add_api_route("/sessions/{session_id}/status", legacy.session_status, methods=["GET"], response_model=DeepStatusResponse)
router.add_api_route("/sessions/{session_id}/agreements", legacy.list_agreements, methods=["GET"], response_model=list[AgreementResponseV3])
router.add_api_route("/sessions/{session_id}/agreements/{agreement_id}/confirm", legacy.confirm_agreement, methods=["POST"], response_model=AgreementResponseV3, dependencies=MUTATION)
router.add_api_route("/sessions/{session_id}/agreements/{agreement_id}/defer", legacy.defer_agreement, methods=["POST"], response_model=AgreementResponseV3, dependencies=MUTATION)
router.add_api_route("/sessions/{session_id}/rounds", legacy.get_round, methods=["GET"], response_model=RoundStateResponse)
router.add_api_route("/sessions/{session_id}/rounds", legacy.request_round, methods=["POST"], response_model=RoundResponse, dependencies=MUTATION)
router.add_api_route("/sessions/{session_id}/withdraw", legacy.withdraw, methods=["POST"], response_model=ClosedDeepResponse, dependencies=MUTATION)
