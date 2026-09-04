import importlib

import pytest


def test_token_digest_matches_sha256_hmac_vector():
    security = importlib.import_module("auth.security")
    assert security.token_digest("what do ya want for nothing?", "Jefe") == (
        "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
    )
    assert security.token_digest("same-token", "a" * 32) != security.token_digest("same-token", "b" * 32)


@pytest.mark.parametrize("path", [
    "//evil.test", "https://evil.test", "/\\evil", "/deep\r\nX: y",
    " /deep", "/deep/%2f%2fevil", "/deep/../admin", "/deep/./x", "/other", "/deep#evil",
    "/deep?returnTo=//evil", "/deep#", "/deep?", "/deep/\x7f",
])
def test_return_to_rejects_external_or_ambiguous_paths(path):
    security = importlib.import_module("auth.security")
    with pytest.raises(ValueError, match="INVALID_RETURN_TO"):
        security.validate_return_to(path)


@pytest.mark.parametrize("path", ["/", "/deep", "/deep/invite/INV-ABCDEFGH"])
def test_return_to_accepts_internal_deep_paths(path):
    security = importlib.import_module("auth.security")
    assert security.validate_return_to(path) == path


def test_disabled_auth_needs_no_secrets():
    settings = importlib.import_module("auth.settings").load_auth_settings({"ENVIRONMENT": "production"})
    assert not settings.enabled


@pytest.mark.parametrize("key,value", [
    ("KAKAO_REST_API_KEY", ""), ("KAKAO_CLIENT_SECRET", ""), ("AUTH_SESSION_PEPPER", "short"),
    ("PUBLIC_APP_ORIGIN", "http://example.com"), ("PUBLIC_APP_ORIGIN", "https://example.com/path"),
    ("PUBLIC_APP_ORIGIN", "https://user:password@example.com"),
])
def test_enabled_production_auth_rejects_unsafe_settings_without_echoing_secrets(key, value):
    load_settings = importlib.import_module("auth.settings").load_auth_settings
    env = {"ENVIRONMENT": "production", "DEEP_MODE_ENABLED": "true",
           "PUBLIC_APP_ORIGIN": "https://example.com", "KAKAO_REST_API_KEY": "secret-test-key",
           "KAKAO_CLIENT_SECRET": "secret-test-secret", "AUTH_SESSION_PEPPER": "p" * 32}
    env[key] = value
    with pytest.raises(RuntimeError) as caught:
        load_settings(env)
    assert key in str(caught.value)
    assert "secret-test" not in str(caught.value)


def test_valid_settings_use_fixed_callback_origin_and_production_cookie_security():
    load_settings = importlib.import_module("auth.settings").load_auth_settings
    env = {"ENVIRONMENT": "production", "DEEP_MODE_ENABLED": "true",
           "PUBLIC_APP_ORIGIN": "https://example.com", "KAKAO_REST_API_KEY": "test-key",
           "KAKAO_CLIENT_SECRET": "test-secret", "AUTH_SESSION_PEPPER": "p" * 32}
    settings = load_settings(env)
    assert settings.callback_uri == "https://example.com/api/v1/auth/kakao/callback"
    assert settings.secure_cookie
    assert "test-secret" not in repr(settings)


@pytest.mark.parametrize("origin", ["http://example.com", "https://example.com?", "https://example.com#"])
def test_prod_alias_has_same_https_and_exact_origin_rules(origin):
    load_settings = importlib.import_module("auth.settings").load_auth_settings
    with pytest.raises(RuntimeError, match="PUBLIC_APP_ORIGIN"):
        load_settings({"ENVIRONMENT": "prod", "DEEP_MODE_ENABLED": "true", "PUBLIC_APP_ORIGIN": origin,
                       "KAKAO_REST_API_KEY": "test-key", "KAKAO_CLIENT_SECRET": "test-secret",
                       "AUTH_SESSION_PEPPER": "p" * 32})
