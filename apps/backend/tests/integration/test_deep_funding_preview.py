import pytest
from fastapi.testclient import TestClient

from tests.unit.test_deep_funding import funding_input

URL = "/api/v1/deep/funding/preview"
ORIGIN = {"Origin": "http://testserver"}


def test_private_funding_preview_returns_typed_math_without_reading_or_saving_sessions(deep_context):
    from deep.funding_models import FundingPreviewResponse

    client, _, db = deep_context
    response = client.post(URL, json=funding_input(), headers=ORIGIN)
    assert response.status_code == 200
    report = FundingPreviewResponse.model_validate(response.json())
    assert report.audience == "private_input_preview"
    assert report.timeline[0].fundingGapWon == 10_000_000
    assert not db["deep_sessions"].documents
    assert not db["deep_reports"].documents


def test_preview_requires_login(deep_context):
    from auth.dependencies import require_account
    from main import app

    client, _, _ = deep_context
    del app.dependency_overrides[require_account]
    response = client.post(URL, json=funding_input(), headers=ORIGIN)
    assert response.status_code == 401


def test_preview_rejects_untrusted_origin(deep_context):
    client, _, _ = deep_context
    response = client.post(URL, json=funding_input(), headers={"Origin": "https://attacker.invalid"})
    assert response.status_code == 403


def test_preview_respects_deep_feature_switch(monkeypatch):
    from main import app

    monkeypatch.setenv("DEEP_MODE_ENABLED", "false")
    with TestClient(app) as client:
        assert client.post(URL, json=funding_input(), headers=ORIGIN).status_code == 404


def test_preview_invalid_reference_has_safe_error_body(deep_context):
    client, _, _ = deep_context
    payload = funding_input()
    payload["settlements"][0]["parts"][0]["sourceId"] = "private-asset-id-do-not-echo"
    response = client.post(URL, json=payload, headers=ORIGIN)
    assert response.status_code == 422
    assert "private-asset-id-do-not-echo" not in response.text
    assert "100000000" not in response.text
    assert "error" in response.json()


@pytest.mark.parametrize("location", ["root", "source", "amount"])
def test_preview_validation_does_not_echo_arbitrary_json_keys(deep_context, location):
    client, _, _ = deep_context
    payload = funding_input()
    target = payload if location == "root" else payload["sources"][0]
    if location == "amount":
        target = target["grossAmount"]
    target["private-asset-123456789"] = "private-value-987654321"
    response = client.post(URL, json=payload, headers=ORIGIN)
    assert response.status_code == 422
    assert "private-asset-123456789" not in response.text
    assert "private-value-987654321" not in response.text
    assert "100000000" not in response.text


def test_preview_cannot_request_someone_elses_stored_data(deep_context):
    client, _, _ = deep_context
    payload = funding_input()
    payload["sessionId"] = "another-couple"
    assert client.post(URL, json=payload, headers=ORIGIN).status_code == 422


def test_preview_enforces_rate_limit(deep_context, monkeypatch):
    client, repo, _ = deep_context

    async def denied(*args, **kwargs):
        return False

    monkeypatch.setattr(repo, "allow_attempt", denied)
    response = client.post(URL, json=funding_input(), headers=ORIGIN)
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"
