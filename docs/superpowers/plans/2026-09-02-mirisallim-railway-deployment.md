# 미리살림 Railway 백엔드 배포 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `fix/gate1-openapi-contract` 기반 FastAPI 백엔드를 Railway의 상시 실행 Docker 서비스로 안전하게 배포할 수 있는 코드, 자동 검증, 운영 절차를 완성한다.

**Architecture:** 브라우저는 Vercel의 same-origin `/api` rewrite를 통해 Railway FastAPI에 접근하고, FastAPI는 MongoDB Atlas M0에 세션을 저장한다. Railway 계정이 없는 상태에서 저장소 준비를 먼저 완료한 뒤, 사용자가 GitHub로 Railway 가입과 권한 승인을 수행하는 시점에 대시보드 설정 및 실제 배포를 이어간다.

**Tech Stack:** Python 3.11, FastAPI, Uvicorn, PyMongo AsyncMongoClient, Docker, GitHub Actions, Railway, MongoDB Atlas, Vercel

**Spec:** `docs/superpowers/specs/2026-09-02-mirisallim-railway-deployment-design.md`

## Global Constraints

- 기준 커밋은 `fix/gate1-openapi-contract`의 `43ca562`, 작업 브랜치는 `codex/deploy-railway`다.
- Railway 서비스는 `apps/backend`를 root directory로 사용하고 `apps/backend/Dockerfile`로 빌드한다.
- 컨테이너는 Railway가 주입한 `PORT`에서 Uvicorn을 실행하며 로컬 기본값은 `8000`이다.
- Railway Serverless는 OFF, replica는 1, healthcheck path는 `/health`다.
- production CORS에는 `ALLOWED_ORIGINS`로 받은 HTTPS Vercel Origin만 허용한다.
- 쿠키는 `HttpOnly`, production `Secure`, `SameSite=Lax`, `Path=/` 정책을 유지한다.
- production에서 MongoDB 연결 실패 시 인메모리 저장소로 폴백하지 않는다.
- 실제 MongoDB URI, DB 비밀번호, participant pepper, Railway/Vercel 배포 URL을 저장소에 커밋하지 않는다.
- 프론트엔드 파일과 OpenAPI 응답 계약을 변경하지 않는다.
- deprecated된 `railway.json`과 `railway.toml`은 생성하지 않는다.
- Railway 유료 플랜 전환이나 결제수단 등록은 사용자의 별도 승인 없이는 수행하지 않는다.

---

### Task 1: Production 설정을 fail-closed로 만들기

**Files:**
- Modify: `apps/backend/main.py:1-115`
- Modify: `apps/backend/.env.example`
- Create: `apps/backend/tests/test_production_settings.py`

**Interfaces:**
- Consumes: 프로세스 환경변수 `ENVIRONMENT`, `MONGODB_URI`, `MONGODB_DATABASE` 또는 `MONGODB_DB_NAME`, `PARTICIPANT_TOKEN_PEPPER`, `SESSION_TTL_DAYS`, `ALLOWED_ORIGINS` 또는 `CORS_ORIGINS`.
- Produces: `_validate_production_settings(environment: str, mongodb_uri: str | None, pepper: str, ttl_days_raw: str, origins: list[str]) -> int`와 `_cors_origins(environment: str, configured_origins: list[str]) -> list[str]`.

- [ ] **Step 1: production 설정 실패 테스트 작성**

`apps/backend/tests/test_production_settings.py`에 다음 행위를 검증한다.

```python
import pytest

import main


VALID_ORIGINS = ["https://mirisalim.vercel.app"]
VALID_PEPPER = "p" * 32


@pytest.mark.parametrize(
    ("mongodb_uri", "pepper", "ttl_days", "origins", "expected_name"),
    [
        (None, VALID_PEPPER, "7", VALID_ORIGINS, "MONGODB_URI"),
        ("mongodb+srv://example", "mirisalim_dev_pepper_secret_2026", "7", VALID_ORIGINS, "PARTICIPANT_TOKEN_PEPPER"),
        ("mongodb+srv://example", "short", "7", VALID_ORIGINS, "PARTICIPANT_TOKEN_PEPPER"),
        ("mongodb+srv://example", VALID_PEPPER, "0", VALID_ORIGINS, "SESSION_TTL_DAYS"),
        ("mongodb+srv://example", VALID_PEPPER, "seven", VALID_ORIGINS, "SESSION_TTL_DAYS"),
        ("mongodb+srv://example", VALID_PEPPER, "7", [], "ALLOWED_ORIGINS"),
        ("mongodb+srv://example", VALID_PEPPER, "7", ["http://mirisalim.vercel.app"], "ALLOWED_ORIGINS"),
    ],
)
def test_invalid_production_settings_name_the_variable_without_echoing_secrets(
    mongodb_uri, pepper, ttl_days, origins, expected_name
):
    with pytest.raises(RuntimeError) as exc_info:
        main._validate_production_settings(
            "production", mongodb_uri, pepper, ttl_days, origins
        )

    assert expected_name in str(exc_info.value)
    assert "mongodb+srv://example" not in str(exc_info.value)
    assert VALID_PEPPER not in str(exc_info.value)


def test_valid_production_settings_return_ttl_days():
    assert main._validate_production_settings(
        "production", "mongodb+srv://example", VALID_PEPPER, "7", VALID_ORIGINS
    ) == 7


def test_production_cors_contains_only_configured_origins():
    assert main._cors_origins("production", VALID_ORIGINS) == VALID_ORIGINS


def test_test_environment_keeps_local_origins():
    origins = main._cors_origins("test", [])
    assert "http://localhost:3000" in origins
```

- [ ] **Step 2: 새 테스트가 구현 부재로 실패하는지 확인**

Run: `cd apps/backend && .venv/Scripts/python -m pytest tests/test_production_settings.py -v`

Expected: `_validate_production_settings` 또는 `_cors_origins`가 없어 FAIL.

- [ ] **Step 3: 최소 production 설정 검증 구현**

`apps/backend/main.py`의 환경설정 영역에 개발 pepper 상수, Origin 파서, production 검증 함수를 추가한다. 오류 문자열에는 변수 이름만 포함하고 실제 값은 포함하지 않는다.

```python
DEVELOPMENT_PARTICIPANT_TOKEN_PEPPER = "mirisalim_dev_pepper_secret_2026"
DEVELOPMENT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def _parse_origins(raw: str) -> list[str]:
    return list(dict.fromkeys(item.strip() for item in raw.split(",") if item.strip()))


def _validate_production_settings(
    environment: str,
    mongodb_uri: str | None,
    pepper: str,
    ttl_days_raw: str,
    origins: list[str],
) -> int:
    try:
        ttl_days = int(ttl_days_raw)
    except ValueError as exc:
        raise RuntimeError("Invalid production setting: SESSION_TTL_DAYS") from exc

    if ttl_days <= 0:
        raise RuntimeError("Invalid production setting: SESSION_TTL_DAYS")
    if environment.lower() not in ("production", "prod"):
        return ttl_days
    if not mongodb_uri:
        raise RuntimeError("Missing production setting: MONGODB_URI")
    if pepper == DEVELOPMENT_PARTICIPANT_TOKEN_PEPPER or len(pepper) < 32:
        raise RuntimeError("Invalid production setting: PARTICIPANT_TOKEN_PEPPER")
    if not origins or any(not origin.startswith("https://") for origin in origins):
        raise RuntimeError("Invalid production setting: ALLOWED_ORIGINS")
    return ttl_days


def _cors_origins(environment: str, configured_origins: list[str]) -> list[str]:
    if environment.lower() in ("production", "prod"):
        return configured_origins
    return list(dict.fromkeys(DEVELOPMENT_ORIGINS + configured_origins))
```

기존 전역값 초기화를 위 함수로 연결하고 production 기본 Origin에서 레거시 Render URL을 제거한다.

- [ ] **Step 4: 설정 테스트와 기존 빠른 테스트 실행**

Run: `cd apps/backend && .venv/Scripts/python -m pytest tests/test_production_settings.py -v`

Expected: PASS.

Run: `cd apps/backend && .venv/Scripts/python -m pytest -q`

Expected: `28 passed, 6 skipped`보다 테스트 수가 늘고 실패 0건.

- [ ] **Step 5: 설정 변경 커밋**

```bash
git add apps/backend/main.py apps/backend/.env.example apps/backend/tests/test_production_settings.py
git commit -m "feat: validate Railway production settings"
```

### Task 2: Railway용 비루트 Docker 이미지 만들기

**Files:**
- Create: `apps/backend/Dockerfile`
- Create: `apps/backend/.dockerignore`

**Interfaces:**
- Consumes: `apps/backend/requirements.txt`, Railway의 `PORT`, Task 1의 production 환경변수.
- Produces: 포트 `${PORT:-8000}`에서 `main:app`을 실행하는 Python 3.11 컨테이너 이미지.

- [ ] **Step 1: Docker 빌드 전 실패 상태 확인**

Run: `docker build -t mirisalim-backend:test apps/backend`

Expected: `apps/backend/Dockerfile`이 없어 FAIL.

- [ ] **Step 2: Dockerfile 작성**

`apps/backend/Dockerfile`을 다음 내용으로 만든다.

```dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home /app app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chown -R app:app /app

USER app
EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

- [ ] **Step 3: Docker build context 제외 목록 작성**

`apps/backend/.dockerignore`에 다음을 둔다.

```text
.env
.env.*
!.env.example
.venv/
__pycache__/
*.py[cod]
.pytest_cache/
.mypy_cache/
.ruff_cache/
.git/
tests/
openapi.json
```

- [ ] **Step 4: 이미지 빌드와 비루트 사용자 확인**

Run: `docker build -t mirisalim-backend:test apps/backend`

Expected: build 성공.

Run: `docker run --rm --entrypoint id mirisalim-backend:test`

Expected: `uid=0(root)`가 아닌 `app` 사용자 출력.

- [ ] **Step 5: 컨테이너 변경 커밋**

```bash
git add apps/backend/Dockerfile apps/backend/.dockerignore
git commit -m "build: containerize FastAPI backend for Railway"
```

### Task 3: 비밀값을 출력하지 않는 배포 스모크 검사 추가

**Files:**
- Create: `apps/backend/scripts/smoke_deployment.py`
- Create: `apps/backend/tests/test_smoke_deployment.py`

**Interfaces:**
- Consumes: 명령행 위치 인자 `base_url`, HTTP 응답 `/health`, `/api/v1/light/questions?version=light-v1`, `/api/v1/sessions`.
- Produces: `run_smoke(base_url: str) -> None`; 성공 시 검사명과 HTTP 상태만 출력하고, 실패 시 종료 코드 1을 반환하는 CLI.

- [ ] **Step 1: 스모크 판정 테스트 작성**

`apps/backend/tests/test_smoke_deployment.py`는 `importlib.util.spec_from_file_location`으로 스크립트를 불러오고 `_request`를 monkeypatch한다. 다음을 각각 검증한다.

```python
def test_smoke_requires_connected_database_and_session_cookie(monkeypatch, smoke):
    responses = iter([
        (200, {}, {"status": "ok", "database": "connected"}),
        (200, {}, {"version": "light-v1", "questions": [1, 2, 3, 4, 5]}),
        (201, {"set-cookie": "mrs_participant=secret; HttpOnly"}, {"id": "session"}),
    ])
    monkeypatch.setattr(smoke, "_request", lambda *args, **kwargs: next(responses))
    smoke.run_smoke("https://example.up.railway.app")


def test_smoke_rejects_disconnected_database(monkeypatch, smoke):
    monkeypatch.setattr(
        smoke,
        "_request",
        lambda *args, **kwargs: (200, {}, {"status": "ok", "database": "disconnected"}),
    )
    with pytest.raises(RuntimeError, match="database"):
        smoke.run_smoke("https://example.up.railway.app")
```

테스트의 fixture는 `apps/backend/scripts/smoke_deployment.py`를 모듈명 `smoke_deployment`로 로드하며, 출력 캡처에서 `mrs_participant=secret`이 노출되지 않는 것도 확인한다.

- [ ] **Step 2: 구현 부재로 테스트가 실패하는지 확인**

Run: `cd apps/backend && .venv/Scripts/python -m pytest tests/test_smoke_deployment.py -v`

Expected: 스크립트 파일 또는 `run_smoke`가 없어 FAIL.

- [ ] **Step 3: 표준 라이브러리 기반 스모크 CLI 구현**

`urllib.request`, `http.cookiejar.CookieJar`, `json`, `argparse`만 사용한다. `_request`는 `(status_code: int, headers: dict[str, str], body: dict[str, object])`를 반환하고 `run_smoke`는 아래 순서로 검사한다.

```python
def run_smoke(base_url: str) -> None:
    base_url = base_url.rstrip("/")
    health = _request("GET", f"{base_url}/health")
    _require(health[0] == 200, "health status")
    _require(health[2].get("database") == "connected", "database connection")

    questions = _request(
        "GET", f"{base_url}/api/v1/light/questions?version=light-v1"
    )
    _require(questions[0] == 200, "questions status")
    _require(len(questions[2].get("questions", [])) == 5, "question count")

    session = _request(
        "POST",
        f"{base_url}/api/v1/sessions",
        {"nickname": "deployment-smoke", "mode": "light"},
    )
    _require(session[0] == 201, "session status")
    _require("mrs_participant=" in session[1].get("set-cookie", ""), "session cookie")
```

CLI 최상단 예외 처리에서는 `smoke failed: <검사명>`만 stderr에 출력하며 응답 본문과 쿠키는 출력하지 않는다.

- [ ] **Step 4: 스모크 단위 테스트 통과 확인**

Run: `cd apps/backend && .venv/Scripts/python -m pytest tests/test_smoke_deployment.py -v`

Expected: PASS, 출력에 쿠키 값 없음.

- [ ] **Step 5: 스모크 도구 커밋**

```bash
git add apps/backend/scripts/smoke_deployment.py apps/backend/tests/test_smoke_deployment.py
git commit -m "test: add Railway deployment smoke check"
```

### Task 4: 백엔드 CI 품질 게이트 만들기

**Files:**
- Create: `.github/workflows/backend.yml`
- Modify mechanically: Ruff가 지적하는 Python import block

**Interfaces:**
- Consumes: Python 3.11, `apps/backend/requirements.txt`, Task 1-3의 코드와 테스트, Task 2의 Dockerfile.
- Produces: push와 pull request에서 Ruff, mypy, pytest, Docker build를 실행하는 GitHub Actions workflow.

- [ ] **Step 1: 기존 Ruff 실패 재현**

Run: `cd apps/backend && .venv/Scripts/python -m ruff check .`

Expected: 기준 브랜치에서 확인한 import-order 오류 9건으로 FAIL.

- [ ] **Step 2: Ruff import order만 자동 정리**

Run: `cd apps/backend && .venv/Scripts/python -m ruff check --fix .`

Expected: import block만 변경되고 나머지 동작 코드는 변경되지 않음.

- [ ] **Step 3: GitHub Actions workflow 작성**

`.github/workflows/backend.yml`은 `apps/backend/**` 또는 workflow 자체가 바뀔 때 다음 job을 실행한다.

```yaml
name: Backend CI

on:
  push:
    paths:
      - "apps/backend/**"
      - ".github/workflows/backend.yml"
  pull_request:
    paths:
      - "apps/backend/**"
      - ".github/workflows/backend.yml"

jobs:
  quality:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
          cache-dependency-path: apps/backend/requirements.txt
      - run: python -m pip install -r requirements.txt
      - run: python -m ruff check .
      - run: python -m mypy main.py schemas.py services tests
      - run: python -m pytest -q

  container:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t mirisalim-backend:test apps/backend
```

- [ ] **Step 4: 로컬 품질 검사 실행**

Run: `cd apps/backend && .venv/Scripts/python -m ruff check .`

Expected: PASS.

Run: `cd apps/backend && .venv/Scripts/python -m mypy main.py schemas.py services tests`

Expected: `Success: no issues found`.

Run: `cd apps/backend && .venv/Scripts/python -m pytest -q`

Expected: 실패 0건.

- [ ] **Step 5: CI와 import 정리 커밋**

```bash
git add .github/workflows/backend.yml apps/backend
git commit -m "ci: validate backend deployment artifacts"
```

커밋 전 `git diff -- apps/backend/openapi.json apps/frontend/openapi.json`이 비어 있는지 확인하고 OpenAPI 파일은 stage하지 않는다.

### Task 5: Railway 무계정 상태부터 시작하는 운영 런북 작성

**Files:**
- Create: `docs/operations/backend-railway-deployment.md`

**Interfaces:**
- Consumes: GitHub 저장소 `hotpringles/MIRI`, branch `codex/deploy-railway`, Railway 대시보드, Atlas connection string, Vercel production Origin.
- Produces: 가입, GitHub 연결, 프로젝트 생성, 변수 설정, 배포, 검증, 비용 확인, 롤백의 순서가 고정된 운영 체크리스트.

- [ ] **Step 1: 런북에 계정 생성 경계 기록**

다음 원칙을 문서 첫 부분에 기록한다.

```text
Railway 가입, 서비스 약관 동의, GitHub OAuth 승인, 결제수단 등록은 계정 소유자가 직접 수행한다.
실제 secret은 Railway 또는 Atlas 대시보드에만 입력하고 채팅, 터미널 캡처, Git commit에 복사하지 않는다.
Hobby 전환이나 결제수단 등록 화면이 나오면 배포를 멈추고 소유자의 승인을 받는다.
```

- [ ] **Step 2: 가입과 GitHub 연결 체크리스트 작성**

런북에 아래 순서를 포함한다.

1. `https://railway.com/login`에서 GitHub로 가입한다.
2. Trial verification 결과가 Full인지 Limited인지 확인한다.
3. Limited Trial이면 Atlas outbound 연결이 제한될 수 있으므로 먼저 배포 후 `/health`의 `database`를 확인하고, 연결이 막힌 경우에만 Hobby 전환 여부를 사용자에게 묻는다.
4. `New Project` → `Deploy from GitHub repo`에서 GitHub 앱을 연결하고 `hotpringles/MIRI` 저장소에만 접근 권한을 준다.
5. branch를 `codex/deploy-railway`, root directory를 `/apps/backend`로 지정한다.

- [ ] **Step 3: Railway 서비스 설정과 변수 체크리스트 작성**

다음 값을 정확히 문서화한다.

```text
Healthcheck Path: /health
Healthcheck Timeout: 300 seconds
Serverless: OFF
Replicas: 1
Restart Policy: On Failure
ENVIRONMENT=production
MONGODB_DB_NAME=mirisalim
SESSION_TTL_DAYS=7
```

`MONGODB_URI`, `PARTICIPANT_TOKEN_PEPPER`, `ALLOWED_ORIGINS`는 실제 값 대신 생성·입력 위치만 설명한다. pepper는 사용자 로컬 터미널에서 `python -c "import secrets; print(secrets.token_urlsafe(48))"`로 한 번 생성하고 Railway Variables에 직접 붙여넣는다.

- [ ] **Step 4: Atlas, 도메인, 비용, 롤백 절차 작성**

Atlas 전용 DB 사용자와 최소 `mirisalim` read/write 권한, Network Access, Railway public domain 생성, 배포 URL 스모크 명령을 기록한다.

```bash
python apps/backend/scripts/smoke_deployment.py https://<service>.up.railway.app
```

비용 절차에는 Workspace Usage에서 Trial 잔액과 월 예상치를 확인하고, 결제 전에는 Free 상태를 유지하며, 유료 전환 승인 후에만 compute usage alert/hard limit을 설정한다고 명시한다. Railway의 compute hard limit 최소값이 현재 `$10`이므로, `$10` 지출 허용으로 오해될 수 있는 설정은 사용자 확인 없이 적용하지 않는다.

롤백은 Railway Deployments에서 직전 성공 배포를 선택해 Rollback하고 `/health`와 스모크 검사를 다시 실행하는 순서로 적는다.

- [ ] **Step 5: 비밀값·누락 항목 문서 검사**

Run: `rg -n "mongodb\\+srv://[^<]|mrs_participant=|token_urlsafe\\([^)]+\\).*=" docs/operations/backend-railway-deployment.md`

Expected: 실제 URI 또는 쿠키 값 0건.

Run: `rg -n "Serverless: OFF|/health|codex/deploy-railway|hotpringles/MIRI|Limited Trial|Hobby" docs/operations/backend-railway-deployment.md`

Expected: 각 필수 운영 항목이 발견됨.

- [ ] **Step 6: 운영 런북 커밋**

```bash
git add docs/operations/backend-railway-deployment.md
git commit -m "docs: add Railway signup and deployment runbook"
```

### Task 6: 저장소 전체 배포 준비 검증

**Files:**
- Verify only: Task 1-5에서 변경한 파일

**Interfaces:**
- Consumes: 완성된 production 설정, Docker 이미지, 스모크 CLI, CI, 운영 런북.
- Produces: 실제 계정 작업을 시작해도 되는 검증 증거와 깨끗한 branch diff.

- [ ] **Step 1: Python 품질 게이트 재실행**

Run: `cd apps/backend && .venv/Scripts/python -m ruff check .`

Expected: PASS.

Run: `cd apps/backend && .venv/Scripts/python -m mypy main.py schemas.py services tests`

Expected: PASS.

Run: `cd apps/backend && .venv/Scripts/python -m pytest -q`

Expected: PASS, 실패 0건.

- [ ] **Step 2: Docker 이미지와 런타임 포트 검증**

Run: `docker build -t mirisalim-backend:test apps/backend`

Expected: PASS.

유효한 일회성 test 환경변수와 `PORT=8010`으로 컨테이너를 실행한 뒤 `http://127.0.0.1:8010/health`가 200인지 확인한다. 로컬 MongoDB가 없으면 본문 `database=disconnected`는 허용하되 프로세스와 포트가 정상이어야 한다.

- [ ] **Step 3: 변경 범위와 secret 검사**

Run: `git diff --check fix/gate1-openapi-contract...HEAD`

Expected: 출력 없음.

Run: `git diff --name-only fix/gate1-openapi-contract...HEAD`

Expected: 설계, 계획, backend 배포 파일, backend CI, 운영 런북만 출력되고 frontend 파일은 없음.

Run: `git grep -n -E "mongodb\\+srv://[^<]|PARTICIPANT_TOKEN_PEPPER=.{32,}" -- ':!docs/superpowers/plans/*' ':!docs/superpowers/specs/*'`

Expected: 실제 production secret 0건.

- [ ] **Step 4: 구현 branch를 원격에 게시**

Run: `git push -u origin codex/deploy-railway`

Expected: 원격 branch 생성과 GitHub Actions 시작.

- [ ] **Step 5: GitHub Actions 결과 확인**

Run: `gh run list --branch codex/deploy-railway --workflow backend.yml --limit 1`

Expected: 최신 run이 `completed success`.

### Task 7: 사용자 가입 이후 실제 Railway 배포

**Files:**
- External state only: Railway, GitHub OAuth, MongoDB Atlas, Vercel 대시보드

**Interfaces:**
- Consumes: Task 5 런북, 원격 branch, 사용자 소유 Railway 계정, Atlas URI, Vercel production Origin.
- Produces: Railway public URL, connected health, 성공한 API 스모크 결과, Vercel rewrite 대상 URL.

- [ ] **Step 1: 사용자와 함께 가입·검증 상태 확인**

사용자가 Railway 로그인과 GitHub OAuth를 완료한 뒤 Full Trial 또는 Limited Trial 상태만 공유한다. 비밀번호, OAuth token, Atlas URI는 공유하지 않는다.

- [ ] **Step 2: Railway 프로젝트와 서비스 생성**

런북 값대로 repository, branch, root directory, healthcheck, Serverless OFF, replica 1을 설정한다. 변수를 모두 저장한 뒤에만 최초 배포를 시작한다.

- [ ] **Step 3: Railway public domain 검증**

Railway Networking에서 public domain을 생성하고 다음을 실행한다.

Run: `python apps/backend/scripts/smoke_deployment.py https://<service>.up.railway.app`

Expected: health, database, questions, session 검사가 모두 PASS.

- [ ] **Step 4: Vercel rewrite 연결 검증**

프론트 담당이 Vercel `/api/:path*`를 Railway `/api/:path*`로 rewrite한 뒤 Vercel URL에서 `/api/health`, 질문 조회, 쿠키 발급 세션 생성과 두 브라우저 세션 복구를 확인한다.

- [ ] **Step 5: 비용 상태와 롤백 지점 기록**

Railway Workspace Usage에서 Trial 잔액, 현재 시간당 사용량, 월 예상치를 기록한다. 결제수단 또는 Hobby가 필요하면 실제 전환 전에 사용자 승인을 받는다. 첫 성공 deployment ID와 Railway URL을 팀 운영 기록에 남기되 secret은 기록하지 않는다.
