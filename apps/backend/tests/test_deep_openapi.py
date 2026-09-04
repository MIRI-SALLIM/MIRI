from main import app


def test_every_deep_operation_requires_real_account_and_obeys_feature_flag(deep_context, monkeypatch):
    import re

    from auth.dependencies import require_account
    from deep.dependencies import get_deep_service

    client, _, _ = deep_context
    app.dependency_overrides.pop(require_account)

    def forbidden_repository():
        raise AssertionError("Unauthenticated request reached Deep storage")

    app.dependency_overrides[get_deep_service] = forbidden_repository
    for enabled, expected in (("true", 401), ("false", 404)):
        monkeypatch.setenv("DEEP_MODE_ENABLED", enabled)
        for path, methods in app.openapi()["paths"].items():
            if not path.startswith("/api/v1/deep/") and path != "/api/v1/auth/account":
                continue
            url = re.sub(r"\{[^}]+\}", "example", path)
            for method in methods:
                if method not in {"get", "post", "patch", "delete"}:
                    continue
                response = client.request(method, url, json={}, headers={
                    "Origin": "http://testserver", "Idempotency-Key": "test-id", "X-Test-User": "user-a",
                })
                assert response.status_code == expected, (method, path, response.text)


def test_frontend_examples_match_strict_request_and_response_models():
    import json
    from pathlib import Path

    from deep import schemas
    from schemas import ErrorResponse

    examples = json.loads((Path(__file__).parent / "fixtures" / "deep_contract_examples.json").read_text(encoding="utf-8"))
    mappings = {
        "createRequest": schemas.CreateDeepSessionRequest, "session": schemas.DeepSessionResponse,
        "saveRequest": schemas.SaveDeepInputRequest, "ownInput": schemas.OwnDeepInputResponse,
        "planUpdateRequest": schemas.UpdateSharedPlanRequest, "plan": schemas.SharedPlanResponse,
        "planConfirmRequest": schemas.ConfirmSharedPlanRequest, "submitRequest": schemas.SubmitDeepInputRequest,
        "waiting": schemas.WaitingDeepResult, "ready": schemas.ReadyDeepResult, "financeOptOut": schemas.ReadyDeepResult,
        "agreementCreateRequest": schemas.AgreementRequest, "agreement": schemas.AgreementResponse,
        "agreementConfirmRequest": schemas.VersionRequest, "agreementEditRequest": schemas.EditAgreementRequest,
        "roundRequest": schemas.RoundRequest, "roundState": schemas.RoundStateResponse, "roundResponse": schemas.RoundResponse,
        "withdrawRequest": schemas.CreateDeepSessionRequest, "closed": schemas.ClosedDeepResponse, "revisionConflict": ErrorResponse,
    }
    assert set(mappings) == set(examples) - {"note"}
    for name, model in mappings.items():
        model.model_validate(examples[name])
    assert set(examples["waiting"]) == {"status", "partnerCompleted"}
    assert "contextNotes" not in json.dumps(examples["ready"])
    for block in ("cashflow", "housing", "goal"):
        assert examples["financeOptOut"]["report"][block]["data"] is None


def test_deep_and_light_security_remain_distinct():
    schema = app.openapi()
    schemes = schema["components"]["securitySchemes"]
    assert schemes["cookieAuth"]["name"] == "mrs_participant"
    assert schemes["accountAuth"]["name"] == "mrs_account"
    for path, methods in schema["paths"].items():
        if path.startswith("/api/v1/deep/") or path == "/api/v1/auth/account":
            for method, operation in methods.items():
                if method in {"get", "post", "patch", "delete"}:
                    assert operation["security"] == [{"accountAuth": []}], (path, method)
    result = schema["paths"]["/api/v1/deep/sessions/{session_id}/result"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert result["discriminator"]["propertyName"] == "status"
    assert set(result["discriminator"]["mapping"]) == {"waiting", "ready"}


def test_legacy_create_rejects_deep_in_generated_contract():
    assert app.openapi()["components"]["schemas"]["CreateSessionRequest"]["properties"]["mode"]["const"] == "light"


def test_v3_examples_match_models_and_are_submittable():
    import json
    from pathlib import Path

    from deep.v3_models import AgreementRequestV3, SaveInputV3, SubmitV3, UpdatePlanV3
    from deep.validation import validate_submission

    examples = json.loads((Path(__file__).parent / "fixtures/deep_v3_contract_examples.json").read_text(encoding="utf-8"))
    for key, model in {"saveRequest": SaveInputV3, "planUpdateRequest": UpdatePlanV3,
                       "submitRequest": SubmitV3, "agreementCreateRequest": AgreementRequestV3}.items():
        model.model_validate(examples[key])
    assert validate_submission(SaveInputV3.model_validate(examples["saveRequest"]).input) == []


def test_v3_result_discriminator_and_required_input_version():
    schema = app.openapi()
    result = schema["paths"]["/api/v1/deep/v3/sessions/{session_id}/result"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert set(result["discriminator"]["mapping"]) == {"waiting", "ready"}
    input_ref = schema["components"]["schemas"]["SaveInputV3"]["properties"]["input"]["$ref"].split("/")[-1]
    assert "inputVersion" in schema["components"]["schemas"][input_ref]["required"]
