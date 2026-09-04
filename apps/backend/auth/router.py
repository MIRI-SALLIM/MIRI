from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Query, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from pymongo.errors import PyMongoError

from auth.dependencies import (
    ACCOUNT_COOKIE,
    BROWSER_COOKIE,
    RepositoryDependency,
    SettingsDependency,
    TokenDependency,
    get_auth_service,
    get_enabled_settings,
    require_account,
    require_trusted_origin,
)
from auth.errors import AuthError
from auth.models import Principal
from auth.repository import CHALLENGE_LIFETIME, SESSION_LIFETIME, AuthRepository
from auth.security import token_digest
from auth.service import AuthService
from auth.settings import AuthSettings

router = APIRouter(prefix="/api/v1/auth", tags=["account"], dependencies=[Depends(get_enabled_settings)])
ServiceDependency = Annotated[AuthService, Depends(get_auth_service)]
PrincipalDependency = Annotated[Principal, Depends(require_account)]

ERROR_MESSAGES = {
    "AUTH_REQUIRED": "로그인이 필요합니다.",
    "AUTH_RESTART_REQUIRED": "로그인을 처음부터 다시 시도해 주세요.",
    "AUTH_PROVIDER_UNAVAILABLE": "카카오 로그인에 일시적으로 연결할 수 없습니다.",
    "AUTH_UNAVAILABLE": "로그인 서비스를 일시적으로 사용할 수 없습니다.",
    "AUTH_RATE_LIMITED": "로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    "INVALID_RETURN_TO": "올바르지 않은 로그인 복귀 경로입니다.",
    "UNTRUSTED_ORIGIN": "허용되지 않은 요청 출처입니다.",
    "REVIEWER_LOGIN_FAILED": "로그인 정보 또는 체험방 코드를 확인해 주세요.",
    "REVIEWER_ACCOUNT_REQUIRED": "심사용 계정에서만 사용할 수 있습니다.",
    "RESET_CONFIRMATION_REQUIRED": "현재 체험을 종료하고 다시 시작할지 확인해 주세요.",
    "REVIEWER_RESET_CONFLICT": "이미 초기화된 체험입니다. 새로 로그인해 주세요.",
}


def error_response(error: AuthError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content={"error": {
        "code": error.code, "message": ERROR_MESSAGES.get(error.code, "로그인 처리에 실패했습니다."),
        "fieldErrors": {},
    }}, headers={"Referrer-Policy": "no-referrer", "Cache-Control": "no-store"})


def clear_browser_cookie(response: Response, settings: AuthSettings) -> None:
    response.delete_cookie(BROWSER_COOKIE, path="/", httponly=True,
                           secure=settings.secure_cookie, samesite="lax")


async def check_attempt(
    request: Request, repo: AuthRepository, settings: AuthSettings, action: str, limit: int, now: datetime,
) -> None:
    ip = request.client.host if request.client else "unknown"
    # Trust only ASGI's peer. Forwarded headers require deployment-level proxy allowlisting.
    ip_hash = token_digest("auth-rate:" + ip, settings.session_pepper)
    if not await repo.allow_attempt(ip_hash, action, limit, now):
        raise AuthError("AUTH_RATE_LIMITED", 429)


@router.get("/kakao/start", status_code=302, response_class=RedirectResponse)
async def start_login(
    request: Request, service: ServiceDependency,
    return_to: Annotated[str, Query(alias="returnTo", max_length=512)] = "/deep",
) -> Response:
    now = datetime.now(timezone.utc)
    try:
        await check_attempt(request, service.repo, service.settings, "start", 20, now)
        result = await service.begin_login(return_to, now)
    except PyMongoError:
        raise AuthError("AUTH_UNAVAILABLE", 503) from None
    response = RedirectResponse(result["authorizationUrl"], status_code=302)
    response.headers["Referrer-Policy"] = "no-referrer"
    response.set_cookie(BROWSER_COOKIE, result["browserToken"], httponly=True,
                        secure=service.settings.secure_cookie, samesite="lax",
                        max_age=int(CHALLENGE_LIFETIME.total_seconds()), path="/")
    return response


@router.get("/kakao/callback", status_code=302, response_class=RedirectResponse)
async def finish_login(
    request: Request, service: ServiceDependency,
    code: Annotated[str, Query(max_length=2048)] = "",
    state: Annotated[str, Query(max_length=128)] = "",
    error: Annotated[str, Query(max_length=256)] = "",
    browser_token: Annotated[str, Cookie(alias=BROWSER_COOKIE)] = "",
) -> Response:
    now = datetime.now(timezone.utc)
    try:
        await check_attempt(request, service.repo, service.settings, "callback", 40, now)
        result = await service.finish_login("" if error else code, state, browser_token, now)
        response: Response = RedirectResponse(result["returnTo"], status_code=302)
        response.set_cookie(ACCOUNT_COOKIE, result["accountToken"], httponly=True,
                            secure=service.settings.secure_cookie, samesite="lax",
                            max_age=int(SESSION_LIFETIME.total_seconds()), path="/")
    except AuthError as exc:
        response = error_response(exc)
    except PyMongoError:
        response = error_response(AuthError("AUTH_UNAVAILABLE", 503))
    clear_browser_cookie(response, service.settings)
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


class AccountResponse(BaseModel):
    userId: str


@router.get("/me", response_model=AccountResponse)
async def account_me(principal: PrincipalDependency) -> AccountResponse:
    return AccountResponse(userId=principal.user_id)


@router.post("/logout", status_code=204, dependencies=[Depends(require_trusted_origin)])
async def logout(
    principal: PrincipalDependency, token: TokenDependency,
    repo: RepositoryDependency, settings: SettingsDependency,
) -> Response:
    try:
        await repo.revoke_session(token_digest(token, settings.session_pepper))
    except PyMongoError:
        raise AuthError("AUTH_UNAVAILABLE", 503) from None
    response = Response(status_code=204)
    response.delete_cookie(ACCOUNT_COOKIE, path="/", httponly=True,
                           secure=settings.secure_cookie, samesite="lax")
    return response
