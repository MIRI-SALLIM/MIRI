# 미리살림 Backend v1.1 B1–B6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 익명 Light 2인 세션의 질문 조회, 생성, 자동 저장, 제출, 초대, 상태, 넛지, 동시 공개 결과까지 B1–B6를 일관된 `/api/v1` 계약으로 구현한다.

**Architecture:** FastAPI 라우터는 HTTP 변환, 서비스는 도메인 상태 전이, 저장소는 PyMongo 원자 연산, 순수 엔진은 결과 계산을 담당한다. `light-v1` 질문·유형 레지스트리를 세션에 고정하고 OpenAPI를 유일한 프론트 계약으로 사용한다. 루트 `main.py`는 `app.main:app` 호환 shim으로 축소한다.

**Tech Stack:** Python 3.11, FastAPI, Pydantic 2, pydantic-settings, PyMongo Async API 4.13+, MongoDB 8, pytest, pytest-asyncio, HTTPX, testcontainers, Ruff, mypy, uv, Railway, MongoDB Atlas.

## Global Constraints

- 공개 HTTP API는 계속 `/api/v1`이며 Backend v1.1 개편을 위해 `/api/v2`를 만들지 않는다.
- Light는 로그인·닉네임 없이 동작하고 Deep 실행 API는 제공하지 않는다.
- 질문 ID 순서는 `monthly_income`, `monthly_savings_amount`, `spending_style`, `debt_load`, `shared_expense`다.
- 월 저축액은 비율이 아니며 성향 분류에 사용하지 않는다.
- 질문 카드 공개 DTO는 선택지 `index`, `label`, `description`만 제공하고 `value`, `rep`는 서버에만 둔다.
- 참여자 토큰은 256비트 무작위 값이고 DB에는 HMAC-SHA-256 다이제스트만 저장한다.
- 초대 코드는 `MRS-`와 혼동 문자를 제외한 6자리 suffix를 사용한다.
- 한 명이라도 미제출이면 결과 응답은 `status`, `partnerCompleted` 두 필드만 가진다.
- 결과 DTO는 금액 질문의 답, 라벨, 대표 금액을 포함하지 않는다.
- backend 배포 대상은 Railway이며 Render 주소는 development CORS 팀 호환 기본값으로만 유지한다.
- production은 정확한 Vercel Origin의 `ALLOWED_ORIGINS`와 강한 `PARTICIPANT_TOKEN_PEPPER`가 없으면 시작하지 않는다.
- OpenAPI 경로 `/api/v1/...`를 유지하고 프론트 클라이언트 base URL은 빈 same-origin 값이다.
- 원격 push와 실제 Railway·Atlas 변경은 별도 사용자 승인 전에는 수행하지 않는다.

모든 Python·pytest·Ruff·mypy·uv 명령의 작업 디렉터리는 `apps/backend`다. Git 명령은 저장소 루트에서 실행한다.

---

## File Map

```text
apps/backend/
├─ pyproject.toml
├─ uv.lock
├─ main.py
├─ app/
│  ├─ main.py
│  ├─ api/dependencies.py
│  ├─ api/v1/router.py
│  ├─ api/v1/routers/health.py
│  ├─ api/v1/routers/questions.py
│  ├─ api/v1/routers/sessions.py
│  ├─ api/v1/routers/invitations.py
│  ├─ core/errors.py
│  ├─ core/security.py
│  ├─ core/settings.py
│  ├─ db/mongo.py
│  ├─ db/indexes.py
│  ├─ engine/light_result.py
│  ├─ models/session.py
│  ├─ repositories/session_repository.py
│  ├─ schemas/common.py
│  ├─ schemas/questions.py
│  ├─ schemas/sessions.py
│  ├─ schemas/invitations.py
│  ├─ schemas/results.py
│  ├─ services/question_catalog.py
│  ├─ services/session_service.py
│  └─ services/result_service.py
├─ config/light_questions.json
├─ config/light_types.json
├─ scripts/export_openapi.py
└─ tests/
   ├─ api/
   ├─ core/
   ├─ engine/
   ├─ integration/
   ├─ security/
   └─ fakes/session_factory.py
```

---

### Task 1: B1 패키지, Settings, 앱 팩토리, Health

**Files:**
- Create: `apps/backend/pyproject.toml`
- Create: `apps/backend/app/__init__.py`
- Create: `apps/backend/app/core/settings.py`
- Create: `apps/backend/app/core/errors.py`
- Create: `apps/backend/app/api/v1/routers/health.py`
- Create: `apps/backend/app/api/v1/router.py`
- Create: `apps/backend/app/main.py`
- Create: `apps/backend/tests/core/test_settings.py`
- Create: `apps/backend/tests/api/test_health.py`
- Modify: `apps/backend/main.py`
- Modify: `apps/backend/.env.example`

**Interfaces:**
- Produces: `Settings`, `get_settings()`, `create_app()`, `app`.
- Produces: `GET /health -> {"status":"ok"}`.
- Produces: 공통 `ErrorDetail`, `ErrorResponse`, `DomainError`.

- [ ] **Step 1: Settings와 Health 실패 테스트 작성**

```python
def test_production_rejects_missing_origins_and_known_dev_pepper() -> None:
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            mongodb_uri="mongodb://db:27017",
            mongodb_database="mirisallim",
            participant_token_pepper="mirisalim_dev_pepper_secret_2026",
            allowed_origins=[],
        )


def test_development_keeps_team_render_origin() -> None:
    settings = Settings(
        environment="development",
        mongodb_uri="mongodb://localhost:27017",
        participant_token_pepper="development-only-pepper-32-bytes",
    )
    assert "https://mirisalim-backend.onrender.com" in settings.allowed_origins


def test_health_is_exact_liveness_contract(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: 실패 확인**

Run: `uv run --python 3.11 pytest tests/core/test_settings.py tests/api/test_health.py -v`

Expected: `app.core.settings`와 `app.main`이 없어 collection 단계에서 실패한다.

- [ ] **Step 3: 패키지와 Settings 구현**

`pyproject.toml`에 Python `>=3.11,<3.12`, prod 의존성 `fastapi`, `uvicorn[standard]`, `pydantic-settings`, `pymongo>=4.13`과 dev 의존성 `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `mypy`, `testcontainers[mongodb]`를 선언한다.

`settings.py`는 다음 상수와 validator를 구현한다.

```python
from typing import Annotated

from pydantic_settings import NoDecode


DEVELOPMENT_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://mirisalim-backend.onrender.com",
)
KNOWN_DEV_PEPPER = "mirisalim_dev_pepper_secret_2026"


class Settings(BaseSettings):
    environment: Literal["development", "test", "production"] = "development"
    mongodb_uri: str
    mongodb_database: str = "mirisallim"
    participant_token_pepper: str
    allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    session_ttl_days: int = 7
    participant_cookie_name: str = "mrs_participant"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def validate_security_boundary(self) -> "Settings":
        if self.environment == "development" and not self.allowed_origins:
            self.allowed_origins = list(DEVELOPMENT_ORIGINS)
        if self.environment == "production":
            if not self.allowed_origins:
                raise ValueError("ALLOWED_ORIGINS is required in production")
            if self.participant_token_pepper == KNOWN_DEV_PEPPER:
                raise ValueError("development pepper is forbidden in production")
        if len(self.participant_token_pepper.encode("utf-8")) < 32:
            raise ValueError("PARTICIPANT_TOKEN_PEPPER must be at least 32 bytes")
        return self
```

- [ ] **Step 4: 공통 오류와 앱 팩토리 구현**

`create_app()`은 `/health`, 공통 오류 handler, `Cache-Control: no-store`, 제한된 CORS를 등록한다. production 문서 URL은 비활성화한다.

```python
def create_app(settings: Settings | None = None) -> FastAPI:
    active = settings or get_settings()
    app = FastAPI(
        title="미리살림 API",
        version="1.0.0",
        docs_url=None if active.environment == "production" else "/docs",
        redoc_url=None if active.environment == "production" else "/redoc",
    )
    app.state.settings = active
    app.include_router(api_router)
    return app
```

루트 `main.py`는 다음 두 줄만 유지한다.

```python
from app.main import app

__all__ = ["app"]
```

- [ ] **Step 5: 환경 예시와 lock 생성**

`.env.example`에 값이 없는 production 키와 로컬 예시를 구분해 `MONGODB_URI`, `MONGODB_DATABASE`, `PARTICIPANT_TOKEN_PEPPER`, `ALLOWED_ORIGINS`, `SESSION_TTL_DAYS`, `ENVIRONMENT`를 모두 기록한다. `uv lock`으로 `uv.lock`을 생성한다.

- [ ] **Step 6: 검증과 커밋**

Run: `uv run --python 3.11 pytest tests/core/test_settings.py tests/api/test_health.py -v`

Run: `uv run ruff check app tests/core tests/api`

Run: `uv run mypy app`

```bash
git add apps/backend/pyproject.toml apps/backend/uv.lock apps/backend/app apps/backend/tests/core apps/backend/tests/api apps/backend/main.py apps/backend/.env.example
git commit -m "refactor(api): establish Backend v1.1 runtime"
```

---

### Task 2: B2 버전형 질문 레지스트리와 질문 카드 공개 DTO

**Files:**
- Modify: `apps/backend/config/light_questions.json`
- Modify: `apps/backend/config/light_types.json`
- Create: `apps/backend/app/schemas/questions.py`
- Create: `apps/backend/app/services/question_catalog.py`
- Create: `apps/backend/app/api/v1/routers/questions.py`
- Modify: `apps/backend/app/api/v1/router.py`
- Create: `apps/backend/tests/core/test_question_catalog.py`
- Create: `apps/backend/tests/api/test_questions.py`

**Interfaces:**
- Produces: `QuestionCatalog.get(version: str | None) -> QuestionSet`.
- Produces: `GET /api/v1/light/questions?version=light-v1 -> QuestionSet`.
- Produces: 공개 선택지 `QuestionOption(index, label, description)`.
- Keeps server-only: 설정의 `value`, `rep`.

- [ ] **Step 1: 질문 ID와 공개 경계 실패 테스트 작성**

```python
def test_light_v1_uses_monthly_savings_amount(catalog: QuestionCatalog) -> None:
    result = catalog.get("light-v1")
    assert [question.id for question in result.questions] == [
        "monthly_income",
        "monthly_savings_amount",
        "spending_style",
        "debt_load",
        "shared_expense",
    ]


def test_public_options_exclude_internal_value_and_rep(client: TestClient) -> None:
    response = client.get("/api/v1/light/questions?version=light-v1")
    assert response.status_code == 200
    option = response.json()["questions"][0]["options"][0]
    assert set(option) == {"index", "label", "description"}
    assert option["index"] == 0
```

중복 ID, 비연속 order, 선택지 4개 미만, 중복 선택지 value, 결과 축 누락, 알 수 없는 버전의 테스트를 같은 파일에 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `uv run pytest tests/core/test_question_catalog.py tests/api/test_questions.py -v`

Expected: 새 카탈로그와 공개 DTO가 없어 실패한다.

- [ ] **Step 3: 설정을 버전 레지스트리로 변환**

현재 `light_questions.json`의 전체 객체를 `versions.light-v1` 아래로 옮기고 최상위에 `currentVersion: "light-v1"`을 둔다. 두 번째 질문 ID를 정확히 `monthly_savings_amount`로 변경하며 기존 월 금액 선택지와 `rep`는 유지한다.

`light_types.json`도 최상위 `currentVersion: "light-v1"`과 `versions.light-v1` 구조로 감싼다. 기존 네 `types` 객체를 `versions.light-v1.types`로 그대로 이동한다. `versions.light-v1.axes.timeQuestionId`는 `spending_style`, `managementQuestionId`는 `shared_expense`로 기록하고, saver/spender 및 joint/separate 판정은 각 질문의 선택지 인덱스 `2..3` 여부로 정의한다.

- [ ] **Step 4: 공개 Pydantic DTO와 카탈로그 구현**

```python
class QuestionOption(BaseModel):
    index: Literal[0, 1, 2, 3]
    label: str
    description: str


class QuestionItem(BaseModel):
    id: str
    order: int
    category: str
    text: str
    subText: str
    type: str
    options: tuple[QuestionOption, QuestionOption, QuestionOption, QuestionOption]


class QuestionSet(BaseModel):
    version: str
    title: str
    description: str
    questions: list[QuestionItem]
```

`QuestionCatalog`은 원본 config를 먼저 검증한 뒤 `enumerate(raw_options)`로 공개 option을 만든다. raw `value`와 `rep`는 반환 모델에 전달하지 않는다.

- [ ] **Step 5: 질문 라우트 구현**

```python
@router.get("/api/v1/light/questions", response_model=QuestionSet)
async def get_light_questions(
    version: str | None = None,
    catalog: QuestionCatalog = Depends(get_question_catalog),
) -> QuestionSet:
    return catalog.get(version)
```

카탈로그의 unknown version 오류를 404 `QUESTION_SET_NOT_FOUND` 공통 봉투로 변환한다.

- [ ] **Step 6: 검증과 커밋**

Run: `uv run pytest tests/core/test_question_catalog.py tests/api/test_questions.py -v`

Run: `uv run ruff check app tests/core/test_question_catalog.py tests/api/test_questions.py`

Run: `uv run mypy app`

```bash
git add apps/backend/config/light_questions.json apps/backend/config/light_types.json apps/backend/app/schemas/questions.py apps/backend/app/services/question_catalog.py apps/backend/app/api/v1 apps/backend/tests/core/test_question_catalog.py apps/backend/tests/api/test_questions.py
git commit -m "feat(api): publish Backend v1.1 light questions"
```

---

### Task 3: B2 공통 오류 계약과 결정적 OpenAPI

**Files:**
- Modify: `apps/backend/app/core/errors.py`
- Modify: `apps/backend/app/main.py`
- Create: `apps/backend/app/schemas/sessions.py`
- Create: `apps/backend/app/schemas/invitations.py`
- Create: `apps/backend/app/schemas/results.py`
- Create: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/app/api/v1/routers/invitations.py`
- Modify: `apps/backend/app/api/v1/router.py`
- Create: `apps/backend/scripts/export_openapi.py`
- Modify: `apps/backend/openapi.json`
- Modify: `apps/frontend/openapi.json`
- Create: `apps/backend/tests/api/test_error_contract.py`
- Create: `apps/backend/tests/api/test_openapi_contract.py`

**Interfaces:**
- Produces: `{error:{code,message,fieldErrors}}` 오류 봉투.
- Produces: `cookieAuth` OpenAPI security scheme.
- Produces: B3–B6 전체 request/response DTO와 11개 Light operation 계약.
- Produces: byte-identical backend/frontend OpenAPI snapshots.

- [ ] **Step 1: 오류와 OpenAPI 실패 테스트 작성**

```python
def test_unknown_question_version_uses_error_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/light/questions?version=missing")
    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "QUESTION_SET_NOT_FOUND",
            "message": "질문 세트를 찾을 수 없습니다.",
            "fieldErrors": {},
        }
    }


def test_openapi_does_not_publish_internal_question_values(app: FastAPI) -> None:
    schema = app.openapi()
    properties = schema["components"]["schemas"]["QuestionOption"]["properties"]
    assert set(properties) == {"index", "label", "description"}


def test_openapi_freezes_all_light_operations(app: FastAPI) -> None:
    paths = app.openapi()["paths"]
    expected = {
        ("post", "/api/v1/sessions"),
        ("get", "/api/v1/me/session"),
        ("get", "/api/v1/light/questions"),
        ("get", "/api/v1/invitations/{code}"),
        ("post", "/api/v1/invitations/{code}/join"),
        ("get", "/api/v1/sessions/{session_id}/me/input"),
        ("patch", "/api/v1/sessions/{session_id}/me/input"),
        ("post", "/api/v1/sessions/{session_id}/me/submit"),
        ("get", "/api/v1/sessions/{session_id}/status"),
        ("post", "/api/v1/sessions/{session_id}/nudge"),
        ("get", "/api/v1/sessions/{session_id}/result"),
    }
    actual = {(method, path) for path, item in paths.items() for method in item}
    assert expected <= actual
```

- [ ] **Step 2: 실패 확인**

Run: `uv run pytest tests/api/test_error_contract.py tests/api/test_openapi_contract.py -v`

Expected: validation handler와 B3–B6 계약 route가 없어 실패한다.

- [ ] **Step 3: B3–B6 계약 DTO와 route skeleton 구현**

다음 계약을 Pydantic model로 먼저 고정한다.

| Operation | Request | Response |
| --- | --- | --- |
| create session | body 없음, `Idempotency-Key` | `sessionId`, `code`, `questionSetVersion`, `expiresAt` |
| active session | cookie | `sessionId`, `code`, `role`, `questionSetVersion`, `status`, `expiresAt` |
| invitation preview | code | `mode`, `durationMinutes`, `expiresAt` |
| invitation join | body 없음, idempotency header | active session shape |
| input GET/PATCH | parallel arrays | `answers`, `guesses` |
| submit | body 없음, idempotency header | `status=submitted`, `completedAt` |
| status | cookie | `status`, completion booleans, nudge/expiry timestamps |
| nudge | cookie, idempotency header | `status=success`, `nudgedAt` |
| result | cookie | discriminated waiting/ready union |

`LightResultData`는 `questionCount`, `mutualHitCount`, `tagline`, `myType`, `partnerType`, `discussionTopics`, `questions`를 필수로 가진다. `TypeResult`는 `typeCode`, `typeName`, `typeDescription`, `recommendation`을 가진다. `questions`의 `PublicQuestionComparison`은 `questionId`, `questionText`, `myAnswer`, `partnerAnswer`, `myGuess`, `isHit`, `isMatch`, `myAnswerLabel`, `partnerAnswerLabel`을 가지며 `questionId`는 `spending_style | shared_expense`로 제한한다.

라우트 skeleton은 정확한 path, header, cookie security, response model, error response를 선언하고 handler 본문에서 503 `FEATURE_NOT_READY`를 반환한다. Task 4–7은 DTO와 decorator를 바꾸지 않고 handler body와 service dependency만 연결한다.

- [ ] **Step 4: 오류 handler와 cookie security 구현**

Request validation 오류는 `fieldErrors`를 채운 422 봉투로 변환한다. `DomainError`는 code/status/message를 사용하고 일반 500은 내부 예외 문자열을 노출하지 않는다. 보호 라우트는 이후 재사용할 `ParticipantContext` dependency를 통해 OpenAPI `cookieAuth`를 선언한다.

- [ ] **Step 5: 결정적 export 구현**

```python
def render_openapi(app: FastAPI) -> bytes:
    text = json.dumps(
        app.openapi(),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"
    return text.encode("utf-8")


def export_openapi(app: FastAPI) -> None:
    content = render_openapi(app)
    for path in (BACKEND_SNAPSHOT, FRONTEND_SNAPSHOT):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
```

- [ ] **Step 6: 스냅샷 생성과 clean-diff 검증**

Run: `uv run python scripts/export_openapi.py`

Run from repository root: `git add apps/backend/openapi.json apps/frontend/openapi.json`

Run: `uv run python scripts/export_openapi.py`

Run: `git diff --exit-code -- apps/backend/openapi.json apps/frontend/openapi.json`

두 번째 생성 이후 staged snapshot과 worktree snapshot 사이에 차이가 없어야 한다. 첫 생성의 staged 변경은 의도한 snapshot diff로 커밋한다.

- [ ] **Step 7: 검증과 커밋**

Run: `uv run pytest tests/api/test_error_contract.py tests/api/test_openapi_contract.py -v`

```bash
git add apps/backend/app apps/backend/scripts apps/backend/openapi.json apps/frontend/openapi.json apps/backend/tests/api
git commit -m "feat(api): freeze Backend v1.1 OpenAPI contract"
```

---

### Task 4: B3 MongoDB, 토큰, 익명 세션 생성과 복구

**Files:**
- Create: `apps/backend/app/core/security.py`
- Create: `apps/backend/app/db/mongo.py`
- Create: `apps/backend/app/db/indexes.py`
- Create: `apps/backend/app/models/session.py`
- Modify: `apps/backend/app/schemas/sessions.py`
- Create: `apps/backend/app/repositories/session_repository.py`
- Create: `apps/backend/app/services/session_service.py`
- Create: `apps/backend/app/api/dependencies.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Modify: `apps/backend/app/api/v1/router.py`
- Create: `apps/backend/tests/fakes/session_repository.py`
- Create: `apps/backend/tests/fakes/session_factory.py`
- Create: `apps/backend/tests/integration/test_session_create.py`
- Create: `apps/backend/tests/security/test_participant_capability.py`

**Interfaces:**
- Produces: `digest_secret(secret, pepper) -> str`.
- Produces: `SessionService.create_session(idempotency_key, cookie, now) -> CreatedSession`.
- Produces: API DTO `SessionCreatedResponse`.
- Produces: `POST /api/v1/sessions`, `GET /api/v1/me/session`.
- Produces: indexes for `id`, `code`, `participants.tokenHash`, `creatorIdempotencyKeyHash`, `expiresAt`.

- [ ] **Step 1: 세션 생성·보안 실패 테스트 작성**

```python
def test_create_session_is_anonymous_and_uses_mrs_code(client: TestClient) -> None:
    response = client.post(
        "/api/v1/sessions",
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201
    assert set(response.json()) == {
        "sessionId", "code", "questionSetVersion", "expiresAt"
    }
    assert re.fullmatch(r"MRS-[A-HJ-NP-Z2-9]{6}", response.json()["code"])
    assert "HttpOnly" in response.headers["set-cookie"]


def test_idempotency_key_cannot_rotate_creator_capability(
    client: TestClient,
    other_client: TestClient,
) -> None:
    key = str(uuid4())
    created = client.post("/api/v1/sessions", headers={"Idempotency-Key": key})
    stolen = other_client.post("/api/v1/sessions", headers={"Idempotency-Key": key})
    assert created.status_code == 201
    assert stolen.status_code == 409
    assert client.get("/api/v1/me/session").status_code == 200
```

DB 문서에 평문 token이 없는지, 배열 길이가 질문 수인지, UTC 7일 만료인지, nickname/mode body가 거절되는지 테스트한다.

- [ ] **Step 2: 실패 확인**

Run: `uv run pytest tests/integration/test_session_create.py tests/security/test_participant_capability.py -v`

Expected: 새 session service와 API가 없어 실패한다.

- [ ] **Step 3: security와 문서 모델 구현**

```python
INVITATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def digest_secret(secret: str, pepper: str) -> str:
    return hmac.new(
        pepper.encode("utf-8"),
        secret.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_invitation_suffix() -> str:
    return "".join(secrets.choice(INVITATION_ALPHABET) for _ in range(6))
```

세션 document는 `id`, suffix `code`, `mode=light`, `questionSetVersion`, `questionCount`, `status=collecting`, UTC 시각, creator key HMAC, A participant의 중첩 input, `cachedResult=None`을 가진다.

- [ ] **Step 4: 저장소 create와 unique 충돌 처리 구현**

repository는 후보 document를 insert하고 `DuplicateKeyError`를 분류한다. creator key 충돌이면 기존 문서를 반환하고 service가 현재 A cookie digest를 검증한다. code 충돌이면 최대 5회 새 suffix를 생성해 insert한다. 5회 실패는 503 `SESSION_CREATE_UNAVAILABLE`로 변환한다.

- [ ] **Step 5: create/recovery 서비스와 쿠키 dependency 구현**

```python
@router.post("/api/v1/sessions", response_model=SessionCreatedResponse, status_code=201)
async def create_session(
    response: Response,
    idempotency_key: UUID = Header(alias="Idempotency-Key"),
    participant_cookie: str | None = Cookie(default=None, alias="mrs_participant"),
    service: SessionService = Depends(get_session_service),
) -> SessionCreatedResponse:
    created = await service.create_session(
        idempotency_key=str(idempotency_key),
        participant_cookie=participant_cookie,
        now=utc_now(),
    )
    set_participant_cookie(response, created.cookie_value, service.settings)
    return created.response
```

`GET /me/session`은 cookie의 session ID와 token HMAC가 같은 participant를 찾고 만료 전일 때만 active session DTO를 반환한다.

API 테스트에서 반복 사용할 `SessionFactory`와 `SessionPair`를 `tests/fakes/session_factory.py`에 정의한다.

```python
@dataclass
class CreatedSessionFixture:
    creator: TestClient
    session_id: str
    code: str


@dataclass
class SessionPair:
    creator: TestClient
    partner: TestClient
    session_id: str
    code: str

    @property
    def input_url(self) -> str:
        return f"/api/v1/sessions/{self.session_id}/me/input"

    @property
    def submit_url(self) -> str:
        return f"/api/v1/sessions/{self.session_id}/me/submit"

    @property
    def status_url(self) -> str:
        return f"/api/v1/sessions/{self.session_id}/status"

    @property
    def nudge_url(self) -> str:
        return f"/api/v1/sessions/{self.session_id}/nudge"

    @property
    def result_url(self) -> str:
        return f"/api/v1/sessions/{self.session_id}/result"
```

`SessionFactory.create()`는 creator client로 세션을 만들고, `join()`은 별도 partner client로 B를 추가하며, `create_pair()`는 둘을 조합한다. `save_complete(client, session_id, answers, guesses)`와 `submit(client, session_id)`는 B4–B6 테스트에서 같은 완성 입력 절차를 사용한다.

- [ ] **Step 6: 검증과 커밋**

Run: `uv run pytest tests/integration/test_session_create.py tests/security/test_participant_capability.py -v`

Run: `uv run ruff check app tests/integration/test_session_create.py tests/security`

Run: `uv run mypy app`

```bash
git add apps/backend/app apps/backend/tests/fakes apps/backend/tests/integration/test_session_create.py apps/backend/tests/security
git commit -m "feat(api): create secure anonymous light sessions"
```

---

### Task 5: B4 자신의 입력 자동 저장과 원자적 제출

**Files:**
- Modify: `apps/backend/app/schemas/sessions.py`
- Modify: `apps/backend/app/repositories/session_repository.py`
- Modify: `apps/backend/app/services/session_service.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/integration/test_light_input.py`
- Create: `apps/backend/tests/integration/test_submit.py`

**Interfaces:**
- Produces: `GET/PATCH /api/v1/sessions/{session_id}/me/input`.
- Produces: body 없는 idempotent `POST /api/v1/sessions/{session_id}/me/submit`.
- Produces: `SubmitResponse(status="submitted", completedAt)`.

- [ ] **Step 1: 입력 격리와 validation 실패 테스트 작성**

```python
def test_patch_requires_complete_parallel_arrays(pair: SessionPair) -> None:
    response = pair.creator.patch(
        f"/api/v1/sessions/{pair.session_id}/me/input",
        json={"answers": [0, 1, 2, 3, None], "guesses": [0]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "QUESTION_COUNT_MISMATCH"


def test_get_returns_only_authenticated_participant(pair: SessionPair) -> None:
    creator_values = {"answers": [0, 1, 2, 3, None], "guesses": [1, 2, 3, 0, None]}
    partner_values = {"answers": [3, 2, 1, 0, None], "guesses": [2, 1, 0, 3, None]}
    pair.creator.patch(pair.input_url, json=creator_values)
    pair.partner.patch(pair.input_url, json=partner_values)
    assert pair.creator.get(pair.input_url).json() == creator_values
```

- [ ] **Step 2: 제출 불변성 실패 테스트 작성**

```python
def test_submit_freezes_saved_input_and_returns_same_timestamp(pair: SessionPair) -> None:
    payload = {"answers": [0, 1, 2, 3, 0], "guesses": [1, 2, 3, 0, 1]}
    pair.creator.patch(pair.input_url, json=payload)
    first = pair.creator.post(pair.submit_url, headers={"Idempotency-Key": str(uuid4())})
    second = pair.creator.post(pair.submit_url, headers={"Idempotency-Key": str(uuid4())})
    assert first.json() == second.json()
    assert set(first.json()) == {"status", "completedAt"}
    assert pair.creator.patch(pair.input_url, json=payload).status_code == 409


def test_submit_rejects_nulls(pair: SessionPair) -> None:
    pair.creator.patch(
        pair.input_url,
        json={"answers": [0, 1, 2, 3, None], "guesses": [0, 1, 2, 3, 0]},
    )
    response = pair.creator.post(pair.submit_url, headers={"Idempotency-Key": str(uuid4())})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INPUT_INCOMPLETE"
```

- [ ] **Step 3: 실패 확인**

Run: `uv run pytest tests/integration/test_light_input.py tests/integration/test_submit.py -v`

Expected: input/submit 메서드가 없어 실패한다.

- [ ] **Step 4: participant-scoped PATCH 구현**

Pydantic DTO는 answers와 guesses를 모두 필수로 하고 각 항목을 `Literal[0,1,2,3] | None`으로 제한한다. repository update filter는 `id`, `expiresAt > now`, `participants.$elemMatch.tokenHash`, `completedAt=None`을 동시에 요구하고 positional `$set`으로 인증 participant의 `input`만 교체한다.

- [ ] **Step 5: body 없는 원자적 submit 구현**

submit filter는 같은 participant가 미제출이고 answers/guesses가 완성된 경우에만 `completedAt=now`를 설정한다. 실패하면 재조회해 만료, 이미 제출, 미완성, 인증 실패를 구분한다. 이미 제출은 최초 timestamp를 성공 응답으로 반환한다.

- [ ] **Step 6: PATCH/submit 경합 테스트 추가**

저장소 fake에 barrier를 두고 PATCH 조회 뒤 submit이 먼저 완료되는 순서를 재현한다. PATCH 응답은 409이고 저장된 완료 입력은 PATCH payload로 바뀌지 않아야 한다.

- [ ] **Step 7: 검증과 커밋**

Run: `uv run pytest tests/integration/test_light_input.py tests/integration/test_submit.py -v`

```bash
git add apps/backend/app apps/backend/tests/integration/test_light_input.py apps/backend/tests/integration/test_submit.py apps/backend/tests/fakes
git commit -m "feat(api): freeze private light inputs on submit"
```

---

### Task 6: B5 초대 참여, 상태, 24시간 인앱 넛지

**Files:**
- Modify: `apps/backend/app/schemas/invitations.py`
- Modify: `apps/backend/app/schemas/sessions.py`
- Modify: `apps/backend/app/repositories/session_repository.py`
- Modify: `apps/backend/app/services/session_service.py`
- Modify: `apps/backend/app/api/v1/routers/invitations.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Modify: `apps/backend/app/api/v1/router.py`
- Create: `apps/backend/tests/integration/test_invitation.py`
- Create: `apps/backend/tests/integration/test_status_and_nudge.py`

**Interfaces:**
- Produces: safe invitation preview and atomic join.
- Produces: status booleans/timestamps without input.
- Produces: sender-scoped rolling 24-hour nudge.

- [ ] **Step 1: 초대 공개 응답과 자기 참여 실패 테스트 작성**

```python
def test_invitation_unavailable_states_are_indistinguishable(
    guest: TestClient,
    session_factory: SessionFactory,
) -> None:
    invalid = guest.get("/api/v1/invitations/MRS-AAAAAA")
    expired_session = session_factory.create()
    session_factory.expire(expired_session.session_id)
    expired = guest.get(f"/api/v1/invitations/{expired_session.code}")
    full_session = session_factory.create_pair()
    full = guest.get(f"/api/v1/invitations/{full_session.code}")
    assert invalid.status_code == expired.status_code == full.status_code == 404
    assert invalid.json() == expired.json() == full.json()


def test_creator_cannot_consume_own_invitation(created_session) -> None:
    response = created_session.creator.post(
        f"/api/v1/invitations/{created_session.code}/join",
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ALREADY_PARTICIPATING"
    assert created_session.creator.get("/api/v1/me/session").json()["role"] == "A"
```

- [ ] **Step 2: 상태와 넛지 실패 테스트 작성**

```python
def test_status_never_contains_inputs(pair: SessionPair) -> None:
    response = pair.creator.get(pair.status_url)
    assert set(response.json()) == {
        "status", "meCompleted", "partnerJoined", "partnerCompleted",
        "partnerNudgedAt", "expiresAt",
    }
    assert "answers" not in response.text
    assert "guesses" not in response.text


def test_nudge_allows_exact_24_hour_boundary(pair: SessionPair, clock: FakeClock) -> None:
    first = pair.creator.post(pair.nudge_url, headers={"Idempotency-Key": str(uuid4())})
    clock.advance(hours=24)
    second = pair.creator.post(pair.nudge_url, headers={"Idempotency-Key": str(uuid4())})
    assert first.status_code == second.status_code == 200
```

- [ ] **Step 3: 실패 확인**

Run: `uv run pytest tests/integration/test_invitation.py tests/integration/test_status_and_nudge.py -v`

Expected: Backend v1.1 invitation/status/nudge 계약이 없어 실패한다.

- [ ] **Step 4: preview와 atomic join 구현**

코드는 대문자 `MRS-` 형식으로 정규화하고 DB에는 suffix만 조회한다. join의 Mongo filter는 `status=collecting`, `expiresAt > now`, `participants` 길이 1, `participants.0.role=A`를 요구하고 `$push`로 B를 한 번만 추가한다. 실패 원인은 public API에서 공통 404로 변환한다.

join key는 participant의 `joinIdempotencyKeyHash`로 저장한다. B cookie로 같은 participant임을 증명한 재요청만 기존 상태를 반환하고 token을 회전하지 않는다.

- [ ] **Step 5: status와 nudge CAS 구현**

nudge update는 sender participant의 `lastNudgedAt`이 없거나 `<= now - 24 hours`이고 partner가 존재하며 미제출인 조건을 한 query에 둔다. update 결과가 있을 때만 200을 반환한다. 실패 분류 결과는 `target_unavailable`, `rate_limited`, `expired`, `unauthorized` enum으로 제한해 미처리 값이 성공으로 빠지지 않게 한다.

- [ ] **Step 6: 검증과 커밋**

Run: `uv run pytest tests/integration/test_invitation.py tests/integration/test_status_and_nudge.py -v`

```bash
git add apps/backend/app apps/backend/tests/integration/test_invitation.py apps/backend/tests/integration/test_status_and_nudge.py apps/backend/tests/fakes
git commit -m "feat(api): join and monitor anonymous light sessions"
```

---

### Task 7: B6 순수 결과 엔진, 결과 캐시, 동시 공개 게이트

**Files:**
- Create: `apps/backend/app/engine/light_result.py`
- Modify: `apps/backend/app/schemas/results.py`
- Create: `apps/backend/app/services/result_service.py`
- Modify: `apps/backend/app/repositories/session_repository.py`
- Modify: `apps/backend/app/services/session_service.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/engine/test_light_result.py`
- Create: `apps/backend/tests/integration/test_result_gate.py`

**Interfaces:**
- Produces: `calculate_light_result(question_set, participant_a, participant_b, type_rules) -> CanonicalLightResult`.
- Produces: `WaitingResultResponse | ReadyResultResponse`.
- Produces: viewer mapper that swaps canonical A/B into my/partner fields.

- [ ] **Step 1: 순수 엔진 실패 테스트 작성**

```python
def test_mutual_hit_requires_both_predictions() -> None:
    result = calculate_light_result(
        question_set=question_set_two_public_and_three_private(),
        participant_a=participant([0, 1, 2, 3, 0], [1, 0, 2, 3, 1]),
        participant_b=participant([1, 0, 2, 3, 1], [0, 1, 2, 0, 0]),
        type_rules=type_rules(),
    )
    assert result.mutual_hit_count == 4


def test_money_questions_never_change_type_or_public_comparisons() -> None:
    first = result_with_money_answers([0, 0, 2, 0, 3])
    second = result_with_money_answers([3, 3, 2, 3, 3])
    assert first.participant_a_type == second.participant_a_type
    assert [item.question_id for item in first.public_comparisons] == [
        "spending_style", "shared_expense"
    ]
```

null은 hit가 아니고, N에 따른 `ceil(N*0.8)`/`ceil(N*0.4)` 카피, viewer swap, 금액 label 미포함을 테스트한다.

- [ ] **Step 2: 공개 게이트 실패 테스트 작성**

```python
def test_one_sided_submit_has_exact_waiting_shape(pair: SessionPair) -> None:
    pair.submit_creator_complete_input()
    response = pair.creator.get(pair.result_url)
    assert response.json() == {"status": "waiting", "partnerCompleted": False}
    assert "result" not in response.text


def test_both_submit_unlocks_same_shared_score(pair: SessionPair) -> None:
    pair.submit_both_complete_inputs()
    creator = pair.creator.get(pair.result_url).json()
    partner = pair.partner.get(pair.result_url).json()
    assert creator["status"] == partner["status"] == "ready"
    assert creator["result"]["mutualHitCount"] == partner["result"]["mutualHitCount"]
```

- [ ] **Step 3: 실패 확인**

Run: `uv run pytest tests/engine/test_light_result.py tests/integration/test_result_gate.py -v`

Expected: 새 결과 엔진과 ready response가 없어 실패한다.

- [ ] **Step 4: 순수 엔진과 DTO 구현**

엔진은 질문 ID로 `spending_style`, `shared_expense` index를 찾고 각 participant의 해당 답만 분류에 사용한다. `mutualHitCount`는 전체 N에 대해 두 guess가 모두 상대 answer와 같은 질문 수다. public comparison DTO에는 두 공개 질문만 포함한다.

```python
ResultResponse = Annotated[
    WaitingResultResponse | ReadyResultResponse,
    Field(discriminator="status"),
]


class WaitingResultResponse(BaseModel):
    status: Literal["waiting"] = "waiting"
    partnerCompleted: Literal[False] = False
```

- [ ] **Step 5: 단일 cache winner 구현**

`ResultService.get_result()`는 양측 완료 전 즉시 waiting을 반환한다. 양측 완료와 `cachedResult=None`을 관찰하면 canonical 결과를 계산하고 repository의 `cache_result_if_absent(session_id, result)`를 호출한다. update filter는 `status=collecting`, 양 participant completed, `cachedResult=None`을 요구하며 성공한 요청만 status를 ready로 바꾼다. 패자는 저장된 cache를 재조회한다.

- [ ] **Step 6: viewer mapping과 privacy assertion 구현**

A 요청은 canonical A를 my, B를 partner로, B 요청은 반대로 변환한다. 직렬화된 ready response 전체에서 `monthly_income`, `monthly_savings_amount`, `debt_load`, `rep`, `만원` 금액 label이 존재하지 않는 테스트를 추가한다.

- [ ] **Step 7: 검증과 커밋**

Run: `uv run pytest tests/engine/test_light_result.py tests/integration/test_result_gate.py -v`

```bash
git add apps/backend/app apps/backend/tests/engine apps/backend/tests/integration/test_result_gate.py
git commit -m "feat(api): unlock cached light results after both submit"
```

---

### Task 8: 실제 MongoDB 경합, 레거시 제거, 전체 계약 검증

**Files:**
- Create: `apps/backend/tests/integration/test_mongo_indexes.py`
- Create: `apps/backend/tests/integration/test_mongo_concurrency.py`
- Modify: `apps/backend/tests/conftest.py`
- Delete: `apps/backend/schemas.py`
- Delete: `apps/backend/services/session_repository.py`
- Delete: `apps/backend/test_korean_support.py`
- Delete: `apps/backend/requirements.txt`
- Replace: 기존 `apps/backend/tests/integration/test_*.py`를 Backend v1.1 fixture 기준 테스트로 유지
- Modify: `apps/backend/openapi.json`
- Modify: `apps/frontend/openapi.json`

**Interfaces:**
- Consumes: Task 1–7의 전체 Backend v1.1.
- Produces: 실제 MongoDB 인덱스·경합 검증과 최종 B1–B6 OpenAPI.

- [ ] **Step 1: MongoDB testcontainer fixture 작성**

session-scoped container에서 MongoDB 8을 시작하고 function-scoped database 이름을 생성한다. 각 테스트 뒤 해당 database를 drop한다. Docker가 없으면 테스트를 성공으로 skip하지 말고 명시적 환경 오류로 실패시켜 Gate 미통과가 보이게 한다.

```python
@pytest_asyncio.fixture
async def mongo_database(mongo_container: MongoDbContainer):
    client = AsyncMongoClient(mongo_container.get_connection_url())
    database_name = f"mirisallim_test_{uuid4().hex}"
    database = client[database_name]
    try:
        yield database
    finally:
        await client.drop_database(database_name)
        await client.close()
```

- [ ] **Step 2: 정확한 인덱스 테스트 작성**

`id`, `code`, `creatorIdempotencyKeyHash` unique 속성과 `expiresAt.expireAfterSeconds == 0`, participant token index를 이름까지 검증한다.

- [ ] **Step 3: 실제 동시성 테스트 작성**

`asyncio.gather()`로 다음을 실제 collection에 동시에 실행한다.

1. 같은 creator key 생성 두 건: document 한 건, token 탈취 없음.
2. 같은 invitation join 두 건: B 한 명만 추가.
3. PATCH와 submit: submit 뒤 입력 불변.
4. 양측 submit/result 조회: cachedResult 한 개.
5. 같은 sender nudge 두 건: 성공 한 건, 429 한 건.

- [ ] **Step 4: 레거시 surface 제거**

새 `app` 계층에서 참조가 없는 기존 `schemas.py`, `services/session_repository.py`, `test_korean_support.py`를 삭제한다. 다음 경로가 최종 OpenAPI에 없음을 테스트한다.

```python
for removed_path in (
    "/api/v1/deep/questions",
    "/api/v1/config/{config_type}",
    "/api/v1/calculate/light",
    "/api/v1/validate/input",
):
    assert removed_path not in app.openapi()["paths"]
```

계산 참고용 legacy config와 `services/calculator.py`, `services/validator.py`는 다른 사용자 작업 가능성이 있으므로 삭제하지 않고 Backend v1.1 앱에서 import하지 않는다.

- [ ] **Step 5: OpenAPI 최종 생성**

Run: `uv run python scripts/export_openapi.py`

Run: `uv run python scripts/export_openapi.py`

Run from repository root: `git diff --exit-code -- apps/backend/openapi.json apps/frontend/openapi.json`

Run: `git diff --check`

Task 3에서 고정한 DTO와 operation이 구현 단계에서 변하지 않았으므로 snapshot Git diff가 없어야 한다. 백엔드와 프론트 snapshot SHA256도 같아야 한다.

- [ ] **Step 6: 전체 검증**

Run: `uv run --python 3.11 pytest -v`

Run: `uv run ruff check app tests scripts`

Run: `uv run mypy app`

Run: `uv lock --check`

Run: `git diff --check`

- [ ] **Step 7: 최종 로컬 커밋**

```bash
git add apps/backend apps/frontend/openapi.json
git commit -m "test(api): verify Backend v1.1 B1-B6 contract"
```

원격에는 push하지 않는다. 실제 Railway, Atlas, Vercel 설정은 B7–B8과 사용자 승인 뒤 수행한다.

---

## Frontend Contract Note: 질문 카드의 데이터 사용

Backend B2가 질문 카드에 제공하는 데이터 흐름은 다음과 같다.

```text
light_questions.json
  ├─ public: id/order/category/text/subText/type/option index·label·description
  └─ server-only: option value/rep
             ↓
GET /api/v1/light/questions?version=light-v1
             ↓
LightQuestionCard
  ├─ Green: 내 답 → answers[order - 1]
  └─ Purple: 상대 예측 → guesses[order - 1]
             ↓
PATCH /api/v1/sessions/{id}/me/input
```

프론트는 질문 수, 금액 대표값, 유형 규칙을 하드코딩하지 않는다. Backend v1.1 OpenAPI가 확정된 뒤 프론트 F2/F4 계획의 nickname body와 `baseUrl: /api/v1` 문구를 새 계약에 맞춰 별도 변경해야 한다.
