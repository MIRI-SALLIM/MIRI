import hashlib
from collections.abc import Callable, Coroutine
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pymongo.errors import PyMongoError
from starlette.exceptions import HTTPException

from auth.dependencies import (
    ACCOUNT_COOKIE,
    RepositoryDependency,
    SettingsDependency,
    get_enabled_settings,
    require_account,
    require_trusted_origin,
)
from auth.errors import AuthError
from auth.security import token_digest
from deep.config import load_questions
from deep.dependencies import PrincipalDependency, ServiceDependency
from deep.engine.funding import calculate_funding
from deep.errors import DeepError
from deep.funding_models import FundingPreviewRequest, FundingPreviewResponse
from deep.lifecycle import delete_account
from deep.schemas import (
    AgreementRequest,
    AgreementResponse,
    ClosedDeepResponse,
    ConfirmSharedPlanRequest,
    CreateDeepSessionRequest,
    DeepResultResponse,
    DeepSessionResponse,
    DeepStatusResponse,
    EditAgreementRequest,
    OwnDeepInputResponse,
    RoundRequest,
    RoundResponse,
    RoundStateResponse,
    SaveDeepInputRequest,
    SharedPlanResponse,
    SubmitDeepInputRequest,
    UpdateSharedPlanRequest,
    VersionRequest,
)
from schemas import ErrorResponse, QuestionSet


class DeepRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            try:
                return await original(request)
            except PyMongoError:
                raise DeepError("DEEP_UNAVAILABLE", 503) from None
            except RequestValidationError:
                if request.url.path == "/api/v1/deep/funding/preview":
                    # Validation locations may include arbitrary user-provided JSON keys.
                    # Keep this new endpoint private without changing legacy error contracts.
                    raise DeepError("INVALID_FUNDING_INPUT", 422) from None
                raise
            except (DeepError, AuthError, HTTPException):
                raise
            except Exception:  # noqa: BLE001 - privacy boundary: never log stored data via exceptions
                # Stored financial data can appear in validation exceptions. Never send
                # their traceback/message to generic server error or access logs.
                raise DeepError("DEEP_UNAVAILABLE", 503) from None
        return handler


router = APIRouter(prefix="/api/v1/deep", tags=["deep"], route_class=DeepRoute,
                   dependencies=[Depends(get_enabled_settings), Depends(require_account)],
                   responses={code: {"model": ErrorResponse} for code in (401, 403, 404, 409, 410, 422, 429, 503)})
MUTATION = [Depends(require_trusted_origin)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_-]+$")]


def error_response(error: DeepError) -> JSONResponse:
    messages = {401: "이 작업에는 최근 로그인이 필요합니다.", 404: "사용할 수 없는 리소스입니다.", 409: "상태가 변경되었거나 현재 허용되지 않는 작업입니다. 다시 확인해 주세요.",
                410: "만료되거나 종료된 진단입니다.", 422: "입력 항목을 확인해 주세요.",
                429: "요청이 많습니다. 잠시 후 다시 시도해 주세요.", 503: "저장소를 일시적으로 사용할 수 없습니다."}
    return JSONResponse(status_code=error.status_code, content={"error": {
        "code": error.code, "message": messages.get(error.status_code, "요청을 처리할 수 없습니다."), "fieldErrors": error.field_errors,
    }})


async def limit_mutation(
    request: Request, principal: PrincipalDependency, service: ServiceDependency, settings: SettingsDependency, action: str,
) -> None:
    ip = request.client.host if request.client else "unknown"
    for kind, value in (("user", principal.user_id), ("ip", ip)):
        key = token_digest(f"deep-{action}:{kind}:{value}", settings.session_pepper)
        if not await service.repo.allow_attempt(key, action + "-" + kind, datetime.now(timezone.utc)):
            raise DeepError("RATE_LIMITED", 429)


@router.post("/funding/preview", response_model=FundingPreviewResponse, dependencies=MUTATION,
             summary="본인이 입력한 재원의 날짜별 개인 미리보기",
             description="입력만 계산하며 저장하거나 상대 데이터를 읽지 않습니다. 공동 결과나 합의가 아닙니다.")
async def preview_funding(
    request: Request, body: FundingPreviewRequest, principal: PrincipalDependency,
    service: ServiceDependency, settings: SettingsDependency,
) -> FundingPreviewResponse:
    await limit_mutation(request, principal, service, settings, "funding-preview")
    return calculate_funding(body)


@router.get("/questions", response_model=QuestionSet)
async def questions(version: Annotated[str, Query(max_length=32)] = "deep-v2") -> dict[str, Any]:
    try:
        configuration = load_questions(version)
    except ValueError:
        raise DeepError("QUESTION_SET_NOT_FOUND", 404) from None
    rows = []
    for order, item in enumerate(configuration["questions"], 1):
        rows.append({"id": item["id"], "order": order, "category": item["category"], "target": "self",
                     "text": item["text"], "subText": "본인의 생각에 가까운 점수를 선택하거나 건너뛰세요.", "type": "scale",
                     "scaleConfig": {"min": 1, "max": 5, "leftLabel": item["left"], "rightLabel": item["right"],
                                     "steps": [f'1점: 매우 {item["left"]}', f'2점: 약간 {item["left"]}', "3점: 중간 / 보통",
                                               f'4점: 약간 {item["right"]}', f'5점: 매우 {item["right"]}']}})
    return {"version": version, "title": "함께 살 돈의 기준", "description": "5개 영역의 대화를 위한 질문입니다.", "questions": rows}


@router.post("/sessions", status_code=201, response_model=DeepSessionResponse, dependencies=MUTATION)
async def create_session(
    request: Request, body: CreateDeepSessionRequest, key: IdempotencyKey,
    principal: PrincipalDependency, service: ServiceDependency, settings: SettingsDependency,
) -> dict[str, Any]:
    await limit_mutation(request, principal, service, settings, "create")
    payload_hash = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
    document = await service.repo.create(principal.user_id, key, payload_hash, datetime.now(timezone.utc))
    return service.session_response(document, principal.user_id)


@router.post("/invitations/{code}/join", response_model=DeepSessionResponse, dependencies=MUTATION)
async def join_session(
    code: str, request: Request, body: CreateDeepSessionRequest, key: IdempotencyKey,
    principal: PrincipalDependency, service: ServiceDependency, settings: SettingsDependency,
) -> dict[str, Any]:
    await limit_mutation(request, principal, service, settings, "join")
    document = await service.repo.join(code, principal.user_id, key, datetime.now(timezone.utc))
    return service.session_response(document, principal.user_id)


@router.get("/sessions/{session_id}/me/input", response_model=OwnDeepInputResponse)
async def get_input(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    document = await service.repo.get_for_member(session_id, principal.user_id, datetime.now(timezone.utc))
    return service.own_input(document, principal.user_id)


@router.patch("/sessions/{session_id}/me/input", response_model=OwnDeepInputResponse, dependencies=MUTATION)
async def save_input(
    session_id: str, body: SaveDeepInputRequest, principal: PrincipalDependency, service: ServiceDependency,
) -> dict[str, Any]:
    document = await service.repo.save_input(session_id, principal.user_id, body.expectedRevision,
                                             body.input.model_dump(mode="json"), datetime.now(timezone.utc))
    return service.own_input(document, principal.user_id)


@router.get("/sessions/{session_id}/plan", response_model=SharedPlanResponse)
async def get_plan(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    document = await service.repo.get_for_member(session_id, principal.user_id, datetime.now(timezone.utc))
    return service.plan_response(document, principal.user_id)


@router.patch("/sessions/{session_id}/plan", response_model=SharedPlanResponse, dependencies=MUTATION)
async def update_plan(
    session_id: str, body: UpdateSharedPlanRequest, principal: PrincipalDependency, service: ServiceDependency,
) -> dict[str, Any]:
    document = await service.repo.update_plan(session_id, principal.user_id, body.expectedVersion,
                                              body.plan.model_dump(mode="json"), datetime.now(timezone.utc))
    return service.plan_response(document, principal.user_id)


@router.post("/sessions/{session_id}/plan/confirm", response_model=SharedPlanResponse, dependencies=MUTATION)
async def confirm_plan(
    session_id: str, body: ConfirmSharedPlanRequest, principal: PrincipalDependency, service: ServiceDependency,
) -> dict[str, Any]:
    document = await service.repo.confirm_plan(session_id, principal.user_id, body.planVersion, datetime.now(timezone.utc))
    return service.plan_response(document, principal.user_id)


@router.post("/sessions/{session_id}/me/submit", response_model=DeepStatusResponse, dependencies=MUTATION)
async def submit(
    session_id: str, body: SubmitDeepInputRequest, principal: PrincipalDependency, service: ServiceDependency,
) -> dict[str, Any]:
    consent = {"version": body.consentVersion, "shareFinance": body.shareFinance, "shareValues": body.shareValues}
    document = await service.repo.submit(session_id, principal.user_id, body.expectedRevision,
                                         body.planVersion, consent, datetime.now(timezone.utc))
    return service.status_response(document, principal.user_id)


@router.get("/sessions/{session_id}/status", response_model=DeepStatusResponse)
async def session_status(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    document = await service.repo.get_for_member(session_id, principal.user_id, datetime.now(timezone.utc))
    return service.status_response(document, principal.user_id)


@router.get("/sessions/{session_id}/result", response_model=DeepResultResponse)
async def get_result(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    return await service.result(session_id, principal.user_id)


@router.post("/sessions/{session_id}/agreements", response_model=AgreementResponse, status_code=201, dependencies=MUTATION)
async def propose_agreement(
    session_id: str, request: Request, body: AgreementRequest, principal: PrincipalDependency,
    service: ServiceDependency, settings: SettingsDependency,
) -> dict[str, Any]:
    await limit_mutation(request, principal, service, settings, "agreement")
    agreement = await service.repo.propose_agreement(session_id, principal.user_id, body.model_dump(mode="json"), datetime.now(timezone.utc))
    return service.agreement_response(agreement, principal.user_id)


@router.get("/sessions/{session_id}/agreements", response_model=list[AgreementResponse])
async def list_agreements(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> list[dict[str, Any]]:
    agreements = await service.repo.list_agreements(session_id, principal.user_id, datetime.now(timezone.utc))
    return [service.agreement_response(agreement, principal.user_id) for agreement in agreements]


@router.patch("/sessions/{session_id}/agreements/{agreement_id}", response_model=AgreementResponse, dependencies=MUTATION)
async def edit_agreement(
    session_id: str, agreement_id: str, body: EditAgreementRequest, principal: PrincipalDependency, service: ServiceDependency,
) -> dict[str, Any]:
    agreement = await service.repo.change_agreement(session_id, principal.user_id, agreement_id, body.expectedVersion,
                                                    "edit", body.model_dump(mode="json"), datetime.now(timezone.utc))
    return service.agreement_response(agreement, principal.user_id)


@router.post("/sessions/{session_id}/agreements/{agreement_id}/confirm", response_model=AgreementResponse, dependencies=MUTATION)
async def confirm_agreement(
    session_id: str, agreement_id: str, body: VersionRequest, principal: PrincipalDependency, service: ServiceDependency,
) -> dict[str, Any]:
    agreement = await service.repo.change_agreement(session_id, principal.user_id, agreement_id, body.expectedVersion,
                                                    "confirm", {}, datetime.now(timezone.utc))
    return service.agreement_response(agreement, principal.user_id)


@router.post("/sessions/{session_id}/agreements/{agreement_id}/defer", response_model=AgreementResponse, dependencies=MUTATION)
async def defer_agreement(
    session_id: str, agreement_id: str, body: VersionRequest, principal: PrincipalDependency, service: ServiceDependency,
) -> dict[str, Any]:
    agreement = await service.repo.change_agreement(session_id, principal.user_id, agreement_id, body.expectedVersion,
                                                    "defer", {}, datetime.now(timezone.utc))
    return service.agreement_response(agreement, principal.user_id)


@router.get("/sessions/{session_id}/rounds", response_model=RoundStateResponse)
async def get_round(session_id: str, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, Any]:
    document = await service.repo.get_for_member(session_id, principal.user_id, datetime.now(timezone.utc))
    requests = document.get("roundRequests", [])
    return {"round": document["round"], "myRequested": principal.user_id in requests,
            "partnerRequested": any(user != principal.user_id for user in requests)}


@router.post("/sessions/{session_id}/rounds", response_model=RoundResponse, dependencies=MUTATION)
async def request_round(
    session_id: str, body: RoundRequest, principal: PrincipalDependency, service: ServiceDependency,
) -> dict[str, Any]:
    document = await service.repo.request_round(session_id, principal.user_id, body.expectedRound, datetime.now(timezone.utc))
    return {"round": document["round"], "pending": document["round"] == body.expectedRound}


@router.post("/sessions/{session_id}/withdraw", response_model=ClosedDeepResponse, dependencies=MUTATION)
async def withdraw(session_id: str, body: CreateDeepSessionRequest, principal: PrincipalDependency, service: ServiceDependency) -> dict[str, str]:
    await service.repo.withdraw(session_id, principal.user_id, datetime.now(timezone.utc))
    return {"status": "closed"}


account_router = APIRouter(prefix="/api/v1/auth", tags=["account"], route_class=DeepRoute,
                           dependencies=[Depends(get_enabled_settings), Depends(require_trusted_origin)])


@account_router.delete("/account", status_code=204, responses={code: {"model": ErrorResponse} for code in (401, 403, 503)})
async def delete_my_account(
    principal: PrincipalDependency, service: ServiceDependency, repo: RepositoryDependency, settings: SettingsDependency,
) -> Response:
    await delete_account(principal, service.repo, repo, datetime.now(timezone.utc))
    response = Response(status_code=204)
    response.delete_cookie(ACCOUNT_COOKIE, path="/", httponly=True, secure=settings.secure_cookie, samesite="lax")
    return response
