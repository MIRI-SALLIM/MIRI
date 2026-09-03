import hashlib

import pytest

from auth.settings import load_auth_settings


def encoded(password="synthetic-password-a"):
    salt = bytes.fromhex("0102030405060708090a0b0c0d0e0f10")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600000)
    return f"pbkdf2_sha256$600000${salt.hex()}${digest.hex()}"


def reviewer_env():
    return {"DEEP_MODE_ENABLED": "true", "KAKAO_LOGIN_ENABLED": "false", "REVIEWER_LOGIN_ENABLED": "true",
            "PUBLIC_APP_ORIGIN": "http://testserver", "AUTH_SESSION_PEPPER": "p" * 32,
            "REVIEWER_A_PASSWORD_HASH": encoded(), "REVIEWER_B_PASSWORD_HASH": encoded("synthetic-password-b")}


def test_reviewer_only_needs_no_kakao_keys():
    settings = load_auth_settings(reviewer_env())
    assert settings.enabled and settings.reviewer_enabled and not settings.kakao_enabled


@pytest.mark.parametrize("field", ["REVIEWER_A_PASSWORD_HASH", "REVIEWER_B_PASSWORD_HASH", "AUTH_SESSION_PEPPER"])
def test_reviewer_missing_credentials_fail_closed(field):
    env = reviewer_env()
    env.pop(field)
    with pytest.raises(RuntimeError, match=field):
        load_auth_settings(env)


def test_enabled_deep_requires_some_login_provider():
    env = reviewer_env()
    env["REVIEWER_LOGIN_ENABLED"] = "false"
    with pytest.raises(RuntimeError):
        load_auth_settings(env)


def test_password_hashing_verifies_independent_vector_and_rejects_malformed():
    from auth.passwords import hash_password, verify_password

    assert verify_password("synthetic-password-a", encoded())
    assert not verify_password("wrong", encoded())
    assert not verify_password("x", "pbkdf2_sha256$99999999999$00$00")
    assert not verify_password("x", "broken")
    first, second = hash_password("synthetic-password-a"), hash_password("synthetic-password-a")
    assert first != second
    assert "synthetic-password" not in first
    assert verify_password("synthetic-password-a", first)
    with pytest.raises(ValueError):
        hash_password("short")


def test_reviewer_access_log_removes_accidentally_supplied_query_secrets():
    import logging

    from auth.logging import OAuthAccessLogFilter

    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, "%s - %s %s %s %s",
                               ("client", "POST", "/api/v1/auth/reviewer/login?password=private&roomCode=private", "1.1", 422), None)
    OAuthAccessLogFilter().filter(record)
    assert "private" not in record.getMessage()
    assert "/api/v1/auth/reviewer/login" in record.getMessage()
