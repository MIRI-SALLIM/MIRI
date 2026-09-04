import pytest


@pytest.mark.parametrize("failure", [ValueError("private-financial-value"), RuntimeError("private-financial-value")])
def test_unexpected_deep_errors_do_not_escape_into_tracebacks(deep_context, monkeypatch, failure):
    client, repo, _ = deep_context

    async def unavailable(*args, **kwargs):
        raise failure

    monkeypatch.setattr(repo, "get_for_member", unavailable)
    # TestClient re-raises unhandled errors, including errors handled by a generic 500 handler.
    # A safe domain error handler must intercept this before it reaches server traceback logging.
    response = client.get("/api/v1/deep/sessions/test-id/me/input")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DEEP_UNAVAILABLE"
    assert "private-financial-value" not in response.text


def test_domain_error_uses_the_published_error_envelope(deep_context):
    from schemas import ErrorResponse

    client, _, _ = deep_context
    response = client.get("/api/v1/deep/sessions/not-found/me/input")
    assert response.status_code == 404
    ErrorResponse.model_validate(response.json())
