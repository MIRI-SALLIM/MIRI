import asyncio
import importlib
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from auth.settings import load_auth_settings


def settings():
    return load_auth_settings({
        "DEEP_MODE_ENABLED": "true", "ENVIRONMENT": "test", "PUBLIC_APP_ORIGIN": "http://testserver",
        "KAKAO_REST_API_KEY": "test-key", "KAKAO_CLIENT_SECRET": "test-secret", "AUTH_SESSION_PEPPER": "x" * 32,
    })


def exchange(handler):
    kakao_client = importlib.import_module("auth.kakao").KakaoClient

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await kakao_client(http, settings()).exchange_identity("test-code")

    return asyncio.run(run())


def test_kakao_identity_uses_server_exchange_and_returns_only_id():
    seen = []

    def handler(request):
        seen.append(request)
        assert request.extensions["timeout"]["read"] == 5.0
        if request.url.path == "/oauth/token":
            assert request.method == "POST"
            assert parse_qs(request.content.decode()) == {
                "client_secret": ["test-secret"], "client_id": ["test-key"], "code": ["test-code"],
                "grant_type": ["authorization_code"],
                "redirect_uri": ["http://testserver/api/v1/auth/kakao/callback"],
            }
            return httpx.Response(200, json={"access_token": "provider-token", "refresh_token": "discard-me"})
        assert request.url.host == "kapi.kakao.com"
        assert request.url.path == "/v2/user/me"
        assert request.headers["authorization"] == "Bearer provider-token"
        return httpx.Response(200, json={"id": 12345, "profile": {"unused": "discard-me"}})

    assert exchange(handler) == "12345"
    assert len(seen) == 2


def test_authorization_url_has_exact_callback_and_state_without_extra_scopes():
    kakao_client = importlib.import_module("auth.kakao").KakaoClient
    url = urlsplit(kakao_client(None, settings()).authorization_url("state-test"))
    assert (url.scheme, url.netloc, url.path) == ("https", "kauth.kakao.com", "/oauth/authorize")
    assert parse_qs(url.query) == {"response_type": ["code"], "client_id": ["test-key"],
                                 "redirect_uri": [settings().callback_uri], "state": ["state-test"]}


@pytest.mark.parametrize("identity", [None, "12345", True, False, 0, -123, 12.3, {}, []])
def test_invalid_provider_identity_never_logs_in(identity):
    def handler(request):
        if request.url.path == "/oauth/token":
            return httpx.Response(200, json={"access_token": "provider-token"})
        return httpx.Response(200, json={"id": identity})

    with pytest.raises(Exception, match="AUTH_RESTART_REQUIRED"):
        exchange(handler)


@pytest.mark.parametrize("failure,expected", [
    ("timeout", "AUTH_PROVIDER_UNAVAILABLE"), ("500", "AUTH_PROVIDER_UNAVAILABLE"),
    ("400", "AUTH_RESTART_REQUIRED"), ("bad-json", "AUTH_RESTART_REQUIRED"),
    ("missing-token", "AUTH_RESTART_REQUIRED"), ("profile-failure", "AUTH_PROVIDER_UNAVAILABLE"),
])
def test_provider_failures_are_safe_and_authorization_code_is_not_retried(failure, expected):
    seen = []

    def handler(request):
        seen.append(request)
        if failure == "timeout":
            raise httpx.ReadTimeout("test-secret test-code", request=request)
        if failure == "bad-json":
            return httpx.Response(200, text="test-secret test-code")
        if failure == "missing-token":
            return httpx.Response(200, json={"access_token": ""})
        if failure == "profile-failure" and request.url.path == "/oauth/token":
            return httpx.Response(200, json={"access_token": "provider-token"})
        return httpx.Response(400 if failure == "400" else 500, text="test-secret test-code")

    with pytest.raises(Exception, match=expected) as caught:
        exchange(handler)
    assert "test-secret" not in str(caught.value)
    assert "test-code" not in str(caught.value)
    assert len(seen) == (2 if failure == "profile-failure" else 1)
