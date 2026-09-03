import importlib
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient
from pymongo.errors import ConnectionFailure

from auth.kakao import KakaoClient
from auth.service import AuthService
from auth.settings import load_auth_settings
from main import app
from tests.auth_fakes import FakeAuthRepository


@pytest.fixture
def auth_context(monkeypatch):
    env = {"DEEP_MODE_ENABLED": "true", "ENVIRONMENT": "test", "PUBLIC_APP_ORIGIN": "http://testserver",
           "KAKAO_REST_API_KEY": "test-key", "KAKAO_CLIENT_SECRET": "test-secret", "AUTH_SESSION_PEPPER": "p" * 32}
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    deps = importlib.import_module("auth.dependencies")
    repo = FakeAuthRepository()

    def handler(request):
        if request.url.path == "/oauth/token":
            return httpx.Response(200, json={"access_token": "provider-token"})
        return httpx.Response(200, json={"id": 12345})

    async def override_service():
        settings = load_auth_settings(env)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            yield AuthService(repo, KakaoClient(http, settings), settings)

    app.dependency_overrides[deps.get_auth_repository] = lambda: repo
    app.dependency_overrides[deps.get_auth_service] = override_service
    with TestClient(app, follow_redirects=False) as client:
        yield client, repo


def start_login(client, return_to="/deep"):
    response = client.get("/api/v1/auth/kakao/start", params={"returnTo": return_to})
    assert response.status_code == 302
    state = parse_qs(urlsplit(response.headers["location"]).query)["state"][0]
    return state, response


def login(client):
    state, _ = start_login(client)
    response = client.get("/api/v1/auth/kakao/callback", params={"code": "test-code", "state": state})
    assert response.status_code == 302
    return response


def test_light_cookie_cannot_authenticate_account_before_database_lookup(auth_context):
    client, _ = auth_context
    deps = importlib.import_module("auth.dependencies")

    def unexpected_database():
        raise AssertionError("Unauthenticated request must not access MongoDB")

    app.dependency_overrides[deps.get_auth_repository] = unexpected_database
    response = client.get("/api/v1/auth/me", headers={"Cookie": "mrs_participant=light-token"})
    assert response.status_code == 401


def test_login_cookie_options_private_response_and_logout_preserve_light_cookie(auth_context):
    client, repo = auth_context
    client.cookies.set("mrs_participant", "light-token")
    response = login(client)
    assert response.headers["location"] == "/deep"
    cookie_headers = response.headers.get_list("set-cookie")
    account_cookie = next(value for value in cookie_headers if value.startswith("mrs_account="))
    assert "HttpOnly" in account_cookie and "Max-Age=604800" in account_cookie
    assert "SameSite=lax" in account_cookie and "Path=/" in account_cookie and "Domain=" not in account_cookie
    assert client.cookies.get("mrs_oauth_browser") is None
    assert client.cookies.get("mrs_participant") == "light-token"
    assert "no-store" in response.headers["cache-control"]
    assert "no-referrer" == response.headers["referrer-policy"]
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 200
    assert set(response.json()) == {"userId"}
    assert response.json()["userId"] != "12345"
    assert "provider-token" not in str(repo.sessions)
    logout = client.post("/api/v1/auth/logout", headers={"Origin": "http://testserver"})
    assert logout.status_code == 204
    assert repo.sessions == {}
    assert client.cookies.get("mrs_participant") == "light-token"
    assert client.get("/api/v1/auth/me").status_code == 401


def test_callback_reuse_and_cancel_never_create_another_session(auth_context):
    client, repo = auth_context
    state, _ = start_login(client)
    browser = client.cookies.get("mrs_oauth_browser")
    response = client.get("/api/v1/auth/kakao/callback", params={"state": state, "error": "access_denied"})
    assert response.status_code == 401
    assert repo.sessions == {}
    assert client.cookies.get("mrs_oauth_browser") is None
    response = client.get("/api/v1/auth/kakao/callback", params={"state": state, "code": "test-code"},
                          headers={"Cookie": f"mrs_oauth_browser={browser}"})
    assert response.status_code == 401
    login(client)
    assert len(repo.sessions) == 1


def test_callback_wrong_browser_then_success_then_replay(auth_context):
    client, repo = auth_context
    state, _ = start_login(client)
    browser = client.cookies.get("mrs_oauth_browser")
    path = "/api/v1/auth/kakao/callback"
    params = {"code": "test-code", "state": state}
    assert client.get(path, params=params, headers={"Cookie": "mrs_oauth_browser=other-browser"}).status_code == 401
    assert repo.sessions == {}
    headers = {"Cookie": f"mrs_oauth_browser={browser}"}
    assert client.get(path, params=params, headers=headers).status_code == 302
    assert client.get(path, params=params, headers=headers).status_code == 401
    assert len(repo.sessions) == 1


def test_callback_rate_limit_and_failure_do_not_echo_query_values(auth_context):
    client, repo = auth_context
    params = {"code": "private-code", "state": "private-state", "error": "private-provider-error"}
    for _ in range(40):
        response = client.get("/api/v1/auth/kakao/callback", params=params)
        assert response.status_code == 401
        assert "private-" not in response.text
    assert client.get("/api/v1/auth/kakao/callback", params=params).status_code == 429
    assert repo.sessions == {}


@pytest.mark.parametrize("origin", [None, "null", "https://evil.test", "http://testserver.evil", "http://testserver/"])
def test_logout_requires_exact_trusted_origin(auth_context, origin):
    client, repo = auth_context
    login(client)
    headers = {"Origin": origin} if origin else {}
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 403
    assert len(repo.sessions) == 1


def test_external_return_to_is_rejected_without_creating_challenge(auth_context):
    client, repo = auth_context
    response = client.get("/api/v1/auth/kakao/start", params={"returnTo": "//evil.test"})
    assert response.status_code == 400
    assert repo.challenges == {}


def test_expired_session_is_rejected_without_waiting_for_mongo_ttl(auth_context):
    client, repo = auth_context
    login(client)
    next(iter(repo.sessions.values()))["expiresAt"] = datetime(2020, 1, 1, tzinfo=timezone.utc)
    assert client.get("/api/v1/auth/me").status_code == 401


def test_start_rate_limit_does_not_trust_arbitrary_forwarded_ip(auth_context):
    client, repo = auth_context
    for i in range(20):
        assert client.get("/api/v1/auth/kakao/start", headers={"X-Forwarded-For": f"10.0.0.{i}"}).status_code == 302
    assert client.get("/api/v1/auth/kakao/start").status_code == 429
    assert len(repo.challenges) == 20
    assert all(key[0] != "testclient" for key in repo.attempts)


def test_auth_store_failure_is_503_and_never_falls_back_to_memory(auth_context, monkeypatch):
    client, _ = auth_context
    import main
    deps = importlib.import_module("auth.dependencies")
    app.dependency_overrides.pop(deps.get_auth_repository)

    async def failed_database():
        raise ConnectionFailure("secret-connection-string")

    monkeypatch.setattr(main, "get_database", failed_database)
    response = client.get("/api/v1/auth/me", headers={"Cookie": "mrs_account=opaque-token"})
    assert response.status_code == 503
    assert "secret-connection-string" not in response.text


def test_disabled_auth_routes_are_404_and_light_still_works(monkeypatch):
    monkeypatch.setenv("DEEP_MODE_ENABLED", "false")
    with TestClient(app) as client:
        assert client.get("/api/v1/auth/me").status_code == 404
        assert client.get("/api/v1/auth/kakao/start").status_code == 404
        assert client.get("/api/v1/light/questions").status_code == 200


def test_openapi_account_cookie_does_not_replace_light_security(auth_context):
    client, _ = auth_context
    schema = client.get("/openapi.json").json()
    assert schema["paths"]["/api/v1/auth/me"]["get"]["security"] == [{"accountAuth": []}]
    assert schema["components"]["securitySchemes"]["accountAuth"]["name"] == "mrs_account"
    assert schema["components"]["securitySchemes"]["cookieAuth"]["name"] == "mrs_participant"
