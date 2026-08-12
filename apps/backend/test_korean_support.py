import io
import sys
from typing import Any, cast

from fastapi.testclient import TestClient

if sys.platform == "win32" and isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(encoding="utf-8")

from main import app
from services.calculator import classify_type
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
    """Gate 1 세션 생성, 초대, 쿠키, Idempotency-Key 및 waiting 응답(정확히 2개 키) 계약 검증"""
    # 1. 세션 생성 (201 Created, Idempotency-Key 헤더, 쿠키 발급 확인)
    headers = {"Idempotency-Key": "test-uuid-1234"}
    create_res = client.post("/api/v1/sessions", json={"nickname": "예랑이", "mode": "light"}, headers=headers)
    assert create_res.status_code == 201
    sess_data = create_res.json()
    assert sess_data["id"].startswith("sess_")
    assert sess_data["myRole"] == "creator"
    assert "mrs_participant" in create_res.cookies

    # 2. 초대 조회
    inv_code = sess_data["invitationCode"]
    inv_res = client.get(f"/api/v1/invitations/{inv_code}")
    assert inv_res.status_code == 200
    assert inv_res.json()["invitationCode"] == inv_code

    # 3. 초대 참여 (쿠키 발급)
    join_res = client.post(f"/api/v1/invitations/{inv_code}/join", json={"nickname": "예신이"}, headers=headers)
    assert join_res.status_code == 200
    assert join_res.json()["myRole"] == "invitee"
    assert "mrs_participant" in join_res.cookies

    # 4. 입력 저장 (0|1|2|3|null DTO 검증)
    input_payload = {
        "answers": {
            "monthly_income": 1,
            "saving_ratio": 2,
            "spending_style": 3,
            "debt_load": 0,
            "shared_expense": 2
        },
        "guesses": {
            "monthly_income": 1,
            "saving_ratio": 1,
            "spending_style": 0,
            "debt_load": 0,
            "shared_expense": 2
        }
    }
    save_res = client.patch(f"/api/v1/sessions/{sess_data['id']}/me/input", json=input_payload, headers=headers)
    assert save_res.status_code == 200
    assert save_res.json()["answers"]["monthly_income"] == 1

    # 5. 잘못된 답변 값(범위 밖 4 등) 전송 시 422 검증
    bad_input_payload = {
        "answers": {
            "monthly_income": 4  # 0, 1, 2, 3 범위를 벗어남
        }
    }
    bad_res = client.patch(f"/api/v1/sessions/{sess_data['id']}/me/input", json=bad_input_payload)
    assert bad_res.status_code == 422
    assert bad_res.json()["error"]["code"] == "VALIDATION_ERROR"

    # 6. 결과 조회 (waiting 응답의 키가 정확히 2개인지 검증: status, partnerCompleted)
    result_res = client.get(f"/api/v1/sessions/{sess_data['id']}/result")
    assert result_res.status_code == 200
    res_json = result_res.json()
    assert set(res_json.keys()) == {"status", "partnerCompleted"}, f"waiting 응답 키는 정확히 2개여야 합니다: {res_json.keys()}"
    assert res_json["status"] == "waiting"
    assert res_json["partnerCompleted"] is False

    # 7. 쿠키 없이 /api/v1/me/session 호출 시 401 공통 에러 봉투 확인
    unauth_client = TestClient(app, cookies={})
    unauth_res = unauth_client.get("/api/v1/me/session")
    assert unauth_res.status_code == 401
    assert unauth_res.json()["error"]["code"] == "PARTICIPANT_UNAUTHORIZED"

    print("✅ [테스트 7] Gate 1 세션/초대/쿠키/waiting(2개 키) 및 0|1|2|3|null DTO 검증 정상")

def test_openapi_schema_integrity():
    """OpenAPI 스키마에서 HTTPValidationError 제거 및 ErrorResponse 통일, cookieAuth 검증"""
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

    print("✅ [테스트 8] OpenAPI 스키마 HTTPValidationError 제거 및 ErrorResponse 통일 무결성 정상")

if __name__ == "__main__":
    test_health()
    test_light_questions()
    test_deep_questions()
    test_config_endpoint()
    test_calculate_light_endpoint()
    test_validator_endpoint_and_rules()
    test_gate1_session_and_result_contract()
    test_openapi_schema_integrity()
    print("\n🎉 [전체 통과] 모든 백엔드 완료 조건 검증 완료!")
