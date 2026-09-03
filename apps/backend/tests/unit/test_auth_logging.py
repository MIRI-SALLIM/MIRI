import importlib
import logging


def test_deep_invitation_and_query_are_not_logged():
    module = importlib.import_module("auth.logging")
    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d',
                               ("127.0.0.1", "POST", "/api/v1/deep/invitations/INV-private-code/join?secret=value", "1.1", 200), None)
    assert module.OAuthAccessLogFilter().filter(record)
    assert "private-code" not in record.getMessage()
    assert "secret=value" not in record.getMessage()
    assert "/api/v1/deep/invitations/[redacted]/join" in record.getMessage()


def test_oauth_access_log_strips_query_before_formatting_and_keeps_status():
    module = importlib.import_module("auth.logging")
    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d',
                               ("127.0.0.1", "GET", "/api/v1/auth/kakao/callback?code=secret-code&state=secret-state",
                                "1.1", 302), None)
    assert module.OAuthAccessLogFilter().filter(record)
    assert "secret-code" not in record.getMessage()
    assert "secret-state" not in record.getMessage()
    assert "/api/v1/auth/kakao/callback" in record.getMessage()
    assert "302" in record.getMessage()


def test_filter_is_idempotently_installed_and_does_not_modify_light_logs():
    module = importlib.import_module("auth.logging")
    module.install_auth_log_filter()
    module.install_auth_log_filter()
    assert sum(isinstance(f, module.OAuthAccessLogFilter) for f in logging.getLogger("uvicorn.access").filters) == 1
    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d',
                               ("127.0.0.1", "GET", "/api/v1/light/questions?version=light-v1", "1.1", 200), None)
    before = record.getMessage()
    assert module.OAuthAccessLogFilter().filter(record)
    assert record.getMessage() == before
