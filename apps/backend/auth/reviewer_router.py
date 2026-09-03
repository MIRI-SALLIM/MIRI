import os
import secrets
from collections.abc import Callable, Coroutine
from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from starlette.concurrency import run_in_threadpool

from auth.dependencies import (
    ACCOUNT_COOKIE,
    RepositoryDependency,
    SettingsDependency,
    require_account,
    require_trusted_origin,
)
from auth.errors import AuthError
from auth.models import Principal
from auth.passwords import verify_password
from auth.repository import AuthRepository
from auth.reviewer_repository import ReviewerRepository, room_code
from auth.reviewer_settings import ReviewerSettings, load_reviewer_settings
from auth.router import check_attempt
from auth.security import token_digest
from auth.settings import AuthSettings
from schemas import ErrorResponse


class ReviewerRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            try:
                return await original(request)
            except (AuthError, HTTPException, RequestValidationError):
                raise
            except Exception:  # noqa: BLE001 - credentials and room codes must not appear in tracebacks
                raise AuthError("AUTH_UNAVAILABLE", 503) from None
        return handler


def require_reviewer_enabled(settings: SettingsDependency) -> ReviewerSettings:
    if not settings.reviewer_enabled:
        raise HTTPException(status_code=404, detail="사용할 수 없는 기능입니다.")
    return load_reviewer_settings(os.environ)


ReviewSettingsDependency = Annotated[ReviewerSettings, Depends(require_reviewer_enabled)]
PrincipalDependency = Annotated[Principal, Depends(require_account)]
router = APIRouter(prefix="/api/v1/auth/reviewer", tags=["reviewer"], route_class=ReviewerRoute,
                   dependencies=[Depends(require_reviewer_enabled)],
                   responses={code: {"model": ErrorResponse} for code in (401, 403, 404, 409, 422, 429, 503)})


class ReviewerLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Literal["judge-a", "judge-b"]
    password: SecretStr = Field(min_length=1, max_length=128)
    roomCode: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


class ReviewerResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    confirm: bool


class ReviewerContextResponse(BaseModel):
    userId: str
    role: Literal["A", "B"]
    roomCode: str
    expiresAt: datetime
    demo: Literal[True] = True


def context(room: dict[str, Any], role: str, settings: AuthSettings) -> ReviewerContextResponse:
    if role not in {"A", "B"}:
        raise AuthError("AUTH_REQUIRED")
    # PyMongo's default decoding returns naive UTC; the wire timestamp must be unambiguous.
    expires = room["expiresAt"]
    expires = expires.replace(tzinfo=timezone.utc) if expires.tzinfo is None else expires.astimezone(timezone.utc)
    return ReviewerContextResponse(userId=room["users"][role], role="A" if role == "A" else "B",
                                   roomCode=room_code(room["id"], settings.session_pepper), expiresAt=expires)


async def authenticated_room(principal: Principal, repo: AuthRepository, now: datetime) -> dict[str, Any]:
    if principal.provider != "reviewer" or not principal.reviewer_run_id:
        raise AuthError("REVIEWER_ACCOUNT_REQUIRED", 403)
    room = await ReviewerRepository(repo.database).active_room(principal.reviewer_run_id, now)
    if room is None or room["users"].get(principal.reviewer_role) != principal.user_id:
        raise AuthError("AUTH_REQUIRED")
    return room


async def set_session(
    room: dict[str, Any], role: str, response: Response, repo: AuthRepository, settings: AuthSettings, now: datetime,
) -> ReviewerContextResponse:
    uid = room["users"][role]
    user = await repo.database["users"].find_one({"id": uid, "provider": "reviewer"})
    if user is None:
        raise AuthError("REVIEWER_LOGIN_FAILED")
    token = secrets.token_urlsafe(32)
    expires = room["expiresAt"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    await repo.issue_session(uid, token_digest(token, settings.session_pepper), now, expires)
    # A concurrent reset must not grant a usable session for the old room.
    if await ReviewerRepository(repo.database).active_room(room["id"], datetime.now(timezone.utc)) is None:
        await repo.revoke_session(token_digest(token, settings.session_pepper))
        raise AuthError("AUTH_REQUIRED")
    response.set_cookie(ACCOUNT_COOKIE, token, httponly=True, secure=settings.secure_cookie,
                        samesite="lax", max_age=max(0, int((expires - now).total_seconds())), path="/")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return context(room, role, settings)


@router.post("/login", response_model=ReviewerContextResponse, dependencies=[Depends(require_trusted_origin)])
async def reviewer_login(
    payload: ReviewerLoginRequest, request: Request, response: Response,
    repo: RepositoryDependency, settings: SettingsDependency, review: ReviewSettingsDependency,
) -> ReviewerContextResponse:
    now = datetime.now(timezone.utc)
    await check_attempt(request, repo, settings, "reviewer-login", 20, now)
    if not await repo.allow_attempt(token_digest("reviewer-global", settings.session_pepper), "reviewer-login", 200, now):
        raise AuthError("AUTH_RATE_LIMITED", 429)
    role = "A" if payload.username == "judge-a" else "B"
    encoded = review.a_hash if role == "A" else review.b_hash
    if not await run_in_threadpool(verify_password, payload.password.get_secret_value(), encoded):
        raise AuthError("REVIEWER_LOGIN_FAILED")
    rooms = ReviewerRepository(repo.database)
    if payload.roomCode is None:
        room = await rooms.create_room(review.version, settings.session_pepper, now)
    else:
        room = await rooms.find_room(payload.roomCode, review.version, settings.session_pepper, now)
    return await set_session(room, role, response, repo, settings, datetime.now(timezone.utc))


@router.get("/context", response_model=ReviewerContextResponse)
async def reviewer_context(
    principal: PrincipalDependency, repo: RepositoryDependency, settings: SettingsDependency,
) -> ReviewerContextResponse:
    room = await authenticated_room(principal, repo, datetime.now(timezone.utc))
    return context(room, principal.reviewer_role or "", settings)


@router.post("/reset", response_model=ReviewerContextResponse, dependencies=[Depends(require_trusted_origin)])
async def reviewer_reset(
    payload: ReviewerResetRequest, request: Request, response: Response, principal: PrincipalDependency,
    repo: RepositoryDependency, settings: SettingsDependency, review: ReviewSettingsDependency,
) -> ReviewerContextResponse:
    if not payload.confirm:
        raise AuthError("RESET_CONFIRMATION_REQUIRED", 422)
    now = datetime.now(timezone.utc)
    room = await authenticated_room(principal, repo, now)
    await check_attempt(request, repo, settings, "reviewer-reset", 10, now)
    rooms = ReviewerRepository(repo.database)
    if not await rooms.close_room(room["id"], now):
        raise AuthError("REVIEWER_RESET_CONFLICT", 409)
    # Fail closed if creating a replacement fails. A fresh login (no roomCode) recovers.
    replacement = await rooms.create_room(review.version, settings.session_pepper, now)
    return await set_session(replacement, principal.reviewer_role or "", response, repo, settings, now)
