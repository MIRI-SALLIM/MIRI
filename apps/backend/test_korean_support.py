import io
import json
import sys
from pathlib import Path
from typing import Any, cast

from fastapi.testclient import TestClient

if sys.platform == "win32" and isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(encoding="utf-8")

from main import app
from schemas import LightComparisonResultData, ResultReadyResponse
from services.calculator import calculate_mutual_hit_count, classify_type
from services.validator import validate_input

client = TestClient(app)

def test_health():
    """서버 상태 및 DB 연결 응답(한국어 메시지 포함) 검증"""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "database" in data
    assert "message" in data
    assert "미리살림" in data["message"] or "데이터베이스" in data["message"]
    print("✅ [테스트 1] /health 엔드포인트 및 한국어 응답 정상")

def test_light_questions():
    """라이트 진단 제품 스펙 5개 문항, 각 4개 선택지 대표값 및 한국어 데이터 검증"""
    # 1. 기본값("light-v1")으로 호출
    res = client.get("/api/v1/light/questions")
    assert res.status_code == 200
    data = res.json()
    assert data["version"] == "light-v1"
    assert data["title"] == "미리살림 라이트 진단 질문 세트"
    questions = cast(list[dict[str, Any]], data["questions"])
    assert len(questions) == 5

    # 5대 필수 문항 ID 확인
    expected_ids = ["monthly_income", "saving_ratio", "spending_style", "debt_load", "shared_expense"]
    actual_ids = [q["id"] for q in questions]
    assert actual_ids == expected_ids

    # 각 질문별 선택지 4개 검증
    for q in questions:
        options = cast(list[dict[str, Any]], q.get("options", []))
        assert len(options) == 4, f"{q['id']}의 옵션 개수는 4개여야 합니다."
        for opt in options:
            assert "label" in opt
            assert "value" in opt
            assert "rep" in opt

    # 404 공통 에러 봉투 검증
    err_res = client.get("/api/v1/light/questions?version=wrong-v")
    assert err_res.status_code == 404
    err_data = err_res.json()
    assert "error" in err_data
    assert err_data["error"]["code"] == "QUESTION_SET_NOT_FOUND"
    assert "찾을 수 없습니다" in err_data["error"]["message"]

    print("✅ [테스트 2] /api/v1/light/questions 5개 문항(각 4개 옵션) 및 공통 에러 봉투 정상")

def test_deep_questions():
    """딥 진단 8개 가치관 문항(5대 영역) 및 공통 에러 봉투 검증"""
    res = client.get("/api/v1/deep/questions")
    assert res.status_code == 200
    data = res.json()
    assert data["version"] == "deep-v1"
    questions = cast(list[dict[str, Any]], data["questions"])
    assert len(questions) == 8

    # 5대 핵심 가치관 영역(저축, 소비, 투자, 부채, 공동관리) 확인
    categories = {q["category"] for q in questions}
    assert {"저축", "소비", "투자", "부채", "공동관리"}.issubset(categories)

    # 404 에러 검증
    err_res = client.get("/api/v1/deep/questions?version=invalid")
    assert err_res.status_code == 404
    assert err_res.json()["error"]["code"] == "QUESTION_SET_NOT_FOUND"
    print("✅ [테스트 3] /api/v1/deep/questions 8개 가치관 문항 정상")

def test_config_endpoint():
    """설정 데이터(/api/v1/config) 조회 및 캐싱 검증"""
    for config_type in ["parameters", "coefficients", "ranges", "benchmarks", "light_questions", "light_types"]:
        res = client.get(f"/api/v1/config/{config_type}")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert isinstance(data["data"], dict)
        assert len(data["data"]) > 0

    # 잘못된 타입 400 에러 검증
    err_res = client.get("/api/v1/config/invalid_type")
    assert err_res.status_code == 400
    assert err_res.json()["error"]["code"] == "INVALID_CONFIG_TYPE"
    print("✅ [테스트 4] /api/v1/config 설정 데이터 조회 및 캐싱 정상")

def test_calculate_light_endpoint():
    """라이트 진단 연산 API - 선택지 인덱스/코드값 호환 및 4대 성향 분류 검증"""
    # 1. 5문항 선택지 코드값 기반 요청 검증
    req_payload_codes = {
        "incomeA": 250.0,
        "incomeB": 250.0,
        "surplusA": 85.0,
        "surplusB": 40.0,
        "timeAxisAnswers": ["saver_moderate"],
        "mgmtAxisAnswers": ["joint_allowance"]
    }
    res1 = client.post("/api/v1/calculate/light", json=req_payload_codes)
    assert res1.status_code == 200
    data1 = res1.json()["result"]
    assert data1["surplus"]["rawSurplus"] in (181.2, 181.3)
    assert data1["surplus"]["formattedSurplus"] == "약 180만원대"
    assert data1["typeClassification"]["typeCode"] == "saver_joint"
    assert data1["typeClassification"]["typeName"] == "함께 모으는 든든한 동반자형"

    # 2. 2차원/숫자 mgmtAxisAnswers 요청 검증
    req_payload_2d = {
        "incomeA": 250.0,
        "incomeB": 250.0,
        "surplusA": 85.0,
        "surplusB": 40.0,
        "timeAxisAnswers": [4, 4],
        "mgmtAxisAnswers": [[2, 1]]
    }
    res2 = client.post("/api/v1/calculate/light", json=req_payload_2d)
    assert res2.status_code == 200
    data2 = res2.json()["result"]
    assert data2["typeClassification"]["typeCode"] == "saver_separate"
    assert data2["typeClassification"]["typeName"] == "각자 꼼꼼 미래설계형"

    # 3. spender_joint & spender_separate 직접 분류 검증
    res3 = classify_type(["spender_strong"], ["joint_full"], cutoff=3.0)
    assert res3["typeCode"] == "spender_joint"
    assert res3["typeName"] == "함께 즐기는 욜로동반형"

    res4 = classify_type(["spender_moderate"], ["separate_full"], cutoff=3.0)
    assert res4["typeCode"] == "spender_separate"
    assert res4["typeName"] == "각자 즐기는 독립형"

    print("✅ [테스트 5] /api/v1/calculate/light 선택지 코드/숫자/배열 호환 및 4대 성향 분류 정상")

def test_validator_endpoint_and_rules():
    """입력 데이터 유효성 검증(V-01 ~ V-05) 전체 규칙 검증"""
    payload = {
        "monthlyNetIncome": 50.0,
        "totalExpense": 100.0,
        "debtTotal": 4000.0,
        "variableExpenses": 0.0,
        "savings": 0.0
    }
    res = client.post("/api/v1/validate/input", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    warning_ids = [w["id"] for w in data["warnings"]]
    assert "V-01" in warning_ids
    assert "V-02" in warning_ids
    assert "V-03" in warning_ids
    assert "V-04" in warning_ids

    # V-05 단독 검증
    mock_params = {
        "inputValidation": {
            "rules": [
                {"id": "V-05", "field": "savings", "condition": "= 0 이고 income > 400", "level": "confirm", "message": "고소득 저축 0원 확인"}
            ]
        }
    }
    v5_warnings = validate_input({"monthlyNetIncome": 500, "savings": 0}, mock_params)
    assert any(w["id"] == "V-05" for w in v5_warnings)

    print("✅ [테스트 6] /api/v1/validate/input 및 V-01~V-05 유효성 검증 정상")

def test_gate1_session_and_result_contract():
    """F2 계약: 세션 생성, 초대 미리보기(최소 정보), 가변 입력(배열), 세션 상태, 양측 비교 결과 DTO 및 쿠키 검증"""
    # 1. 세션 생성 (201 Created, Idempotency-Key 헤더, 쿠키 발급 확인)
    headers = {"Idempotency-Key": "test-uuid-1234"}
    create_res = client.post("/api/v1/sessions", json={"nickname": "예랑이", "mode": "light"}, headers=headers)
    assert create_res.status_code == 201
    sess_data = create_res.json()
    assert sess_data["id"].startswith("sess_")
    assert sess_data["myRole"] == "creator"
    assert "mrs_participant" in create_res.cookies

    # 2. 초대 미리보기 조회 (최소 정보: mode, duration, expiresAt만 노출)
    inv_code = sess_data["invitationCode"]
    inv_res = client.get(f"/api/v1/invitations/{inv_code}")
    assert inv_res.status_code == 200
    inv_data = inv_res.json()
    assert set(inv_data.keys()) == {"mode", "duration", "expiresAt"}
    assert inv_data["mode"] == "light"
    assert inv_data["duration"] == "3분"
    assert "expiresAt" in inv_data

    # 유효하지 않거나 만료된 코드에 대해 중립적인 404 에러 반환 검증
    bad_inv_res = client.get("/api/v1/invitations/INVALID_CODE")
    assert bad_inv_res.status_code == 404
    assert bad_inv_res.json()["error"]["code"] == "INVITATION_NOT_FOUND"

    expired_inv_res = client.get("/api/v1/invitations/EXPIRED")
    assert expired_inv_res.status_code == 404
    assert expired_inv_res.json()["error"]["code"] == "INVITATION_NOT_FOUND"

    # 3. 초대 참여 (쿠키 발급)
    join_res = client.post(f"/api/v1/invitations/{inv_code}/join", json={"nickname": "예신이"}, headers=headers)
    assert join_res.status_code == 200
    assert join_res.json()["myRole"] == "invitee"
    assert "mrs_participant" in join_res.cookies

    # 4. 가변 질문 입력 저장 (배열 구조: 0|1|2|3|null)
    input_payload = {
        "answers": [0, 1, None, 3],
        "guesses": [1, 1, 2, None]
    }
    save_res = client.patch(f"/api/v1/sessions/{sess_data['id']}/me/input", json=input_payload, headers=headers)
    assert save_res.status_code == 200
    save_data = save_res.json()
    assert save_data["answers"] == [0, 1, None, 3]
    assert save_data["guesses"] == [1, 1, 2, None]

    # 5. 잘못된 답변 값(범위 밖 4 등) 전송 시 422 검증
    bad_input_payload = {
        "answers": [4, 1, 0]  # 4는 0|1|2|3 범위를 벗어남
    }
    bad_res = client.patch(f"/api/v1/sessions/{sess_data['id']}/me/input", json=bad_input_payload)
    assert bad_res.status_code == 422
    assert bad_res.json()["error"]["code"] == "VALIDATION_ERROR"

    # 6. 세션 상태 조회 (최종 정리된 필드: meCompleted, partnerJoined, partnerCompleted, partnerNudgedAt, expiresAt)
    status_res = client.get(f"/api/v1/sessions/{sess_data['id']}/status")
    assert status_res.status_code == 200
    status_data = status_res.json()
    expected_status_keys = {"meCompleted", "partnerJoined", "partnerCompleted", "partnerNudgedAt", "expiresAt"}
    assert set(status_data.keys()) == expected_status_keys
    assert status_data["meCompleted"] is True
    assert status_data["partnerCompleted"] is False

    # 7. 최종 제출
    submit_payload = {
        "answers": [0, 1, 2, 3],
        "guesses": [1, 1, 2, 0]
    }
    submit_res = client.post(f"/api/v1/sessions/{sess_data['id']}/me/submit", json=submit_payload, headers=headers)
    assert submit_res.status_code == 200
    submit_data = submit_res.json()
    assert set(submit_data.keys()) == expected_status_keys

    # 8. 결과 조회 (waiting 응답의 키가 정확히 2개인지 검증: status, partnerCompleted)
    result_res = client.get(f"/api/v1/sessions/{sess_data['id']}/result")
    assert result_res.status_code == 200
    res_json = result_res.json()
    assert set(res_json.keys()) == {"status", "partnerCompleted"}, f"waiting 응답 키는 정확히 2개여야 합니다: {res_json.keys()}"
    assert res_json["status"] == "waiting"
    assert res_json["partnerCompleted"] is False

    # 9. 쿠키 없이 /api/v1/me/session 호출 시 401 공통 에러 봉투 확인
    unauth_client = TestClient(app, cookies={})
    unauth_res = unauth_client.get("/api/v1/me/session")
    assert unauth_res.status_code == 401
    assert unauth_res.json()["error"]["code"] == "PARTICIPANT_UNAUTHORIZED"

    print("✅ [테스트 7] F2 세션/초대(최소정보)/가변입력(배열)/상태DTO/waiting결과 검증 정상")

def test_result_excludes_sensitive_questions():
    """결과 DTO가 공개 질문만 직렬화하고 서버 계산 집계를 보존하는지 검증"""
    question_ids = [
        "monthly_income",
        "saving_ratio",
        "spending_style",
        "debt_load",
        "shared_expense",
    ]
    sensitive_labels = {
        "monthly_income": "300~450만원",
        "saving_ratio": "60~120만원",
        "debt_load": "3천만~1억원",
    }
    questions = [
        {
            "questionId": question_id,
            "questionText": f"{question_id} 질문",
            "myAnswer": 2,
            "partnerAnswer": 2,
            "myGuess": 2,
            "isHit": question_id in {"monthly_income", "spending_style"},
            "isMatch": True,
            "myAnswerLabel": sensitive_labels.get(question_id, f"{question_id} 공개 라벨"),
            "partnerAnswerLabel": sensitive_labels.get(question_id, f"{question_id} 공개 라벨"),
        }
        for question_id in question_ids
    ]
    type_result = classify_type(["saver_moderate"], ["joint_allowance"], cutoff=3.0)
    mutual_hit_count = calculate_mutual_hit_count(
        answers_a=[0, 1, 2, 3, None],
        guesses_a=[1, 0, 2, 2, 3],
        answers_b=[1, 1, 0, 2, 3],
        guesses_b=[0, 1, 3, 0, None],
        question_count=5,
    )
    assert mutual_hit_count == 1

    result = ResultReadyResponse(
        status="ready",
        partnerCompleted=True,
        result=LightComparisonResultData(
            questionCount=5,
            mutualHitCount=mutual_hit_count,
            tagline="서로의 생각을 이해하고 맞춰가는 첫걸음",
            myType=type_result,
            partnerType=type_result,
            discussionTopics=[],
            questions=questions,
        ),
    )
    serialized = result.model_dump_json()
    serialized_data = json.loads(serialized)
    public_questions = serialized_data["result"]["questions"]

    assert [question["questionId"] for question in public_questions] == [
        "spending_style",
        "shared_expense",
    ]
    assert serialized_data["result"]["questionCount"] == 5
    assert serialized_data["result"]["mutualHitCount"] == 1
    for sensitive_id in ("monthly_income", "saving_ratio", "debt_load"):
        assert sensitive_id not in serialized
    for sensitive_label in sensitive_labels.values():
        assert sensitive_label not in serialized

    assert public_questions[0]["myAnswerLabel"] == "spending_style 공개 라벨"
    assert public_questions[1]["partnerAnswerLabel"] == "shared_expense 공개 라벨"

def test_mutual_hit_count_requires_both_predictions_and_non_null_values():
    """A만 또는 B만 적중한 질문과 null 비교는 상호 적중에서 제외하는지 검증"""
    assert calculate_mutual_hit_count(
        answers_a=[0, 1, None],
        guesses_a=[1, 2, 2],
        answers_b=[1, 0, 2],
        guesses_b=[2, 1, None],
        question_count=3,
    ) == 0

    assert calculate_mutual_hit_count(
        answers_a=[0, 1],
        guesses_a=[1, 0],
        answers_b=[1, 0],
        guesses_b=[0, 1],
        question_count=2,
    ) == 2

def test_openapi_schema_integrity():
    """OpenAPI 스키마 무결성 검증: 필수 필드, cookieAuth, 백엔드 스냅샷"""
    schema = app.openapi()
    schemas = schema.get("components", {}).get("schemas", {})

    # 1. HTTPValidationError 및 ValidationError 완전 제거 확인
    assert "HTTPValidationError" not in schemas, "OpenAPI 스키마에 HTTPValidationError가 존재하지 않아야 합니다."
    assert "ValidationError" not in schemas, "OpenAPI 스키마에 ValidationError가 존재하지 않아야 합니다."

    # 2. ErrorResponse 존재 확인
    assert "ErrorResponse" in schemas

    # 3. cookieAuth 보안 스킴 등록 확인
    sec_schemes = schema.get("components", {}).get("securitySchemes", {})
    assert "cookieAuth" in sec_schemes
    assert sec_schemes["cookieAuth"]["name"] == "mrs_participant"

    # 4. 응답에 항상 포함되는 필드의 required 계약 검증
    expected_required = {
        "InvitationResponse": ["mode", "duration", "expiresAt"],
        "SessionStatusResponse": [
            "meCompleted",
            "partnerJoined",
            "partnerCompleted",
            "partnerNudgedAt",
            "expiresAt",
        ],
        "ResultWaitingResponse": ["status", "partnerCompleted"],
        "ResultReadyResponse": ["status", "partnerCompleted", "result"],
    }
    for schema_name, required_fields in expected_required.items():
        assert schemas[schema_name]["required"] == required_fields

    assert schemas["ResultWaitingResponse"]["properties"]["status"]["const"] == "waiting"
    assert schemas["ResultReadyResponse"]["properties"]["status"]["const"] == "ready"

    assert schemas["QuestionComparisonItem"]["properties"]["questionId"]["enum"] == [
        "spending_style",
        "shared_expense",
    ]

    # 5. 보호 대상 엔드포인트 7개에 security: [{'cookieAuth': []}] 설정 확인
    protected_targets = [
        ("get", "/api/v1/me/session"),
        ("get", "/api/v1/sessions/{session_id}/me/input"),
        ("patch", "/api/v1/sessions/{session_id}/me/input"),
        ("post", "/api/v1/sessions/{session_id}/me/submit"),
        ("get", "/api/v1/sessions/{session_id}/status"),
        ("post", "/api/v1/sessions/{session_id}/nudge"),
        ("get", "/api/v1/sessions/{session_id}/result"),
    ]
    paths = schema.get("paths", {})
    for method, path in protected_targets:
        op = paths.get(path, {}).get(method, {})
        assert "security" in op, f"{method.upper()} {path}에 security 항목이 정의되어 있어야 합니다."
        assert op["security"] == [{"cookieAuth": []}], f"{method.upper()} {path} security가 cookieAuth로 설정되어야 합니다."

    # 6. 백엔드/프론트엔드 OpenAPI 파일과 앱 스키마의 동일성 검증
    from export_openapi import export_openapi, generate_openapi_json_string

    export_openapi()

    backend_path = Path(__file__).resolve().parent / "openapi.json"
    frontend_path = Path(__file__).resolve().parents[1] / "frontend" / "openapi.json"
    expected_content = generate_openapi_json_string().encode("utf-8")
    backend_content = backend_path.read_bytes()
    frontend_content = frontend_path.read_bytes()
    assert backend_content == expected_content
    assert frontend_content == expected_content
    assert backend_content == frontend_content

    print("✅ [테스트 9] OpenAPI required/security 계약 및 백엔드 스키마 무결성 정상")

if __name__ == "__main__":
    test_health()
    test_light_questions()
    test_deep_questions()
    test_config_endpoint()
    test_calculate_light_endpoint()
    test_validator_endpoint_and_rules()
    test_gate1_session_and_result_contract()
    test_result_excludes_sensitive_questions()
    test_mutual_hit_count_requires_both_predictions_and_non_null_values()
    test_openapi_schema_integrity()
    print("\n🎉 [전체 통과] 모든 백엔드 완료 조건 검증 완료!")
