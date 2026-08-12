import json
import os
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Path, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo import MongoClient
from dotenv import load_dotenv

from schemas import (
    ErrorResponse,
    HealthResponse,
    QuestionSet,
    QuestionItem,
    QuestionOption,
    ScaleConfig,
    LightDiagnosisRequest,
    LightDiagnosisResponse,
    ConfigResponse,
    InputValidationRequest,
    InputValidationResponse,
)
from services.calculator import calculate_light_surplus, classify_type
from services.validator import validate_input

load_dotenv()

# ==========================================
# FastAPI 앱 및 미들웨어 설정
# ==========================================

app = FastAPI(
    title="미리살림 백엔드 API",
    description="신혼부부를 위한 맞춤형 재무 진단, 설정 데이터 조회 및 라이트/딥 진단 연산 API 모듈입니다. 모든 질문, 선택지, 결과 해설을 한국어로 지원합니다.",
    version="1.0.0",
    servers=[
        {"url": "https://mirisalim-backend.onrender.com", "description": "운영 서버 (Production)"},
        {"url": "http://127.0.0.1:8000", "description": "로컬 개발 서버 (Local)"}
    ]
)

# CORS 설정 (환경변수 CORS_ORIGINS 및 기본 로컬/운영 허용, 쿠키/자격증명 지원)
default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://mirisalim-backend.onrender.com",
]
env_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
origins = list(dict.fromkeys(default_origins + env_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 커스텀 예외 핸들러 (ErrorResponse 스키마 일치화)
# ==========================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "code": exc.detail.get("code", "ERROR"),
                "message": exc.detail.get("message", "오류가 발생했습니다.")
            }
        )
    detail_msg = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": "HTTP_ERROR",
            "message": detail_msg
        }
    )

# ==========================================
# MongoDB 클라이언트 설정 및 인메모리 캐시
# ==========================================

MONGODB_URI = os.getenv("MONGODB_URI")
# serverSelectionTimeoutMS=5000: DB 미연결 시 무한 대기 방지
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000) if MONGODB_URI else None
db = client.get_database("mirisalim") if client is not None else None

_config_cache: Dict[str, Any] = {}

def get_cached_config(config_type: str) -> Optional[Dict[str, Any]]:
    """설정 데이터를 메모리 캐시에서 우선 조회하고, 없으면 DB/로컬 파일에서 조회하여 캐시합니다."""
    if config_type in _config_cache:
        return _config_cache[config_type]

    # 1. MongoDB에서 조회 시도
    if db is not None:
        try:
            doc = db[config_type].find_one({"_id": "current_config"})
            if doc and "data" in doc:
                _config_cache[config_type] = doc["data"]
                return doc["data"]
        except Exception:
            pass

    # 2. 로컬 config 디렉터리 파일 폴백 (테스트 및 오프라인 대비)
    local_path = os.path.join(os.path.dirname(__file__), "config", f"{config_type}.json")
    if os.path.exists(local_path):
        try:
            with open(local_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                _config_cache[config_type] = data
                return data
        except Exception:
            pass

    return None


# ==========================================
# API 엔드포인트 정의
# ==========================================

@app.get(
    "/health",
    summary="서버 및 데이터베이스 연결 상태 확인",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    tags=["시스템"]
)
def health() -> Dict[str, Any]:
    is_connected = False
    if client is not None:
        try:
            client.admin.command('ping')
            is_connected = True
        except Exception:
            is_connected = False

    return {
        "status": "ok",
        "database": "connected" if is_connected else "disconnected",
        "message": "미리살림 백엔드 서버 및 데이터베이스가 정상 가동 중입니다." if is_connected else "데이터베이스 연결 상태를 확인해 주세요."
    }


@app.get(
    "/api/v1/light/questions",
    summary="라이트 모드 질문 및 선택지 목록 조회",
    response_model=QuestionSet,
    responses={
        404: {"model": ErrorResponse, "description": "질문 세트를 찾을 수 없음"}
    },
    tags=["라이트 진단"]
)
def get_light_questions(
    version: str = Query(..., examples=["light-v1"], description="질문 세트 버전 식별자 (예: light-v1)")
) -> Dict[str, Any]:
    if version != "light-v1":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "QUESTION_SET_NOT_FOUND", "message": f"'{version}' 버전을 찾을 수 없습니다."}
        )

    income_options = [
        {"label": "170만 미만", "value": "under_170", "rep": 130.0, "description": "월 실수령 170만원 미만 (하위 20% 이하)"},
        {"label": "170~250만", "value": "170_250", "rep": 210.0, "description": "월 실수령 170만원 이상 ~ 250만원 미만"},
        {"label": "250~330만", "value": "250_330", "rep": 290.0, "description": "월 실수령 250만원 이상 ~ 330만원 미만 (30대 중위 소득 구간)"},
        {"label": "330~450만", "value": "330_450", "rep": 380.0, "description": "월 실수령 330만원 이상 ~ 450만원 미만"},
        {"label": "450만 이상", "value": "over_450", "rep": 550.0, "description": "월 실수령 450만원 이상 (상위 20% 이상)"}
    ]

    surplus_options = [
        {"label": "거의 없음", "value": "none_or_little", "rep": 10.0, "description": "월 20만원 미만 (생활비 지출 후 잉여 자금 거의 없음)"},
        {"label": "20~60만", "value": "20_60", "rep": 40.0, "description": "월 20만원 이상 ~ 60만원 미만"},
        {"label": "60~120만", "value": "60_120", "rep": 85.0, "description": "월 60만원 이상 ~ 120만원 미만 (1인가구 평균 흑자액 수준)"},
        {"label": "120만 이상", "value": "over_120", "rep": 160.0, "description": "월 120만원 이상 (적극적인 저축/투자 가능)"}
    ]

    debt_options = [
        {"label": "없음", "value": "none", "rep": 0.0, "description": "보유 중인 대출 및 부채 없음"},
        {"label": "3천만 미만", "value": "under_30m", "rep": 1500.0, "description": "총 부채 3천만원 미만"},
        {"label": "3천~7천만", "value": "30m_70m", "rep": 5000.0, "description": "총 부채 3천만원 이상 ~ 7천만원 미만"},
        {"label": "7천~1.5억", "value": "70m_150m", "rep": 11000.0, "description": "총 부채 7천만원 이상 ~ 1억 5천만원 미만 (30대 평균 부채 수준)"},
        {"label": "1.5억 이상", "value": "over_150m", "rep": 20000.0, "description": "총 부채 1억 5천만원 이상 (주택담보대출 포함 등)"}
    ]

    partner_income_options = income_options + [
        {"label": "해당 없음 (외벌이/무소득)", "value": "none", "rep": 0.0, "description": "상대방 소득 없음"}
    ]

    partner_surplus_options = surplus_options + [
        {"label": "해당 없음 (0원)", "value": "none", "rep": 0.0, "description": "잉여자금 없음"}
    ]

    return {
        "version": "light-v1",
        "title": "미리살림 라이트 진단 질문 세트",
        "description": "3분 만에 확인하는 신혼부부 맞춤형 저축여력 추정 및 4대 재무 성향 진단 문항입니다.",
        "questions": [
            {
                "id": "q1",
                "order": 1,
                "category": "소득",
                "target": "self",
                "text": "본인의 월 실수령 소득 구간을 선택해 주세요.",
                "subText": "세후 실수령액(월급 기준)을 선택해 주세요.",
                "type": "range_choice",
                "options": income_options
            },
            {
                "id": "q2",
                "order": 2,
                "category": "잉여자금",
                "target": "self",
                "text": "본인이 매월 저축이나 투자로 남길 수 있는 잉여자금 구간을 선택해 주세요.",
                "subText": "월 고정지출과 생활비를 제외하고 남는 여유 자금입니다.",
                "type": "range_choice",
                "options": surplus_options
            },
            {
                "id": "q3",
                "order": 3,
                "category": "소득",
                "target": "partner",
                "text": "상대방(배우자)의 월 실수령 소득 구간을 선택해 주세요.",
                "subText": "상대방의 소득을 알고 계신 대로 선택해 주세요. (외벌이인 경우 0원 선택)",
                "type": "range_choice",
                "options": partner_income_options
            },
            {
                "id": "q4",
                "order": 4,
                "category": "잉여자금",
                "target": "partner",
                "text": "상대방(배우자)의 매월 잉여자금 구간을 선택해 주세요.",
                "subText": "상대방이 저축/투자 가능한 여유 금액을 추정하여 선택해 주세요.",
                "type": "range_choice",
                "options": partner_surplus_options
            },
            {
                "id": "q5",
                "order": 5,
                "category": "부채",
                "target": "self",
                "text": "현재 보유 중인 총 대출 및 부채 규모를 선택해 주세요.",
                "subText": "신용대출, 전세자금대출, 학자금대출 등 총 부채 잔액 (선택사항)",
                "type": "range_choice",
                "options": debt_options
            },
            {
                "id": "q6",
                "order": 6,
                "category": "시간축 성향",
                "target": "self",
                "text": "현재의 소비와 미래의 저축 중 어느 쪽에 더 가치를 두시나요?",
                "subText": "1점(강한 소비/현재만족)부터 5점(강한 저축/미래준비)까지 선택해 주세요.",
                "type": "scale",
                "scaleConfig": {
                    "min": 1,
                    "max": 5,
                    "leftLabel": "현재의 삶과 소비의 즐거움 우선",
                    "rightLabel": "미래의 안정과 저축 목표 우선",
                    "steps": [
                        "1점: 현재 소비와 행복이 최우선",
                        "2점: 소비를 약간 더 선호",
                        "3점: 소비와 저축의 균형",
                        "4점: 저축을 약간 더 선호",
                        "5점: 미래를 위한 저축과 안정이 최우선"
                    ]
                }
            },
            {
                "id": "q7",
                "order": 7,
                "category": "관리축 성향",
                "target": "self",
                "text": "결혼 후 부부의 돈 관리는 어떤 방식을 선호하시나요?",
                "subText": "1점(완전 각자 개별관리)부터 5점(하나로 합친 완전 공동관리)까지 선택해 주세요.",
                "type": "scale",
                "scaleConfig": {
                    "min": 1,
                    "max": 5,
                    "leftLabel": "각자 독립 관리 및 공동비만 분담",
                    "rightLabel": "모든 통장을 합쳐 공동 관리",
                    "steps": [
                        "1점: 완전한 각자 통장 및 독립 관리",
                        "2점: 각자 관리 위주 + 공동 생활비 통장",
                        "3점: 반반 절충형 관리",
                        "4점: 공동 관리 위주 + 개인 용돈 통장",
                        "5점: 모든 소득/통장 완전 통합 공동 관리"
                    ]
                }
            }
        ]
    }


@app.get(
    "/api/v1/deep/questions",
    summary="딥 모드 가치관 질문 목록 조회",
    response_model=QuestionSet,
    responses={
        404: {"model": ErrorResponse, "description": "질문 세트를 찾을 수 없음"}
    },
    tags=["딥 진단"]
)
def get_deep_questions(
    version: str = Query("deep-v1", examples=["deep-v1"], description="딥 진단 질문 세트 버전 (기본값: deep-v1)")
) -> Dict[str, Any]:
    if version != "deep-v1":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "QUESTION_SET_NOT_FOUND", "message": f"'{version}' 버전을 찾을 수 없습니다."}
        )

    deep_raw = [
        {"id": "D1", "category": "저축", "text": "쓰고 남으면 저축한다 ↔ 저축부터 하고 남는 걸 쓴다", "left": "쓰고 남은 돈을 저축", "right": "먼저 저축하고 남은 돈을 소비"},
        {"id": "D2", "category": "저축", "text": "목돈 목표를 정해두고 모은다 ↔ 상황에 맞춰 유동적으로 모은다", "left": "목표 금액을 정해 철저히 저축", "right": "상황에 맞춰 유동적으로 모음"},
        {"id": "D3", "category": "소비", "text": "사고 싶은 게 있으면 바로 산다 ↔ 한참 고민하고 산다", "left": "사고 싶은 것은 바로 구매", "right": "충분히 고민하고 비교 후 구매"},
        {"id": "D4", "category": "소비", "text": "경조사나 선물에는 넉넉히 쓴다 ↔ 최소한으로 한다", "left": "경조사/선물에 아낌없이 지출", "right": "실속 위주로 최소한만 지출"},
        {"id": "D5", "category": "투자", "text": "손실 위험이 있어도 수익을 노린다 ↔ 적더라도 안전한 게 낫다", "left": "원금 손실 감수하고 고수익 추구", "right": "원금 보존 중심의 안전성 추구"},
        {"id": "D6", "category": "부채", "text": "필요하면 대출은 활용할 수 있는 도구다 ↔ 빚은 최대한 피해야 한다", "left": "대출을 적극적인 레버리지로 활용", "right": "대출과 빚은 무조건 최소화"},
        {"id": "D7", "category": "공동관리", "text": "결혼하면 통장을 합치고 싶다 ↔ 각자 관리하고 공동비만 분담하고 싶다", "left": "모든 통장을 하나로 합쳐 통합 관리", "right": "각자 독립 관리하며 공동비만 분담"},
        {"id": "D8", "category": "공동관리", "text": "서로의 지출을 모두 공유해야 한다 ↔ 각자 쓰는 돈은 묻지 않는다", "left": "개인 지출 내역까지 모두 투명하게 공유", "right": "개인 용돈과 지출은 상호 불간섭"}
    ]

    questions = []
    for idx, item in enumerate(deep_raw, start=1):
        questions.append({
            "id": item["id"],
            "order": idx,
            "category": item["category"],
            "target": "self",
            "text": item["text"],
            "subText": f"1점({item['left']})부터 5점({item['right']})까지 본인의 생각에 가까운 점수를 선택해 주세요.",
            "type": "scale",
            "scaleConfig": {
                "min": 1,
                "max": 5,
                "leftLabel": item["left"],
                "rightLabel": item["right"],
                "steps": [
                    f"1점: 매우 {item['left']}",
                    f"2점: 약간 {item['left']}",
                    "3점: 중간 / 보통",
                    f"4점: 약간 {item['right']}",
                    f"5점: 매우 {item['right']}"
                ]
            }
        })

    return {
        "version": "deep-v1",
        "title": "미리살림 딥 진단 가치관 질문 세트",
        "description": "신혼부부의 5대 핵심 재무 가치관(저축, 소비, 투자, 부채, 공동관리) 영역별 8개 심층 문항입니다.",
        "questions": questions
    }


@app.get(
    "/api/v1/config/{config_type}",
    summary="설정 데이터 조회",
    response_model=ConfigResponse,
    responses={
        400: {"model": ErrorResponse, "description": "유효하지 않은 설정 데이터 종류"},
        404: {"model": ErrorResponse, "description": "설정 데이터를 찾을 수 없음"},
        500: {"model": ErrorResponse, "description": "서버 내부 / 데이터베이스 오류"}
    },
    tags=["설정 데이터"]
)
def get_config(
    config_type: str = Path(..., description="조회할 설정 데이터 종류 (parameters | coefficients | ranges | benchmarks)")
) -> Dict[str, Any]:
    valid_types = ["parameters", "coefficients", "ranges", "benchmarks"]
    if config_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_CONFIG_TYPE", "message": "유효하지 않은 설정 타입입니다. (parameters, coefficients, ranges, benchmarks 중 선택)"}
        )
    
    data = get_cached_config(config_type)
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CONFIG_NOT_FOUND", "message": f"'{config_type}' 설정 데이터를 찾을 수 없습니다."}
        )
    
    return {"status": "success", "data": data}


@app.post(
    "/api/v1/calculate/light",
    summary="라이트 모드 저축여력 추정 및 4대 성향 유형 분류",
    response_model=LightDiagnosisResponse,
    responses={
        500: {"model": ErrorResponse, "description": "서버 내부 / 데이터베이스 오류"}
    },
    tags=["라이트 진단"]
)
def calculate_light(req: LightDiagnosisRequest) -> Dict[str, Any]:
    coeff_data = get_cached_config("coefficients")
    param_data = get_cached_config("parameters")

    if coeff_data is None or param_data is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "CONFIG_LOAD_FAILED", "message": "진단에 필요한 설정 데이터를 불러올 수 없습니다."}
        )

    cutoff = param_data.get("typeAxis", {}).get("cutoff", 3.0)

    surplus_result = calculate_light_surplus(
        req.incomeA, req.incomeB, req.surplusA, req.surplusB, coeff_data
    )

    type_result = classify_type(
        req.timeAxisAnswers, req.mgmtAxisAnswers, cutoff
    )

    return {
        "status": "success",
        "result": {
            "surplus": surplus_result,
            "typeClassification": type_result
        }
    }


@app.post(
    "/api/v1/validate/input",
    summary="입력 데이터 이상치 및 재무 상태 유효성 검증",
    response_model=InputValidationResponse,
    responses={
        500: {"model": ErrorResponse, "description": "서버 내부 오류"}
    },
    tags=["유효성 검증"]
)
def validate_user_input(req: InputValidationRequest) -> Dict[str, Any]:
    param_data = get_cached_config("parameters") or {}
    input_dict = {k: v for k, v in req.model_dump().items() if v is not None}
    warnings = validate_input(input_dict, param_data)
    return {
        "status": "success",
        "warnings": warnings
    }