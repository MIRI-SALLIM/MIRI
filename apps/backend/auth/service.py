import secrets
from datetime import datetime

from auth.errors import AuthError
from auth.kakao import KakaoClient
from auth.repository import AuthRepository
from auth.security import token_digest, validate_return_to
from auth.settings import AuthSettings


class AuthService:
    def __init__(self, repo: AuthRepository, kakao: KakaoClient, settings: AuthSettings) -> None:
        self.repo = repo
        self.kakao = kakao
        self.settings = settings

    async def begin_login(self, return_to: str, now: datetime) -> dict[str, str]:
        try:
            validate_return_to(return_to)
        except ValueError:
            raise AuthError("INVALID_RETURN_TO", 400) from None
        state, browser_token = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        await self.repo.create_challenge(
            token_digest(state, self.settings.session_pepper),
            token_digest(browser_token, self.settings.session_pepper), return_to, now,
        )
        return {"authorizationUrl": self.kakao.authorization_url(state), "browserToken": browser_token}

    async def finish_login(
        self, code: str, state: str, browser_token: str, now: datetime,
    ) -> dict[str, str]:
        if not state or not browser_token or len(state) > 128 or len(browser_token) > 128:
            raise AuthError("AUTH_RESTART_REQUIRED")
        challenge = await self.repo.consume_challenge(
            token_digest(state, self.settings.session_pepper),
            token_digest(browser_token, self.settings.session_pepper), now,
        )
        if challenge is None or not code or len(code) > 2048:
            raise AuthError("AUTH_RESTART_REQUIRED")
        kakao_id = await self.kakao.exchange_identity(code)
        principal = await self.repo.upsert_user(kakao_id, now)
        account_token = secrets.token_urlsafe(32)
        await self.repo.issue_session(
            principal.user_id, token_digest(account_token, self.settings.session_pepper), now,
        )
        return {"accountToken": account_token, "returnTo": validate_return_to(challenge["returnTo"])}
