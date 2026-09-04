import asyncio
import os
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.security import APIKeyCookie
from pymongo.errors import PyMongoError

from auth.errors import AuthError
from auth.kakao import KakaoClient
from auth.models import Principal
from auth.repository import AuthRepository
from auth.security import token_digest
from auth.service import AuthService
from auth.settings import AuthSettings, load_auth_settings

ACCOUNT_COOKIE = "mrs_account"
BROWSER_COOKIE = "mrs_oauth_browser"
account_cookie = APIKeyCookie(name=ACCOUNT_COOKIE, scheme_name="accountAuth", auto_error=False)


def get_enabled_settings() -> AuthSettings:
    try:
        settings = load_auth_settings(os.environ)
    except RuntimeError:
        raise AuthError("AUTH_UNAVAILABLE", 503) from None
    if not settings.enabled:
        raise HTTPException(status_code=404, detail="사용할 수 없는 기능입니다.")
    return settings


SettingsDependency = Annotated[AuthSettings, Depends(get_enabled_settings)]


async def get_auth_repository(request: Request, settings: SettingsDependency) -> AuthRepository:
    # Local import keeps the existing app/database lifecycle as the only connection owner.
    from main import get_database

    try:
        database = await get_database()
        if database is None:
            raise AuthError("AUTH_UNAVAILABLE", 503)
        loop = asyncio.get_running_loop()
        cached = getattr(request.app.state, "auth_repository", None)
        if cached is not None and cached[0] == database and cached[1] is loop:
            repo: AuthRepository = cached[2]
            return repo
        repo = AuthRepository(database)
        await repo.ensure_indexes()
        request.app.state.auth_repository = (database, loop, repo)
        return repo
    except PyMongoError:
        raise AuthError("AUTH_UNAVAILABLE", 503) from None


RepositoryDependency = Annotated[AuthRepository, Depends(get_auth_repository)]


async def get_auth_service(repo: RepositoryDependency, settings: SettingsDependency) -> AsyncIterator[AuthService]:
    if not settings.kakao_enabled:
        raise HTTPException(status_code=404, detail="사용할 수 없는 기능입니다.")
    async with httpx.AsyncClient(follow_redirects=False) as http:
        yield AuthService(repo, KakaoClient(http, settings), settings)


def require_account_token(
    settings: SettingsDependency, token: Annotated[str | None, Depends(account_cookie)],
) -> str:
    if not token or len(token) > 128:
        raise AuthError("AUTH_REQUIRED")
    return token


TokenDependency = Annotated[str, Depends(require_account_token)]


async def require_account(
    token: TokenDependency, repo: RepositoryDependency, settings: SettingsDependency,
) -> Principal:
    try:
        principal = await repo.lookup_session(token_digest(token, settings.session_pepper), datetime.now(timezone.utc))
    except PyMongoError:
        raise AuthError("AUTH_UNAVAILABLE", 503) from None
    if principal is None:
        raise AuthError("AUTH_REQUIRED")
    if principal.provider == "reviewer":
        from auth.reviewer_settings import load_reviewer_settings

        if not settings.reviewer_enabled:
            raise AuthError("AUTH_REQUIRED")
        if principal.reviewer_version != load_reviewer_settings(os.environ).version:
            raise AuthError("AUTH_REQUIRED")
    return principal


def require_trusted_origin(request: Request, settings: SettingsDependency) -> None:
    if request.headers.get("origin") != settings.public_app_origin:
        raise AuthError("UNTRUSTED_ORIGIN", 403)
