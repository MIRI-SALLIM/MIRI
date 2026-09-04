import asyncio
import importlib
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlsplit

import pytest

from auth.security import token_digest
from tests.auth_fakes import FakeAuthRepository
from tests.unit.test_kakao_client import settings

NOW = datetime(2026, 9, 3, tzinfo=timezone.utc)


def service():
    repo = FakeAuthRepository()
    kakao = AsyncMock()
    kakao.authorization_url = lambda state: f"https://kauth.kakao.com/oauth/authorize?state={state}"
    kakao.exchange_identity.return_value = "12345"
    auth = importlib.import_module("auth.service").AuthService(repo, kakao, settings())
    return auth, repo, kakao


def state_of(start):
    return parse_qs(urlsplit(start["authorizationUrl"]).query)["state"][0]


def test_login_stores_only_digests_and_same_kakao_id_maps_to_same_internal_user():
    auth, repo, kakao = service()

    async def run():
        user_ids, tokens = [], []
        for _ in range(2):
            start = await auth.begin_login("/deep", NOW)
            state = state_of(start)
            assert len(state) >= 40 and len(start["browserToken"]) >= 40
            assert state != start["browserToken"]
            assert state not in str(repo.challenges) and start["browserToken"] not in str(repo.challenges)
            result = await auth.finish_login("code", state, start["browserToken"], NOW)
            assert set(result) == {"accountToken", "returnTo"}
            assert result["returnTo"] == "/deep"
            token = result["accountToken"]
            assert token not in str(repo.sessions)
            principal = await repo.lookup_session(token_digest(token, settings().session_pepper), NOW)
            user_ids.append(principal.user_id)
            tokens.append(token)
        assert user_ids[0] == user_ids[1] != "12345"
        assert tokens[0] != tokens[1]

    asyncio.run(run())
    assert kakao.exchange_identity.await_count == 2


def test_wrong_browser_cannot_consume_state_and_valid_state_is_one_use():
    auth, repo, kakao = service()

    async def run():
        start = await auth.begin_login("/deep", NOW)
        state = state_of(start)
        with pytest.raises(Exception, match="AUTH_RESTART_REQUIRED"):
            await auth.finish_login("code", state, "other-browser", NOW)
        assert kakao.exchange_identity.await_count == 0
        assert len(repo.challenges) == 1
        await auth.finish_login("code", state, start["browserToken"], NOW)
        with pytest.raises(Exception, match="AUTH_RESTART_REQUIRED"):
            await auth.finish_login("code", state, start["browserToken"], NOW)
        assert kakao.exchange_identity.await_count == 1

    asyncio.run(run())


@pytest.mark.parametrize("problem", ["expired", "missing-state", "missing-browser", "cancelled", "provider-failed"])
def test_invalid_login_or_provider_failure_never_issues_app_session(problem):
    auth, repo, kakao = service()

    async def run():
        start = await auth.begin_login("/deep", NOW)
        state, browser, code, now = state_of(start), start["browserToken"], "code", NOW
        if problem == "expired":
            now += timedelta(minutes=10)
        elif problem == "missing-state":
            state = ""
        elif problem == "missing-browser":
            browser = ""
        elif problem == "cancelled":
            code = ""
        elif problem == "provider-failed":
            error = importlib.import_module("auth.errors").AuthError
            kakao.exchange_identity.side_effect = error("AUTH_PROVIDER_UNAVAILABLE", 503)
        with pytest.raises(Exception, match="AUTH_"):
            await auth.finish_login(code, state, browser, now)
        assert repo.sessions == {}
        assert repo.users == {}

    asyncio.run(run())
