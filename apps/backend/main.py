import asyncio
import datetime
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import (
    Cookie,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from fastapi import Path as FastPath
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyCookie
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError
from starlette.middleware.base import BaseHTTPMiddleware

from schemas import (
    ConfigResponse,
    CreateSessionRequest,
    ErrorResponse,
    HealthResponse,
    InputValidationRequest,
    InputValidationResponse,
    InvitationResponse,
    JoinInvitationRequest,
    LightDiagnosisRequest,
    LightDiagnosisResponse,
    LightInputAnswers,
    LightInputGuesses,
    NudgeResponse,
    QuestionSet,
    ResultWaitingResponse,
    SaveInputRequest,
    SessionParticipant,
    SessionResponse,
    SessionResultResponse,
    SessionStatusResponse,
    SubmitInputRequest,
    UserInputData,
)
from services.calculator import calculate_light_surplus, classify_type
from services.validator import validate_input

load_dotenv()

# ==========================================
# 환경 설정 및 상수
# ==========================================

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT.lower() in ("production", "prod")

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE") or os.getenv("MONGODB_DB_NAME") or "mirisalim"
PARTICIPANT_TOKEN_PEPPER = os.getenv("PARTICIPANT_TOKEN_PEPPER", "mirisalim_dev_pepper_secret_2026")
SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "7"))

PARTICIPANT_COOKIE_NAME = "mrs_participant"

# ==========================================
# FastAPI 앱 및 미들웨어 설정
# ==========================================

app = FastAPI(
    title="미리살림 백엔드 API",
    description="신혼부부를 위한 맞춤형 재무 진단, 세션 관리 및 라이트/딥 진단 연산 API 모듈입니다. 모든 질문, 선택지, 결과 해설을 한국어로 지원합니다.",
    version="1.0.0",
    servers=[
        {"url": "/", "description": "기본 서버 (Default)"}
    ]
)

# 쿠키 보안 스킴 정의
cookie_sec = APIKeyCookie(name=PARTICIPANT_COOKIE_NAME, auto_error=False, description="참여자 인증 쿠키")

# CORS 설정
default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://mirisalim-backend.onrender.com",
]
env_origins = [
    o.strip() for o in (
        os.getenv("ALLOWED_ORIGINS") or os.getenv("CORS_ORIGINS") or ""
    ).split(",") if o.strip()
]
origins = list(dict.fromkeys(default_origins + env_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 보안 및 캐시 제어 미들웨어
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Response:
        response: Response = await call_next(request)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        return response

app.add_middleware(SecurityHeadersMiddleware)


# ==========================================
# 공통 오류 응답 핸들러 (Unified Error Envelope)
# ==========================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    field_errors: dict[str, list[str]] = {}
    for err in exc.errors():
        loc = err.get("loc", [])
        field_name = str(loc[-1]) if loc else "general"
        msg = err.get("msg", "유효하지 않은 입력값입니다.")
        if field_name not in field_errors:
            field_errors[field_name] = []
        field_errors[field_name].append(msg)
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "입력값 검증에 실패했습니다.",
                "fieldErrors": field_errors
            }
        }
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.detail.get("code", "ERROR"),
                    "message": exc.detail.get("message", "오류가 발생했습니다."),
                    "fieldErrors": exc.detail.get("fieldErrors", {})
                }
            }
        )
    detail_msg = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    error_code = "HTTP_ERROR"
    if exc.status_code == 401:
        error_code = "UNAUTHORIZED"
    elif exc.status_code == 404:
        error_code = "NOT_FOUND"
    elif exc.status_code == 409:
        error_code = "CONFLICT"
    elif exc.status_code == 410:
        error_code = "GONE"
    elif exc.status_code == 429:
        error_code = "TOO_MANY_REQUESTS"
    elif exc.status_code == 503:
        error_code = "SERVICE_UNAVAILABLE"
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": error_code,
                "message": detail_msg,
                "fieldErrors": {}
            }
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "서버 내부 오류가 발생했습니다.",
                "fieldErrors": {}
            }
        }
    )


# ==========================================
# 비동기 MongoDB 클라이언트 및 인메모리 캐시
# ==========================================

_async_client: AsyncMongoClient[Any] | None = None

async def get_async_client() -> AsyncMongoClient[Any] | None:
    """현재 실행 중인 이벤트 루프에 바인딩된 AsyncMongoClient를 반환합니다."""
    global _async_client
    if not MONGODB_URI:
        return None
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _async_client is None or getattr(_async_client, "_loop", None) != current_loop:
        try:
            _async_client = AsyncMongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        except PyMongoError:
            _async_client = None
    return _async_client

async def get_database() -> Any | None:
    client = await get_async_client()
    if client is not None:
        return client[MONGODB_DATABASE]
    return None

_config_cache: dict[str, Any] = {}

def get_cached_config(config_type: str) -> dict[str, Any] | None:
    """설정 데이터를 메모리 캐시에서 우선 조회하고, 없으면 로컬 파일/DB에서 조회하여 캐시합니다."""
    if config_type in _config_cache:
        return _config_cache[config_type]

    # 로컬 config 디렉터리 파일 폴백
    local_path = Path(__file__).resolve().parent / "config" / f"{config_type}.json"
    if local_path.exists():
        try:
            with open(local_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                _config_cache[config_type] = data
                return data
        except (OSError, json.JSONDecodeError):
            return None

    return None


# ==========================================
# 시스템 & 공통 엔드포인트
# ==========================================

@app.get(
    "/health",
    summary="서버 및 데이터베이스 연결 상태 확인",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    tags=["시스템"]
)
async def health() -> dict[str, Any]:
    is_connected = False
    client = await get_async_client()
    if client is not None:
        try:
            await client.admin.command('ping')
            is_connected = True
        except (PyMongoError, Exception):  # noqa: BLE001
            is_connected = False

    return {
        "status": "ok",
        "database": "connected" if is_connected else "disconnected",
        "message": "미리살림 백엔드 서버 및 데이터베이스가 정상 가동 중입니다." if is_connected else "데이터베이스 연결 상태를 확인해 주세요."
    }


# ==========================================
# 질문 조회 엔드포인트
# ==========================================

@app.get(
    "/api/v1/light/questions",
    summary="라이트 모드 5대 질문 및 선택지 목록 조회",
    response_model=QuestionSet,
    responses={
        404: {"model": ErrorResponse, "description": "질문 세트를 찾을 수 없음"},
        422: {"model": ErrorResponse, "description": "입력 파라미터 검증 실패"}
    },
    tags=["라이트 진단"]
)
def get_light_questions(
    version: str = Query("light-v1", description="질문 세트 버전 식별자 (기본값: light-v1)")
) -> dict[str, Any]:
    if version != "light-v1":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "QUESTION_SET_NOT_FOUND", "message": f"'{version}' 버전을 찾을 수 없습니다."}
        )

    config_data = get_cached_config("light_questions")
    if config_data is not None:
        return config_data

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={"code": "CONFIG_NOT_FOUND", "message": "라이트 진단 질문 설정 파일을 불러올 수 없습니다."}
    )


@app.get(
    "/api/v1/deep/questions",
    summary="딥 모드 가치관 질문 목록 조회",
    response_model=QuestionSet,
    responses={
        404: {"model": ErrorResponse, "description": "질문 세트를 찾을 수 없음"},
        422: {"model": ErrorResponse, "description": "입력 파라미터 검증 실패"}
    },
    tags=["딥 진단"]
)
def get_deep_questions(
    version: str = Query("deep-v1", description="딥 진단 질문 세트 버전 (기본값: deep-v1)")
) -> dict[str, Any]:
    if version != "deep-v1":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "QUESTION_SET_NOT_FOUND", "message": f"'{version}' 버전을 찾을 수 없습니다."}
        )

    param_data = get_cached_config("parameters") or {}
    deep_mappings = param_data.get("questionMapping", {}).get("deep", [])

    questions: list[dict[str, Any]] = []
    for idx, item in enumerate(deep_mappings, start=1):
        left_label = item.get("left", "왼쪽 서술 성향")
        right_label = item.get("right", "오른쪽 서술 성향")
        questions.append({
            "id": item["id"],
            "order": idx,
            "category": item.get("category", item.get("area", "가치관")),
            "target": "self",
            "text": item["text"],
            "subText": f"1점({left_label})부터 5점({right_label})까지 본인의 생각에 가까운 점수를 선택해 주세요.",
            "type": "scale",
            "scaleConfig": {
                "min": 1,
                "max": 5,
                "leftLabel": left_label,
                "rightLabel": right_label,
                "steps": [
                    f"1점: 매우 {left_label}",
                    f"2점: 약간 {left_label}",
                    "3점: 중간 / 보통",
                    f"4점: 약간 {right_label}",
                    f"5점: 매우 {right_label}"
                ]
            }
        })

    return {
        "version": "deep-v1",
        "title": "미리살림 딥 진단 가치관 질문 세트",
        "description": "신혼부부의 5대 핵심 재무 가치관(저축, 소비, 투자, 부채, 공동관리) 영역별 8개 심층 문항입니다.",
        "questions": questions
    }


# ==========================================
# 설정 데이터 조회 엔드포인트
# ==========================================

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
    config_type: str = FastPath(..., description="조회할 설정 데이터 종류 (parameters | coefficients | ranges | benchmarks | light_questions | light_types)")
) -> dict[str, Any]:
    valid_types = ["parameters", "coefficients", "ranges", "benchmarks", "light_questions", "light_types"]
    if config_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_CONFIG_TYPE", "message": f"유효하지 않은 설정 타입입니다. ({', '.join(valid_types)} 중 선택)"}
        )
    
    data = get_cached_config(config_type)
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CONFIG_NOT_FOUND", "message": f"'{config_type}' 설정 데이터를 찾을 수 없습니다."}
        )
    
    return {"status": "success", "data": data}


# ==========================================
# 연산 및 유효성 검증 엔드포인트
# ==========================================

@app.post(
    "/api/v1/calculate/light",
    summary="라이트 모드 저축여력 추정 및 4대 성향 유형 분류",
    response_model=LightDiagnosisResponse,
    responses={
        422: {"model": ErrorResponse, "description": "요청 본문 유효성 검증 실패"},
        500: {"model": ErrorResponse, "description": "서버 내부 오류"}
    },
    tags=["라이트 진단"]
)
def calculate_light(req: LightDiagnosisRequest) -> dict[str, Any]:
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
        422: {"model": ErrorResponse, "description": "요청 본문 유효성 검증 실패"},
        500: {"model": ErrorResponse, "description": "서버 내부 오류"}
    },
    tags=["유효성 검증"]
)
def validate_user_input(req: InputValidationRequest) -> dict[str, Any]:
    param_data = get_cached_config("parameters") or {}
    input_dict = {k: v for k, v in req.model_dump().items() if v is not None}
    warnings = validate_input(input_dict, param_data)
    return {
        "status": "success",
        "warnings": warnings
    }


# ==========================================
# Gate 1: 세션, 초대, 입력 및 결과 엔드포인트
# ==========================================

@app.post(
    "/api/v1/sessions",
    summary="진단 세션 생성 및 참여자 쿠키 발급",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        422: {"model": ErrorResponse, "description": "입력값 검증 실패"},
        500: {"model": ErrorResponse, "description": "세션 생성 실패"}
    },
    tags=["세션"]
)
async def create_session(
    req: CreateSessionRequest, 
    response: Response,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", description="중복 요청 방지를 위한 멱등성 키 (UUID)")
) -> dict[str, Any]:
    session_id = f"sess_{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')}_{os.urandom(3).hex()}"
    invitation_code = f"INV-{os.urandom(2).hex().upper()}"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # 쿠키 발급
    response.set_cookie(
        key=PARTICIPANT_COOKIE_NAME,
        value=f"{session_id}:creator",
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="lax",
        max_age=SESSION_TTL_DAYS * 86400,
        path="/"
    )

    return {
        "id": session_id,
        "mode": req.mode,
        "invitationCode": invitation_code,
        "status": "in_progress",
        "myRole": "creator",
        "participants": [
            SessionParticipant(role="creator", nickname=req.nickname, hasSubmitted=False)
        ],
        "createdAt": now_iso
    }


@app.get(
    "/api/v1/me/session",
    summary="현재 참여자 쿠키 기준 활성 세션 조회",
    response_model=SessionResponse,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 쿠키 누락 또는 만료"},
        404: {"model": ErrorResponse, "description": "세션을 찾을 수 없음"}
    },
    tags=["세션"]
)
async def get_my_session(
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME, description="참여자 인증 쿠키")
) -> dict[str, Any]:
    if not mrs_participant:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "PARTICIPANT_UNAUTHORIZED", "message": "참여자 인증 정보가 유효하지 않습니다."}
        )

    parts = mrs_participant.split(":")
    session_id = parts[0]
    role = parts[1] if len(parts) > 1 else "creator"

    return {
        "id": session_id,
        "mode": "light",
        "invitationCode": "INV-7890",
        "status": "in_progress",
        "myRole": role,
        "participants": [
            SessionParticipant(role="creator", nickname="작성자", hasSubmitted=False)
        ],
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }


@app.get(
    "/api/v1/invitations/{code}",
    summary="초대 코드 유효성 확인 및 초대자 정보 조회",
    response_model=InvitationResponse,
    responses={
        404: {"model": ErrorResponse, "description": "유효하지 않은 초대 코드"},
        410: {"model": ErrorResponse, "description": "만료된 초대 코드"}
    },
    tags=["초대"]
)
async def get_invitation(
    code: str = FastPath(..., description="초대 코드 (예: INV-7890)")
) -> dict[str, Any]:
    if code == "EXPIRED":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "INVITATION_EXPIRED", "message": "만료된 초대 링크입니다."}
        )
    if not code.startswith("INV-"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVITATION_NOT_FOUND", "message": "존재하지 않는 초대 코드입니다."}
        )

    return {
        "invitationCode": code,
        "inviterNickname": "초대자",
        "mode": "light",
        "status": "active"
    }


@app.post(
    "/api/v1/invitations/{code}/join",
    summary="초대 수락 및 세션 참여 (쿠키 발급)",
    response_model=SessionResponse,
    responses={
        404: {"model": ErrorResponse, "description": "존재하지 않는 초대 코드"},
        409: {"model": ErrorResponse, "description": "이미 상대방이 참여 완료된 세션"},
        410: {"model": ErrorResponse, "description": "만료된 초대 코드"},
        422: {"model": ErrorResponse, "description": "입력값 검증 실패"}
    },
    tags=["초대"]
)
async def join_invitation(
    code: str,
    req: JoinInvitationRequest,
    response: Response,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", description="중복 요청 방지를 위한 멱등성 키 (UUID)")
) -> dict[str, Any]:
    if not code.startswith("INV-"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVITATION_NOT_FOUND", "message": "존재하지 않는 초대 코드입니다."}
        )

    session_id = f"sess_joined_{code.replace('INV-', '')}"

    response.set_cookie(
        key=PARTICIPANT_COOKIE_NAME,
        value=f"{session_id}:invitee",
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="lax",
        max_age=SESSION_TTL_DAYS * 86400,
        path="/"
    )

    return {
        "id": session_id,
        "mode": "light",
        "invitationCode": code,
        "status": "in_progress",
        "myRole": "invitee",
        "participants": [
            SessionParticipant(role="creator", nickname="초대자", hasSubmitted=False),
            SessionParticipant(role="invitee", nickname=req.nickname, hasSubmitted=False)
        ],
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }


@app.get(
    "/api/v1/sessions/{session_id}/me/input",
    summary="세션 내 본인 임시 저장 답변 조회",
    response_model=UserInputData,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 실패"},
        404: {"model": ErrorResponse, "description": "세션 또는 저장된 입력을 찾을 수 없음"}
    },
    tags=["입력"]
)
async def get_my_input(
    session_id: str = FastPath(..., description="세션 ID"),
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME)
) -> dict[str, Any]:
    return {
        "answers": LightInputAnswers(
            monthly_income=1,
            saving_ratio=2,
            spending_style=2,
            debt_load=0,
            shared_expense=2
        ).model_dump(),
        "guesses": LightInputGuesses(
            monthly_income=1,
            saving_ratio=1,
            spending_style=1,
            debt_load=0,
            shared_expense=2
        ).model_dump()
    }


@app.patch(
    "/api/v1/sessions/{session_id}/me/input",
    summary="세션 내 본인 답변 임시 저장 (진행 중 자동 저장)",
    response_model=UserInputData,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 실패"},
        409: {"model": ErrorResponse, "description": "이미 제출 완료되어 수정 불가"},
        422: {"model": ErrorResponse, "description": "입력값 검증 실패"}
    },
    tags=["입력"]
)
async def save_my_input(
    session_id: str,
    req: SaveInputRequest,
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", description="중복 요청 방지를 위한 멱등성 키 (UUID)")
) -> dict[str, Any]:
    return {
        "answers": req.answers.model_dump(),
        "guesses": req.guesses.model_dump() if req.guesses else None
    }


@app.post(
    "/api/v1/sessions/{session_id}/me/submit",
    summary="세션 내 본인 답변 최종 제출",
    response_model=SessionStatusResponse,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 실패"},
        409: {"model": ErrorResponse, "description": "이미 제출 완료된 상태"},
        422: {"model": ErrorResponse, "description": "필수 답변 누락 등 검증 실패"}
    },
    tags=["입력"]
)
async def submit_my_input(
    session_id: str,
    req: SubmitInputRequest,
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", description="중복 요청 방지를 위한 멱등성 키 (UUID)")
) -> dict[str, Any]:
    return {
        "sessionId": session_id,
        "status": "in_progress",
        "isCompleted": False,
        "mySubmitted": True,
        "partnerSubmitted": False,
        "partnerNickname": "상대방"
    }


@app.get(
    "/api/v1/sessions/{session_id}/status",
    summary="세션 진행 및 양측 제출 현황 조회",
    response_model=SessionStatusResponse,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 실패"},
        404: {"model": ErrorResponse, "description": "세션을 찾을 수 없음"}
    },
    tags=["세션"]
)
async def get_session_status(
    session_id: str = FastPath(..., description="세션 ID"),
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME)
) -> dict[str, Any]:
    return {
        "sessionId": session_id,
        "status": "in_progress",
        "isCompleted": False,
        "mySubmitted": True,
        "partnerSubmitted": False,
        "partnerNickname": "상대방"
    }


@app.post(
    "/api/v1/sessions/{session_id}/nudge",
    summary="미제출 상대방에게 넛지(재촉 알림) 요청",
    response_model=NudgeResponse,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 실패"},
        429: {"model": ErrorResponse, "description": "단시간 내 과도한 알림 요청 제한"}
    },
    tags=["세션"]
)
async def nudge_partner(
    session_id: str = FastPath(..., description="세션 ID"),
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", description="중복 요청 방지를 위한 멱등성 키 (UUID)")
) -> dict[str, Any]:
    return {
        "status": "success",
        "message": "상대방에게 참여 알림을 전송했습니다."
    }


@app.get(
    "/api/v1/sessions/{session_id}/result",
    summary="세션 진단 결과 조회 (Discriminated Union: waiting vs ready)",
    response_model=SessionResultResponse,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 실패"},
        404: {"model": ErrorResponse, "description": "세션을 찾을 수 없음"},
        500: {"model": ErrorResponse, "description": "결과 연산 실패"}
    },
    tags=["결과"]
)
async def get_session_result(
    session_id: str = FastPath(..., description="세션 ID"),
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME)
) -> Any:
    # 한 명이라도 미제출한 경우: waiting 응답 반환 (정확히 status, partnerCompleted 2개 필드만 포함)
    return ResultWaitingResponse(
        status="waiting",
        partnerCompleted=False
    )


# ==========================================
# 커스텀 OpenAPI 스키마 생성기
# (HTTPValidationError 제거, ErrorResponse 통일, cookieAuth 추가)
# ==========================================

def custom_openapi() -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        servers=app.servers
    )

    # 1. components.securitySchemes 등록
    components = openapi_schema.setdefault("components", {})
    sec_schemes = components.setdefault("securitySchemes", {})
    sec_schemes["cookieAuth"] = {
        "type": "apiKey",
        "in": "cookie",
        "name": PARTICIPANT_COOKIE_NAME,
        "description": "참여자 세션 인증을 위한 HttpOnly 쿠키"
    }

    # 2. 모든 422 상태 응답을 ErrorResponse로 교체
    error_response_ref = {"$ref": "#/components/schemas/ErrorResponse"}
    paths = openapi_schema.get("paths", {})
    for path_item in paths.values():
        if isinstance(path_item, dict):
            for method_item in path_item.values():
                if isinstance(method_item, dict):
                    responses = method_item.get("responses", {})
                    if "422" in responses:
                        responses["422"] = {
                            "description": "입력값 검증 실패 (Validation Error)",
                            "content": {
                                "application/json": {
                                    "schema": error_response_ref
                                }
                            }
                        }

    # 3. 불필요한 기본 HTTPValidationError 및 ValidationError 스키마 컴포넌트 제거
    schemas = components.get("schemas", {})
    schemas.pop("HTTPValidationError", None)
    schemas.pop("ValidationError", None)

    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi  # type: ignore[method-assign]