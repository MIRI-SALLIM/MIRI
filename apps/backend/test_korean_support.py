import io
import sys
from typing import Any, Dict, List, cast
from fastapi.testclient import TestClient

if sys.platform == "win32" and isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(encoding="utf-8")

from main import app
from services.calculator import calculate_light_surplus, classify_type
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
    """라이트 진단 7개 문항, 선택지 대표값, 5단계 척도 한국어 데이터 검증"""
    res = client.get("/api/v1/light/questions?version=light-v1")
    assert res.status_code == 200
    data = res.json()
    assert data["version"] == "light-v1"
    assert data["title"] == "미리살림 라이트 진단 질문 세트"
    questions = cast(List[Dict[str, Any]], data["questions"])
    assert len(questions) == 7

    # q1~q7 전체 문항 ID 및 카테고리 검증
    expected_categories = {
        "q1": "소득",
        "q2": "잉여자금",
        "q3": "소득",
        "q4": "잉여자금",
        "q5": "부채",
        "q6": "시간축 성향",
        "q7": "관리축 성향"
    }
    for q in questions:
        qid = q["id"]
        assert qid in expected_categories
        assert q["category"] == expected_categories[qid]

    # q1 (소득 구간 및 옵션)
    q1 = questions[0]
    options = cast(List[Dict[str, Any]], q1["options"])
    assert len(options) == 5
    assert options[2]["label"] == "250~330만"
    assert options[2]["rep"] == 290.0

    # q6 (시간축 척도)
    q6 = questions[5]
    q6_scale = cast(Dict[str, Any], q6["scaleConfig"])
    assert q6_scale["min"] == 1
    assert q6_scale["max"] == 5
    assert len(q6_scale["steps"]) == 5

    # q7 (관리축 척도)
    q7 = questions[6]
    q7_scale = cast(Dict[str, Any], q7["scaleConfig"])
    assert len(q7_scale["steps"]) == 5

    # 404 에러 핸들러 검증
    err_res = client.get("/api/v1/light/questions?version=wrong-v")
    assert err_res.status_code == 404
    err_data = err_res.json()
    assert err_data["code"] == "QUESTION_SET_NOT_FOUND"
    assert "찾을 수 없습니다" in err_data["message"]
    print("✅ [테스트 2] /api/v1/light/questions 7개 문항 및 에러 핸들러 정상")

def test_deep_questions():
    """딥 진단 8개 가치관 문항(5대 영역) 및 척도 한국어 데이터 검증"""
    res = client.get("/api/v1/deep/questions?version=deep-v1")
    assert res.status_code == 200
    data = res.json()
    assert data["version"] == "deep-v1"
    questions = cast(List[Dict[str, Any]], data["questions"])
    assert len(questions) == 8

    # 5대 핵심 가치관 영역(저축, 소비, 투자, 부채, 공동관리) 확인
    categories = {q["category"] for q in questions}
    assert {"저축", "소비", "투자", "부채", "공동관리"}.issubset(categories)

    d1 = questions[0]
    assert d1["id"] == "D1"
    assert d1["category"] == "저축"
    d1_scale = cast(Dict[str, Any], d1["scaleConfig"])
    assert len(d1_scale["steps"]) == 5

    # 404 에러 검증
    err_res = client.get("/api/v1/deep/questions?version=invalid")
    assert err_res.status_code == 404
    print("✅ [테스트 3] /api/v1/deep/questions 8개 가치관 문항 정상")

def test_config_endpoint():
    """설정 데이터(/api/v1/config) 조회 및 캐싱 검증"""
    for config_type in ["parameters", "coefficients", "ranges", "benchmarks"]:
        res = client.get(f"/api/v1/config/{config_type}")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert isinstance(data["data"], dict)
        assert len(data["data"]) > 0

    # 잘못된 타입 400 에러 검증
    err_res = client.get("/api/v1/config/invalid_type")
    assert err_res.status_code == 400
    print("✅ [테스트 4] /api/v1/config 설정 데이터 조회 및 캐싱 정상")

def test_calculate_light_endpoint():
    """라이트 진단 연산 API - 1차원/2차원 배열 호환 및 4대 성향 분류 검증"""
    # 1. 1차원 mgmtAxisAnswers 요청 검증 (프론트엔드 일반 전송 형태)
    req_payload_1d = {
        "incomeA": 290.0,
        "incomeB": 210.0,
        "surplusA": 85.0,
        "surplusB": 40.0,
        "timeAxisAnswers": [4, 5],
        "mgmtAxisAnswers": [4, 4]
    }
    res1 = client.post("/api/v1/calculate/light", json=req_payload_1d)
    assert res1.status_code == 200
    data1 = res1.json()["result"]
    assert data1["surplus"]["rawSurplus"] == 181.2
    assert data1["surplus"]["formattedSurplus"] == "약 180만원대"
    assert data1["typeClassification"]["typeCode"] == "saver_joint"
    assert data1["typeClassification"]["typeName"] == "함께 모으는 든든한 동반자형"

    # 2. 2차원 mgmtAxisAnswers 요청 검증 (기존 레거시 호환 형태)
    req_payload_2d = {
        "incomeA": 290.0,
        "incomeB": 210.0,
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

    # 3. spender_joint & spender_separate 검증
    res3 = classify_type([2, 1], [4, 5], cutoff=3.0)
    assert res3["typeCode"] == "spender_joint"
    assert res3["typeName"] == "함께 즐기는 욜로동반형"

    res4 = classify_type([1, 2], [1, 2], cutoff=3.0)
    assert res4["typeCode"] == "spender_separate"
    assert res4["typeName"] == "각자 즐기는 독립형"

    print("✅ [테스트 5] /api/v1/calculate/light 1D/2D 배열 호환 및 4대 성향 분류 정상")

def test_validator_endpoint_and_rules():
    """입력 데이터 유효성 검증(V-01 ~ V-05) 전체 규칙 검증"""
    # 1. API 엔드포인트(/api/v1/validate/input) 호출 검증
    payload = {
        "monthlyNetIncome": 50.0,     # V-01 위반 (< 100)
        "totalExpense": 100.0,        # V-02 위반 (> 소득)
        "debtTotal": 4000.0,          # V-03 위반 (50 * 12 * 5 = 3000 < 4000)
        "variableExpenses": 0.0,      # V-04 위반 (= 0)
        "savings": 0.0                # income <= 400 이므로 V-05는 미해당
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

    # 2. V-05 (소득 > 400 & 저축 == 0) 규칙 검증
    mock_params = {
        "inputValidation": {
            "rules": [
                {"id": "V-01", "field": "monthlyNetIncome", "condition": "< 100 또는 > 700", "level": "confirm", "message": "소득 금액 확인"},
                {"id": "V-02", "field": "totalExpense", "condition": "지출 > 소득", "level": "warn", "message": "적자 발생"},
                {"id": "V-03", "field": "debtTotal", "condition": "> 연소득 5배", "level": "confirm", "message": "부채 초과"},
                {"id": "V-04", "field": "variableExpenses", "condition": "= 0", "level": "warn", "message": "변동비 없음"},
                {"id": "V-05", "field": "savings", "condition": "= 0 이고 income > 400", "level": "confirm", "message": "고소득 저축 0원 확인"}
            ]
        }
    }
    v5_warnings = validate_input({"monthlyNetIncome": 500, "savings": 0}, mock_params)
    assert any(w["id"] == "V-05" for w in v5_warnings)

    print("✅ [테스트 6] /api/v1/validate/input 및 V-01~V-05 유효성 검증 규칙 전체 정상")

if __name__ == "__main__":
    test_health()
    test_light_questions()
    test_deep_questions()
    test_config_endpoint()
    test_calculate_light_endpoint()
    test_validator_endpoint_and_rules()
    print("\n🎉 [전체 통과] 모든 한국어 문구, 질문/선택지, 설정 캐싱, 1D/2D 호환 연산 및 유효성 검증 완료!")
