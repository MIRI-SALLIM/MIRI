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
    NudgeResponse,
    QuestionSet,
    ResultReadyResponse,
    ResultWaitingResponse,
    SaveInputRequest,
    SessionParticipant,
    SessionResponse,
    SessionResultResponse,
    SessionStatusResponse,
    SubmitResponse,
    UserInputData,
)
from services.calculator import calculate_light_surplus, classify_type
from services.session_repository import (
    SessionRepository,
    as_iso,
    as_utc,
    digest_participant_token,
    question_count_for,
    utc_now,
)
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
_session_repository: SessionRepository | None = None

async def get_async_client() -> AsyncMongoClient[Any] | None:
    """현재 실행 중인 이벤트 루프에 바인딩된 AsyncMongoClient를 반환합니다."""
    global _async_client
    if ENVIRONMENT.lower() == "test":
        return None
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


async def get_session_repository() -> SessionRepository:
    global _session_repository
    if _session_repository is not None:
        return _session_repository

    if ENVIRONMENT.lower() == "test":
        _session_repository = SessionRepository(use_memory=True)
        return _session_repository

    database = await get_database()
    if database is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "DATABASE_UNAVAILABLE",
                "message": "세션 데이터베이스에 연결할 수 없습니다.",
            },
        )

    _session_repository = SessionRepository(database)
    try:
        await _session_repository.ensure_indexes()
    except PyMongoError as exc:
        _session_repository = None
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "DATABASE_UNAVAILABLE",
                "message": "세션 데이터베이스에 연결할 수 없습니다.",
            },
        ) from exc
    return _session_repository


def _parse_participant_cookie(cookie: str | None) -> tuple[str, str] | None:
    if not cookie or ":" not in cookie:
        return None
    session_id, token = cookie.split(":", 1)
    if not session_id or not token:
        return None
    return session_id, token


def _public_participant(participant: dict[str, Any]) -> SessionParticipant:
    return SessionParticipant(
        role=str(participant.get("role", "creator")),
        nickname=participant.get("nickname"),
        hasSubmitted=participant.get("completedAt") is not None,
    )


def _public_session(document: dict[str, Any], role: str) -> dict[str, Any]:
    return {
        "id": document["id"],
        "mode": document.get("mode", "light"),
        "invitationCode": document["invitationCode"],
        "status": document.get("status", "in_progress"),
        "myRole": role,
        "participants": [
            _public_participant(participant)
            for participant in document.get("participants", [])
        ],
        "createdAt": as_iso(document.get("createdAt")),
    }


def _get_participant(document: dict[str, Any], token_hash: str) -> dict[str, Any] | None:
    return next(
        (
            participant
            for participant in document.get("participants", [])
            if participant.get("tokenHash") == token_hash
        ),
        None,
    )


def _get_partner(document: dict[str, Any], token_hash: str) -> dict[str, Any] | None:
    return next(
        (
            participant
            for participant in document.get("participants", [])
            if participant.get("tokenHash") != token_hash
        ),
        None,
    )


def _raise_if_expired(document: dict[str, Any]) -> None:
    expires_at = document.get("expiresAt")
    if isinstance(expires_at, datetime.datetime) and as_utc(expires_at) <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "SESSION_EXPIRED",
                "message": "세션이 만료되었습니다.",
            },
        )


async def _authenticated_session(
    session_id: str,
    cookie: str | None,
    *,
    participant_only: bool = False,
) -> tuple[SessionRepository, dict[str, Any], str, str]:
    parsed = _parse_participant_cookie(cookie)
    if parsed is None or parsed[0] != session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "PARTICIPANT_UNAUTHORIZED",
                "message": "참여자 인증 정보가 유효하지 않습니다.",
            },
        )

    repository = await get_session_repository()
    token_hash = digest_participant_token(parsed[1], PARTICIPANT_TOKEN_PEPPER)
    document = await repository.get_by_id_and_token(
        session_id,
        token_hash,
        participant_only=participant_only,
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "PARTICIPANT_UNAUTHORIZED",
                "message": "참여자 인증 정보가 유효하지 않습니다.",
            },
        )
    _raise_if_expired(document)
    return repository, document, token_hash, parsed[1]


def _session_status(document: dict[str, Any], token_hash: str) -> dict[str, Any]:
    me = _get_participant(document, token_hash)
    partner = _get_partner(document, token_hash)
    return {
        "meCompleted": bool(me and me.get("completedAt") is not None),
        "partnerJoined": partner is not None,
        "partnerCompleted": bool(partner and partner.get("completedAt") is not None),
        "partnerNudgedAt": as_iso(partner.get("lastNudgedAt")) if partner else None,
        "expiresAt": as_iso(document.get("expiresAt")),
    }


def _session_question_count(document: dict[str, Any]) -> int:
    """Use the question-set-sized arrays pinned on the session document."""
    participants = document.get("participants", [])
    for participant in participants:
        answers = participant.get("answers")
        if isinstance(answers, list):
            return len(answers)
    return 0

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
    response: Response,
    req: CreateSessionRequest | None = None,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", description="중복 요청 방지를 위한 멱등성 키 (UUID)")
) -> dict[str, Any]:
    active_req = req or CreateSessionRequest(nickname=None, mode="light")
    repository = await get_session_repository()
    now = utc_now()
    question_config = get_cached_config("light_questions")
    question_count = question_count_for(question_config)
    document, token = await repository.create(
        nickname=active_req.nickname,
        mode=active_req.mode,
        question_set_version="light-v1" if active_req.mode == "light" else f"{active_req.mode}-v1",
        question_count=question_count,
        idempotency_key=idempotency_key,
        pepper=PARTICIPANT_TOKEN_PEPPER,
        now=now,
        ttl_days=SESSION_TTL_DAYS,
    )

    # 쿠키 발급
    response.set_cookie(
        key=PARTICIPANT_COOKIE_NAME,
        value=f"{document['id']}:{token}",
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="lax",
        max_age=SESSION_TTL_DAYS * 86400,
        path="/"
    )

    return _public_session(document, "creator")


@app.get(
    "/api/v1/me/session",
    summary="현재 참여자 쿠키 기준 활성 세션 조회",
    response_model=SessionResponse,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 쿠키 누락 또는 만료"},
        404: {"model": ErrorResponse, "description": "세션을 찾을 수 없음"}
    },
    openapi_extra={"security": [{"cookieAuth": []}]},
    tags=["세션"]
)
async def get_my_session(
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME, description="참여자 인증 쿠키")
) -> dict[str, Any]:
    parsed = _parse_participant_cookie(mrs_participant)
    if parsed is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "PARTICIPANT_UNAUTHORIZED", "message": "참여자 인증 정보가 유효하지 않습니다."}
        )
    repository = await get_session_repository()
    token_hash = digest_participant_token(parsed[1], PARTICIPANT_TOKEN_PEPPER)
    document = await repository.get_by_id_and_token(parsed[0], token_hash)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "PARTICIPANT_UNAUTHORIZED", "message": "참여자 인증 정보가 유효하지 않습니다."}
        )
    _raise_if_expired(document)
    participant = _get_participant(document, token_hash)
    role = str(participant.get("role", "creator")) if participant else "creator"
    return _public_session(document, role)


@app.get(
    "/api/v1/invitations/{code}",
    summary="초대 코드 유효성 확인 및 공개 초대 미리보기 조회",
    response_model=InvitationResponse,
    responses={
        404: {"model": ErrorResponse, "description": "유효하지 않거나 만료된 초대 링크"}
    },
    tags=["초대"]
)
async def get_invitation(
    code: str = FastPath(..., description="초대 코드 (예: INV-7890)")
) -> dict[str, Any]:
    repository = await get_session_repository()
    document = await repository.get_by_code(code)
    # 유효하지 않은 코드, 만료된 코드, 이미 참여된 코드 모두 중립적인 404 반환
    if (
        document is None
        or not code.startswith("INV-")
        or len(document.get("participants", [])) >= 2
        or (
            isinstance(document.get("expiresAt"), datetime.datetime)
            and as_utc(document["expiresAt"]) <= utc_now()
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVITATION_NOT_FOUND", "message": "유효하지 않거나 만료된 초대 링크입니다."}
        )
    return {
        "mode": document.get("mode", "light"),
        "duration": "3분" if document.get("mode", "light") == "light" else "15분",
        "expiresAt": as_iso(document.get("expiresAt")),
    }


@app.post(
    "/api/v1/invitations/{code}/join",
    summary="초대 수락 및 세션 참여 (쿠키 발급)",
    response_model=SessionResponse,
    responses={
        404: {"model": ErrorResponse, "description": "존재하지 않거나 만료된 초대 코드"},
        409: {"model": ErrorResponse, "description": "이미 상대방이 참여 완료된 세션"},
        422: {"model": ErrorResponse, "description": "입력값 검증 실패"}
    },
    tags=["초대"]
)
async def join_invitation(
    code: str,
    response: Response,
    req: JoinInvitationRequest | None = None,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", description="중복 요청 방지를 위한 멱등성 키 (UUID)")
) -> dict[str, Any]:
    active_req = req or JoinInvitationRequest(nickname=None)
    repository = await get_session_repository()
    document = await repository.get_by_code(code)
    if not code.startswith("INV-") or document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVITATION_NOT_FOUND", "message": "유효하지 않거나 만료된 초대 링크입니다."}
        )
    expires_at = document.get("expiresAt")
    if isinstance(expires_at, datetime.datetime) and as_utc(expires_at) <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVITATION_NOT_FOUND", "message": "초대 링크를 사용할 수 없습니다."},
        )
    if len(document.get("participants", [])) >= 2:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "SESSION_ALREADY_JOINED", "message": "이미 상대방이 참여한 세션입니다."}
        )

    question_count = _session_question_count(document)
    joined_document, token = await repository.join(
        invitation_code=code,
        nickname=active_req.nickname,
        question_count=question_count,
        pepper=PARTICIPANT_TOKEN_PEPPER,
        now=utc_now(),
    )
    if joined_document is None or token is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "SESSION_ALREADY_JOINED", "message": "이미 상대방이 참여한 세션입니다."}
        )

    response.set_cookie(
        key=PARTICIPANT_COOKIE_NAME,
        value=f"{joined_document['id']}:{token}",
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="lax",
        max_age=SESSION_TTL_DAYS * 86400,
        path="/"
    )

    return _public_session(joined_document, "invitee")


@app.get(
    "/api/v1/sessions/{session_id}/me/input",
    summary="세션 내 본인 임시 저장 답변 조회",
    response_model=UserInputData,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 실패"},
        404: {"model": ErrorResponse, "description": "세션 또는 저장된 입력을 찾을 수 없음"}
    },
    openapi_extra={"security": [{"cookieAuth": []}]},
    tags=["입력"]
)
async def get_my_input(
    session_id: str = FastPath(..., description="세션 ID"),
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME)
) -> dict[str, Any]:
    _repository, document, token_hash, _token = await _authenticated_session(
        session_id,
        mrs_participant,
        participant_only=True,
    )
    participant = _get_participant(document, token_hash)
    if participant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INPUT_NOT_FOUND", "message": "저장된 입력을 찾을 수 없습니다."},
        )
    return {
        "answers": participant.get("answers", []),
        "guesses": participant.get("guesses", []),
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
    openapi_extra={"security": [{"cookieAuth": []}]},
    tags=["입력"]
)
async def save_my_input(
    session_id: str,
    req: SaveInputRequest,
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", description="중복 요청 방지를 위한 멱등성 키 (UUID)")
) -> dict[str, Any]:
    repository, document, token_hash, _token = await _authenticated_session(
        session_id,
        mrs_participant,
        participant_only=True,
    )
    question_count = _session_question_count(document)
    if len(req.answers) != question_count or (
        req.guesses is not None and len(req.guesses) != question_count
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "QUESTION_COUNT_MISMATCH",
                "message": f"답변 배열은 {question_count}개여야 합니다.",
            },
        )
    answers = [int(value) if value is not None else None for value in req.answers]
    guesses = (
        [int(value) if value is not None else None for value in req.guesses]
        if req.guesses is not None
        else None
    )
    result, updated_document = await repository.update_input(
        session_id=session_id,
        token_hash=token_hash,
        answers=answers,
        guesses=guesses,
        now=utc_now(),
    )
    if result == "expired":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "SESSION_EXPIRED", "message": "?몄뀡??留뚮즺?섏뿀?듬땲??"},
        )
    if result == "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "SESSION_ALREADY_SUBMITTED", "message": "이미 제출된 세션은 수정할 수 없습니다."},
        )
    if updated_document is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "PARTICIPANT_UNAUTHORIZED", "message": "참여자 인증 정보가 유효하지 않습니다."},
        )
    updated_participant = _get_participant(updated_document, token_hash)
    return {
        "answers": updated_participant.get("answers", []) if updated_participant else [],
        "guesses": updated_participant.get("guesses", []) if updated_participant else [],
    }


@app.post(
    "/api/v1/sessions/{session_id}/me/submit",
    summary="세션 내 본인 답변 최종 제출",
    response_model=SubmitResponse,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 실패"},
        404: {"model": ErrorResponse, "description": "세션을 찾을 수 없음"},
        409: {"model": ErrorResponse, "description": "이미 제출 완료된 상태"},
        410: {"model": ErrorResponse, "description": "만료된 세션"},
        422: {"model": ErrorResponse, "description": "미완성 답변/예측 등 검증 실패"}
    },
    openapi_extra={"security": [{"cookieAuth": []}]},
    tags=["입력"]
)
async def submit_my_input(
    session_id: str = FastPath(..., description="세션 ID"),
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", description="중복 요청 방지를 위한 멱등성 키 (UUID)")
) -> dict[str, Any]:
    repository, _document, token_hash, _token = await _authenticated_session(
        session_id,
        mrs_participant,
        participant_only=True,
    )
    result, submitted_document = await repository.submit(
        session_id=session_id,
        token_hash=token_hash,
        now=utc_now(),
    )
    if result == "expired":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "SESSION_EXPIRED", "message": "세션이 만료되었습니다."},
        )
    if result == "incomplete":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INPUT_INCOMPLETE", "message": "모든 질문에 대한 답변과 상대방 예측을 완료해야 제출할 수 있습니다."},
        )
    if submitted_document is None or result == "not_found":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "PARTICIPANT_UNAUTHORIZED", "message": "참여자 인증 정보가 유효하지 않습니다."},
        )
    participant = _get_participant(submitted_document, token_hash)
    completed_at = participant.get("completedAt") if participant else None
    return {
        "status": "submitted",
        "completedAt": as_iso(completed_at) or as_iso(utc_now()),
    }


@app.get(
    "/api/v1/sessions/{session_id}/status",
    summary="세션 진행 및 양측 제출 현황 조회",
    response_model=SessionStatusResponse,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 실패"},
        404: {"model": ErrorResponse, "description": "세션을 찾을 수 없음"}
    },
    openapi_extra={"security": [{"cookieAuth": []}]},
    tags=["세션"]
)
async def get_session_status(
    session_id: str = FastPath(..., description="세션 ID"),
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME)
) -> dict[str, Any]:
    _repository, document, token_hash, _token = await _authenticated_session(
        session_id,
        mrs_participant,
    )
    return _session_status(document, token_hash)


@app.post(
    "/api/v1/sessions/{session_id}/nudge",
    summary="미제출 상대방에게 넛지(재촉 알림) 요청",
    response_model=NudgeResponse,
    responses={
        401: {"model": ErrorResponse, "description": "참여자 인증 실패"},
        409: {"model": ErrorResponse, "description": "상대방에게 nudge를 보낼 수 없는 상태"},
        410: {"model": ErrorResponse, "description": "만료된 세션"},
        429: {"model": ErrorResponse, "description": "단시간 내 과도한 알림 요청 제한"}
    },
    openapi_extra={"security": [{"cookieAuth": []}]},
    tags=["세션"]
)
async def nudge_partner(
    session_id: str = FastPath(..., description="세션 ID"),
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", description="중복 요청 방지를 위한 멱등성 키 (UUID)")
) -> dict[str, Any]:
    repository, _document, token_hash, _token = await _authenticated_session(
        session_id,
        mrs_participant,
    )
    result, _updated_document = await repository.nudge(
        session_id=session_id,
        token_hash=token_hash,
        now=utc_now(),
    )
    if result in {"partner_not_joined", "target_unavailable"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "NUDGE_TARGET_UNAVAILABLE", "message": "상대방에게 지금 nudge를 보낼 수 없습니다."},
        )
    if result == "expired":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "SESSION_EXPIRED", "message": "세션이 만료되었습니다."},
        )
    if result == "rate_limited":
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "NUDGE_RATE_LIMITED", "message": "넛지는 24시간에 한 번만 보낼 수 있습니다."},
        )
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
    openapi_extra={"security": [{"cookieAuth": []}]},
    tags=["결과"]
)
async def get_session_result(
    session_id: str = FastPath(..., description="세션 ID"),
    mrs_participant: str | None = Cookie(None, alias=PARTICIPANT_COOKIE_NAME)
) -> Any:
    repository, _document, token_hash, _token = await _authenticated_session(
        session_id,
        mrs_participant,
    )
    result_status, _doc, projected = await repository.get_or_create_result(
        session_id=session_id,
        token_hash=token_hash,
        now=utc_now(),
    )
    if result_status == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SESSION_NOT_FOUND", "message": "세션을 찾을 수 없습니다."},
        )
    if result_status == "waiting":
        return ResultWaitingResponse(
            status="waiting",
            partnerCompleted=False,
        )
    if result_status == "ready" and projected is not None:
        return ResultReadyResponse(
            status="ready",
            partnerCompleted=True,
            result=projected,
        )
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={"code": "RESULT_CALCULATION_FAILED", "message": "결과 생성 중 오류가 발생했습니다."},
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

    # 2. 보호 대상 엔드포인트 security 연결
    protected_paths = {
        "/api/v1/me/session",
        "/api/v1/sessions/{session_id}/me/input",
        "/api/v1/sessions/{session_id}/me/submit",
        "/api/v1/sessions/{session_id}/status",
        "/api/v1/sessions/{session_id}/nudge",
        "/api/v1/sessions/{session_id}/result",
    }

    paths = openapi_schema.get("paths", {})
    for path_key, path_item in paths.items():
        if isinstance(path_item, dict):
            for method_item in path_item.values():
                if isinstance(method_item, dict):
                    # 보호 대상 경로인 경우 security 설정
                    if path_key in protected_paths:
                        method_item["security"] = [{"cookieAuth": []}]

                    # 422 상태 응답을 ErrorResponse로 교체
                    responses = method_item.get("responses", {})
                    if "422" in responses:
                        responses["422"] = {
                            "description": "입력값 검증 실패 (Validation Error)",
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/ErrorResponse"}
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
