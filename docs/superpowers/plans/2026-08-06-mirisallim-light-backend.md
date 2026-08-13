# 미리살림 3분 모드 백엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 익명 2인 세션, 입력 저장, 동시공개, 결과 계산, 7일 만료와 속도 제한을 서버에서 강제하는 독립 FastAPI 서비스를 구축하고 Railway·MongoDB Atlas에 배포한다.

**Architecture:** FastAPI 라우터는 HTTP 변환만 담당하고 서비스가 도메인 규칙, 저장소가 PyMongo Async 쿼리, 엔진이 외부 의존 없는 계산을 담당한다. 질문과 유형 규칙은 버전형 JSON 설정이며 OpenAPI가 프론트엔드와의 유일한 계약이다.

**Tech Stack:** Python 3.11, FastAPI, Pydantic 2, PyMongo Async API 4.13+, MongoDB 8, pytest, pytest-asyncio, HTTPX, testcontainers, Ruff, mypy, Docker, Railway, MongoDB Atlas.

## Global Constraints

- 양측 제출 전 결과 응답은 `status`와 `partnerCompleted`만 반환한다.
- 자신의 입력 조회 외에는 상대 입력을 미리 직렬화하거나 계산하지 않는다.
- 질문 수는 `questionSetVersion`의 `questions.length`에서 파생한다.
- 참여자 토큰은 256비트 무작위 값이고 DB에는 HMAC-SHA-256 다이제스트만 저장한다.
- `expiresAt`이 지나면 TTL 삭제 전에도 모든 세션 API가 410을 반환한다.
- 요청 본문, 쿠키, 답변, 결과를 로그에 남기지 않는다.
- 모든 세션·입력·결과 응답은 `Cache-Control: no-store`다.
- 첫 배포에는 회원가입, OAuth, LLM, 정책금융, Redis, WebSocket이 없다.

---

## 백엔드 파일 지도

~~~text
apps/backend/
├─ pyproject.toml
├─ Dockerfile
├─ railway.toml
├─ config/
│  ├─ light_questions.json
│  └─ light_types.json
├─ scripts/export_openapi.py
├─ app/
│  ├─ api/v1/routers/
│  ├─ core/
│  ├─ db/
│  ├─ engine/
│  ├─ models/
│  ├─ repositories/
│  ├─ schemas/
│  ├─ services/
│  └─ main.py
└─ tests/
   ├─ api/
   ├─ core/
   ├─ engine/
   ├─ integration/
   └─ security/
~~~

---

### B1: FastAPI 실행 기반과 테스트 환경

**Files:**
- Create: `apps/backend/pyproject.toml`
- Create: `apps/backend/app/__init__.py`
- Create: `apps/backend/app/main.py`
- Create: `apps/backend/app/core/settings.py`
- Create: `apps/backend/tests/conftest.py`
- Create: `apps/backend/tests/api/test_health.py`
- Create: `compose.yaml`
- Create: `.env.example`

**Interfaces:**
- Produces: `GET /health -> {"status":"ok"}`.
- Produces: `Settings` with `mongodb_uri`, `mongodb_database`, `participant_token_pepper`, `allowed_origins`, `session_ttl_days=7`.

- [ ] **Step 1: Create Python packaging and test configuration**

Require Python `>=3.11,<3.12`. Add runtime dependencies `fastapi`, `uvicorn[standard]`, `pydantic-settings`, `pymongo>=4.13` and dev dependencies `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `mypy`, `testcontainers[mongodb]`.

- [ ] **Step 2: Write the failing health test**

~~~python
from fastapi.testclient import TestClient
from app.main import app

def test_health() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
~~~

- [ ] **Step 3: Run the test**

Run in `apps/backend`: `python -m pytest tests/api/test_health.py -v`.

Expected: FAIL because `app.main` or `/health` is absent.

- [ ] **Step 4: Implement settings and health**

~~~python
app = FastAPI(title="미리살림 API", version="1.0.0")

@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
~~~

Settings must reject an empty token pepper outside tests and parse comma-separated allowed origins.

- [ ] **Step 5: Verify**

Run `python -m ruff check .`, `python -m mypy app`, and `python -m pytest tests/api/test_health.py -v`.

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

~~~bash
git add apps/backend compose.yaml .env.example
git commit -m "chore(api): scaffold FastAPI service"
~~~

---

### B2: 버전형 질문·유형 설정과 OpenAPI

**Files:**
- Create: `apps/backend/config/light_questions.json`
- Create: `apps/backend/config/light_types.json`
- Create: `apps/backend/app/core/question_catalog.py`
- Create: `apps/backend/app/schemas/questions.py`
- Create: `apps/backend/app/api/v1/router.py`
- Create: `apps/backend/app/api/v1/routers/questions.py`
- Create: `apps/backend/tests/core/test_question_catalog.py`
- Create: `apps/backend/tests/api/test_questions.py`
- Create: `apps/backend/scripts/export_openapi.py`

**Interfaces:**
- Produces: `QuestionCatalog.get(version: str | None) -> QuestionSet`.
- Produces: `GET /api/v1/light/questions?version=light-v1 -> QuestionSet`.
- Produces: `apps/frontend/openapi.json`.

- [ ] **Step 1: Write failing catalog tests**

~~~python
def test_light_v1_has_stable_ids(catalog: QuestionCatalog) -> None:
    result = catalog.get("light-v1")
    assert [item.id for item in result.questions] == [
        "monthly_income",
        "saving_ratio",
        "spending_style",
        "debt_load",
        "shared_expense",
    ]
    assert all(len(item.options) == 4 for item in result.questions)
~~~

Also assert duplicate IDs, empty options, missing current version, and unknown requested versions fail with explicit domain errors.

- [ ] **Step 2: Run the tests**

Run `python -m pytest tests/core/test_question_catalog.py tests/api/test_questions.py -v`.

Expected: FAIL because catalog and route are absent.

- [ ] **Step 3: Implement exact v1 configuration**

Copy the approved five Korean topics, questions, descriptions, and options into `light_questions.json`. Store stable IDs and version `light-v1`. Store the four neutral type combinations, question-ID rules, taglines, and auxiliary shared-expense tags in `light_types.json`.

- [ ] **Step 4: Implement catalog and route**

~~~python
@router.get("/light/questions", response_model=QuestionSet)
async def get_questions(version: str | None = None) -> QuestionSet:
    return question_catalog.get(version)
~~~

Unknown versions return the common error envelope with code `QUESTION_SET_NOT_FOUND` and HTTP 404.

- [ ] **Step 5: Export deterministic OpenAPI**

`export_openapi.py` creates the target parent directory when absent, then serializes `app.openapi()` with sorted keys and a trailing newline to `apps/frontend/openapi.json`. Run it twice and verify `git diff --exit-code apps/frontend/openapi.json` after the second run.

- [ ] **Step 6: Verify and commit**

Run Ruff, mypy, focused tests, and OpenAPI export.

~~~bash
git add apps/backend apps/frontend/openapi.json
git commit -m "feat(api): publish versioned light question contract"
~~~

---

### B3: MongoDB, 참여자 토큰, 세션 생성

**Files:**
- Create: `apps/backend/app/core/security.py`
- Create: `apps/backend/app/db/mongo.py`
- Create: `apps/backend/app/db/indexes.py`
- Create: `apps/backend/app/models/session.py`
- Create: `apps/backend/app/schemas/session.py`
- Create: `apps/backend/app/repositories/session_repository.py`
- Create: `apps/backend/app/services/session_service.py`
- Create: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/integration/test_session_create.py`

**Interfaces:**
- Produces: `digest_participant_token(token: str, pepper: str) -> str`.
- Produces: `SessionService.create(question_set_version, idempotency_key, now) -> SessionCreated`.
- Produces: `POST /api/v1/sessions` and `GET /api/v1/me/session`.

- [ ] **Step 1: Write failing session tests**

~~~python
async def test_create_session_stores_only_token_digest(client, sessions) -> None:
    response = await client.post("/api/v1/sessions", headers={"Idempotency-Key": "create-a"})
    assert response.status_code == 201
    assert "HttpOnly" in response.headers["set-cookie"]
    document = await sessions.find_one({"id": response.json()["sessionId"]})
    assert document["participants"][0]["tokenHash"]
    assert "token" not in document["participants"][0]
~~~

Add tests for invite format, unique code retry, seven-day expiry, idempotent creation, active-session recovery, and exact indexes.

- [ ] **Step 2: Run the tests**

Start MongoDB with `docker compose up -d mongo` and run `python -m pytest tests/integration/test_session_create.py -v`.

Expected: FAIL because Mongo and session layers are absent.

- [ ] **Step 3: Implement token and index primitives**

~~~python
def digest_participant_token(token: str, pepper: str) -> str:
    return hmac.new(pepper.encode(), token.encode(), hashlib.sha256).hexdigest()
~~~

Create unique indexes on `id` and `code`, an index on `participants.tokenHash`, and an `expiresAt` TTL index with `expireAfterSeconds=0`.

- [ ] **Step 4: Implement session creation**

Generate tokens with `secrets.token_urlsafe(32)` and invite values from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Persist `questionSetVersion`, null arrays sized to the question set, `createdAt`, and `expiresAt`. Set `mrs_participant` with `HttpOnly`, `Secure` in production, `SameSite=Lax`, and path `/`.

- [ ] **Step 5: Verify**

Run `python -m pytest tests/integration/test_session_create.py -v` plus Ruff and mypy.

Expected: all tests pass and no stored document contains a plaintext token.

- [ ] **Step 6: Commit**

~~~bash
git add apps/backend
git commit -m "feat(api): create secure anonymous sessions"
~~~

---

### B4: 자신의 입력 저장과 제출 불변성

**Files:**
- Create: `apps/backend/app/schemas/light_input.py`
- Modify: `apps/backend/app/repositories/session_repository.py`
- Modify: `apps/backend/app/services/session_service.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/integration/test_light_input.py`
- Create: `apps/backend/tests/integration/test_submit.py`

**Interfaces:**
- Produces: `GET /api/v1/sessions/{id}/me/input`.
- Produces: `PATCH /api/v1/sessions/{id}/me/input`.
- Produces: idempotent `POST /api/v1/sessions/{id}/me/submit`.

- [ ] **Step 1: Write failing privacy and validation tests**

~~~python
async def test_wrong_question_count_is_rejected(client_a, session_id) -> None:
    response = await client_a.patch(
        f"/api/v1/sessions/{session_id}/me/input",
        json={"answers": [0], "guesses": [0]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "QUESTION_COUNT_MISMATCH"
~~~

Assert GET returns only the authenticated participant, nulls are accepted, values outside `0..3` fail, and an invalid token cannot distinguish session existence.

- [ ] **Step 2: Write failing submit tests**

Submit twice with different idempotency keys and assert the same `completedAt`. Then PATCH and assert HTTP 409 with `SESSION_ALREADY_SUBMITTED`.

- [ ] **Step 3: Run the tests**

Run `python -m pytest tests/integration/test_light_input.py tests/integration/test_submit.py -v`.

Expected: FAIL because input and submit methods are absent.

- [ ] **Step 4: Implement participant-scoped projections**

Every repository update matches session ID, token digest, `expiresAt > now`, and null participant `completedAt`. Use array filters or a positional match to update only the authenticated participant. GET must project only that participant.

- [ ] **Step 5: Implement atomic idempotent submit**

The first submit sets `completedAt`. Repeated submit always returns the stored timestamp and does not calculate result data. Input mutation after submission remains 409.

- [ ] **Step 6: Verify and commit**

Run focused tests, Ruff, and mypy.

~~~bash
git add apps/backend
git commit -m "feat(api): save and submit private light input"
~~~

---

### B5: 초대 참여, 상태 조회, 인앱 알림

**Files:**
- Create: `apps/backend/app/schemas/invitation.py`
- Create: `apps/backend/app/schemas/status.py`
- Create: `apps/backend/app/services/nudge_service.py`
- Create: `apps/backend/app/api/v1/routers/invitations.py`
- Modify: `apps/backend/app/repositories/session_repository.py`
- Modify: `apps/backend/app/services/session_service.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/integration/test_invitation.py`
- Create: `apps/backend/tests/integration/test_status_and_nudge.py`

**Interfaces:**
- Produces: safe `GET /api/v1/invitations/{code}`.
- Produces: atomic `POST /api/v1/invitations/{code}/join`.
- Produces: `GET /api/v1/sessions/{id}/status`.
- Produces: `POST /api/v1/sessions/{id}/nudge`.

- [ ] **Step 1: Write failing invitation tests**

Assert preview returns only mode, duration, and expiry. Race two joins and require exactly one successful B append. Invalid, expired, and full codes use indistinguishable public messages.

- [ ] **Step 2: Write failing status and nudge tests**

Assert status contains booleans/timestamps only. Nudge before B joins returns `NUDGE_TARGET_UNAVAILABLE`. The first nudge succeeds, the second within 24 hours returns 429, and B can observe a neutral timestamp.

- [ ] **Step 3: Run the tests**

Run `python -m pytest tests/integration/test_invitation.py tests/integration/test_status_and_nudge.py -v`.

Expected: FAIL because invitation, status, and nudge routes are absent.

- [ ] **Step 4: Implement atomic B join**

Use one conditional update requiring an unexpired collecting session with one participant. Append B with a fresh token digest and arrays sized to `questionSetVersion`, then set the active cookie.

- [ ] **Step 5: Implement status and rolling nudge limit**

Status exposes `meCompleted`, `partnerJoined`, `partnerCompleted`, `partnerNudgedAt`, `expiresAt` and no input. Nudge uses a conditional timestamp update requiring the previous value to be absent or at least 24 hours old.

- [ ] **Step 6: Verify and commit**

Run focused integration tests plus Ruff and mypy.

~~~bash
git add apps/backend
git commit -m "feat(api): join sessions and report waiting status"
~~~

---

### B6: 결과 엔진과 동시공개 게이트

**Files:**
- Create: `apps/backend/app/engine/light_result.py`
- Create: `apps/backend/app/schemas/result.py`
- Create: `apps/backend/app/services/result_service.py`
- Modify: `apps/backend/app/repositories/session_repository.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/engine/test_light_result.py`
- Create: `apps/backend/tests/integration/test_result_gate.py`

**Interfaces:**
- Produces: `calculate_light_result(question_set, participant_a, participant_b, type_rules) -> LightResult`.
- Produces: `WaitingResultResponse | ReadyResultResponse` from `GET /api/v1/sessions/{id}/result`.

- [ ] **Step 1: Write failing engine tests**

~~~python
def test_mutual_hit_requires_both_guesses() -> None:
    result = calculate_light_result(
        question_set_two(),
        participant([0, 1], [1, 0]),
        participant([1, 0], [0, 3]),
        rules(),
    )
    assert result.mutual_hit_count == 1
~~~

Test nulls, dynamic `N`, `ceil(N*0.8)` and `ceil(N*0.4)` copy thresholds, stable question-ID type rules, and exclusion of income/debt from type identity.

- [ ] **Step 2: Run engine tests**

Run `python -m pytest tests/engine/test_light_result.py -v`.

Expected: FAIL because the engine is absent.

- [ ] **Step 3: Implement the dependency-free engine**

The engine imports no FastAPI, PyMongo, or settings. It returns per-question equality, both personal prediction flags, mutual hits, neutral conversation topics, two types, taglines, `questionCount`, and `mutualHitCount`.

- [ ] **Step 4: Write failing gate tests**

~~~python
assert set(waiting_response.json()) == {"status", "partnerCompleted"}
assert "result" not in waiting_response.text
~~~

Cover zero, one, and two submitted participants. Submit A and B concurrently and require a single cached result document.

- [ ] **Step 5: Implement conditional ready transition**

Only when both `completedAt` fields are non-null may one compare-and-set update change `status` to `ready` and write `cachedResult`. Result GET recovers a missing cache with the same conditional operation.

- [ ] **Step 6: Verify and commit**

Run engine and gate tests, full pytest, Ruff, and mypy.

~~~bash
git add apps/backend
git commit -m "feat(api): unlock results after both submissions"
~~~

---

### B7: 만료·오류·보안 헤더·초대 속도 제한

**Files:**
- Create: `apps/backend/app/core/errors.py`
- Create: `apps/backend/app/core/middleware.py`
- Create: `apps/backend/app/models/rate_limit.py`
- Create: `apps/backend/app/repositories/rate_limit_repository.py`
- Modify: `apps/backend/app/main.py`
- Modify: `apps/backend/app/api/v1/routers/invitations.py`
- Create: `apps/backend/tests/security/test_privacy_guards.py`
- Create: `apps/backend/tests/security/test_expiry.py`
- Create: `apps/backend/tests/security/test_invite_rate_limit.py`

**Interfaces:**
- Produces: `ApiError = {error: {code, message, fieldErrors}}`.
- Produces: immediate `SESSION_EXPIRED` 410.
- Produces: invite attempt limit keyed by HMAC of IP and normalized code.

- [ ] **Step 1: Write failing security tests**

Assert expired documents still in Mongo return 410, invalid origins fail mutations, sensitive responses have `no-store`, captured logs omit submitted values and tokens, and invite errors reveal no existence distinction.

- [ ] **Step 2: Write rate-limit tests**

Use a fixed clock. Permit the configured number of attempts, return 429 afterward, then permit again after the rate-limit document's expiry.

- [ ] **Step 3: Run security tests**

Run `python -m pytest tests/security -v`.

Expected: expiry, header, origin, or rate-limit tests fail.

- [ ] **Step 4: Implement errors and middleware**

Map domain errors to 401/404/409/410/422/429/503. Add request IDs, redact headers/body fields, enforce allowed origins for mutation methods, and attach `Cache-Control: no-store` to session-related responses.

- [ ] **Step 5: Implement Mongo rate limits**

Store only an HMAC key, count, window start, and `expiresAt` in `rate_limits`. Create a TTL index and update counters atomically. Never store raw IPs or invite codes in this collection.

- [ ] **Step 6: Verify and commit**

Run `python -m ruff check .`, `python -m mypy app`, and `python -m pytest -v`.

~~~bash
git add apps/backend
git commit -m "feat(api): enforce expiry and privacy controls"
~~~

---

### B8: 백엔드 CI, Docker, Atlas, Railway

**Files:**
- Create: `apps/backend/Dockerfile`
- Create: `apps/backend/railway.toml`
- Create: `.github/workflows/backend.yml`
- Create: `docs/operations/backend-deployment.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: GitHub check `backend`.
- Produces: Railway service `api` and production `/health`.
- Produces: Atlas database `mirisallim` with required indexes.

- [ ] **Step 1: Create backend CI**

Use Python 3.11 and a MongoDB service container. Run Ruff, mypy, full pytest, and deterministic OpenAPI export with a clean-diff assertion.

- [ ] **Step 2: Create and test the Docker image**

Use a non-root user and start `uvicorn app.main:app --host 0.0.0.0 --port 8000`. Build `mirisallim-api`, start named container `mirisallim-api-smoke` detached, verify `/health`, then stop only that container.

- [ ] **Step 3: Create Atlas resources**

Create Atlas project and database `mirisallim`, a least-privilege app user, and the Railway-compatible network rule. Run the idempotent index initializer and verify unique `id`/`code` plus TTL `expiresAt` indexes on sessions and rate limits.

- [ ] **Step 4: Deploy Railway**

Create project `mirisallim` and service `api` rooted at `apps/backend`. Set actual `MONGODB_URI`, `MONGODB_DATABASE=mirisallim`, generated 32-byte `PARTICIPANT_TOKEN_PEPPER`, `SESSION_TTL_DAYS=7`, and exact frontend `ALLOWED_ORIGINS`.

- [ ] **Step 5: Run production API smoke tests**

Verify `/health`, question retrieval, session creation cookie attributes, an expired test fixture returning 410, and waiting result response keys. Do not print secrets or cookies.

- [ ] **Step 6: Document and commit**

Document index inspection, token-pepper rotation impact, Atlas credential rotation, Railway rollback, health checks, and redacted incident logging.

~~~bash
git add apps/backend .github/workflows/backend.yml .env.example docs/operations/backend-deployment.md
git commit -m "ci(api): deploy backend to Railway"
~~~

---

## 백엔드 최종 검증

~~~text
python -m ruff check .
python -m mypy app
python -m pytest -v
python scripts/export_openapi.py
git diff --exit-code ../../apps/frontend/openapi.json
docker build -t mirisallim-api .
~~~

작업 디렉터리는 `apps/backend`다. 모든 명령이 0으로 종료되고 Railway `/health`가 200이며 Atlas 인덱스가 확인되기 전에는 백엔드 트랙을 완료로 표시하지 않는다.
