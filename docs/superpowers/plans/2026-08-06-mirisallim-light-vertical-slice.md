# 미리살림 3분 모드 프로덕션 수직 슬라이스 구현 계획

> **상태: 대체됨 — 실행하지 말 것.** 사용자 피드백에 따라 프론트엔드와 백엔드 작업을 독립적으로 관리하도록 아래 계획으로 분리했다.
>
> - `2026-08-06-mirisallim-light-backend.md`
> - `2026-08-06-mirisallim-light-frontend.md`
> - `2026-08-06-mirisallim-light-coordination.md`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 익명 사용자 두 명이 초대 코드로 연결되어 3분 질문에 답하고, 양측 제출 전에는 상대 데이터가 전혀 노출되지 않으며, 제출 후 결과와 금액 없는 공유 이미지를 함께 확인하는 서비스를 실제 클라우드에 배포한다.

**Architecture:** 단일 저장소의 `apps/frontend`와 `apps/backend`를 기능별 수직 슬라이스로 함께 개발한다. FastAPI OpenAPI가 클라이언트 계약의 단일 원본이며, MongoDB 세션 문서와 API 응답 모델이 동시공개·7일 만료·알림 제한을 서버에서 강제한다. 프론트엔드는 FSD 계층과 공개 API 경계를 지킨다.

**Tech Stack:** React 18, Vite, TypeScript, React Router, Tailwind CSS 3, Zustand, TanStack Query 5, react-hook-form, zod, html-to-image, Python 3.11, FastAPI, Pydantic 2, PyMongo Async API, MongoDB Atlas, pytest, Vitest, Testing Library, MSW, Playwright, Vercel, Railway, GitHub Actions.

## Global Constraints

- 3분 플로우의 강조색은 Green `#43A77B`, 상대 예측 보조색은 Purple `#8A6FD1`, 배경은 `#FCFCFB`다.
- Pretendard Variable과 전역 `word-break: keep-all`을 적용한다.
- 모든 선택형 UI는 `aria-pressed`, 폼은 명시적 라벨, 모든 상호작용은 `:focus-visible`을 제공한다.
- 프론트엔드 FSD 의존 방향은 `app → pages → widgets → features → entities → shared`만 허용한다.
- 라이트 질문은 `apps/backend/config/light_questions.json`이 단일 원본이며 현재 기본 질문 수는 5개다.
- 세션은 생성 시 `questionSetVersion`을 고정하고 점수 분모는 해당 버전의 `questions.length`다.
- 한 명이라도 미제출이면 결과 API 응답 타입에 상대 답·예측·유형·점수 필드가 존재하지 않아야 한다.
- 참여자 토큰은 `HttpOnly + Secure + SameSite=Lax` 쿠키에만 저장하고 DB에는 HMAC-SHA-256 다이제스트만 저장한다.
- `expiresAt`이 지나면 API가 즉시 410을 반환하고 MongoDB TTL 인덱스가 문서를 삭제한다.
- 공유 카드 DTO와 PNG에는 금액, 부채, 저축액 필드를 만들지 않는다.
- 첫 슬라이스에서 15분 모드, 회원가입, OAuth, LLM, 정책금융, PDF, WebSocket, Redis는 구현하지 않는다.
- 모든 민감 응답은 `Cache-Control: no-store`이며 요청 본문·쿠키·답변·결과를 로그에 남기지 않는다.

---

## 파일 구조

~~~text
.
├─ .github/workflows/ci.yml
├─ .editorconfig
├─ .env.example
├─ .gitignore
├─ compose.yaml
├─ package.json
├─ apps/
│  ├─ frontend/
│  │  ├─ package.json
│  │  ├─ vite.config.ts
│  │  ├─ tailwind.config.ts
│  │  ├─ eslint.config.js
│  │  ├─ playwright.config.ts
│  │  ├─ vercel.json
│  │  ├─ public/images/
│  │  └─ src/
│  │     ├─ app/
│  │     ├─ pages/
│  │     ├─ widgets/
│  │     ├─ features/
│  │     ├─ entities/
│  │     └─ shared/
│  └─ backend/
│     ├─ pyproject.toml
│     ├─ Dockerfile
│     ├─ railway.toml
│     ├─ config/
│     │  ├─ light_questions.json
│     │  └─ light_types.json
│     ├─ scripts/export_openapi.py
│     ├─ app/
│     │  ├─ api/v1/routers/
│     │  ├─ core/
│     │  ├─ db/
│     │  ├─ engine/
│     │  ├─ models/
│     │  ├─ repositories/
│     │  ├─ schemas/
│     │  ├─ services/
│     │  └─ main.py
│     └─ tests/
└─ docs/superpowers/
~~~

## 진행 순서 요약

| 순서 | 수직 슬라이스 | 완료 시 확인 가능한 결과 |
| --- | --- | --- |
| 1 | 저장소·테스트 기반 | 프론트 앱과 API health가 로컬에서 실행됨 |
| 2 | 디자인 시스템·FSD | 공용 UI와 반응형 셸이 검증됨 |
| 3 | 질문 계약 | 버전별 질문을 API와 타입 클라이언트로 조회 |
| 4 | 세션 생성 | 랜딩 CTA로 세션·초대 코드·쿠키 생성 |
| 5 | 입력 자동 저장 | 질문 탐색, 선택, 건너뛰기, 새로고침 복구 |
| 6 | 제출·완료 | 제출 이후 읽기 전용과 완료 화면 |
| 7 | 초대 참여 | 두 번째 브라우저가 안전하게 B 슬롯 참여 |
| 8 | 대기·알림 | 3초 폴링과 24시간 인앱 알림 제한 |
| 9 | 결과 공개 | 양측 제출 뒤에만 계산 결과 표시 |
| 10 | 공유 카드 | 금액 없는 9:16·1:1 PNG 다운로드 |
| 11 | 보안·만료 강화 | TTL, 속도 제한, 보안 헤더 회귀 검사 |
| 12 | E2E·접근성 | 두 브라우저 전체 사용자 여정 자동화 |
| 13 | CI·클라우드 배포 | Atlas, Railway, Vercel에서 프로덕션 동작 |

---

### Task 1: 저장소와 실행 기반

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.env.example`
- Create: `compose.yaml`
- Create: `apps/frontend/package.json`
- Create: `apps/frontend/index.html`
- Create: `apps/frontend/tsconfig.json`
- Create: `apps/frontend/vite.config.ts`
- Create: `apps/frontend/src/app/main.tsx`
- Create: `apps/frontend/src/app/App.tsx`
- Create: `apps/frontend/src/app/App.test.tsx`
- Create: `apps/frontend/src/shared/config/test-setup.ts`
- Create: `apps/backend/pyproject.toml`
- Create: `apps/backend/app/__init__.py`
- Create: `apps/backend/app/main.py`
- Create: `apps/backend/tests/api/test_health.py`

**Interfaces:**
- Produces: `GET /health -> {"status":"ok"}`.
- Produces: `App() -> JSX.Element` and root npm scripts `dev:frontend`, `test:frontend`, `test:backend`.

- [ ] **Step 1: Create workspace and dependency manifests**

Use Node 20+, npm workspaces, Python 3.11, React 18, Tailwind 3, FastAPI, Pydantic 2, and PyMongo 4.13+.

~~~json
{
  "name": "mirisallim",
  "private": true,
  "workspaces": ["apps/frontend"],
  "scripts": {
    "dev:frontend": "npm --workspace @mirisallim/frontend run dev",
    "test:frontend": "npm --workspace @mirisallim/frontend run test",
    "build:frontend": "npm --workspace @mirisallim/frontend run build"
  }
}
~~~

`apps/backend/pyproject.toml` must expose dev extras containing `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `mypy`, and `testcontainers[mongodb]`.

- [ ] **Step 2: Write failing health tests**

~~~python
from fastapi.testclient import TestClient
from app.main import app

def test_health() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
~~~

~~~tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the service name", () => {
  render(<App />);
  expect(screen.getByText("미리살림")).toBeInTheDocument();
});
~~~

- [ ] **Step 3: Run tests and confirm the missing implementations fail**

Run in `apps/backend`: `python -m pytest tests/api/test_health.py -v`.

Expected: FAIL because `app.main` or `/health` is missing.

Run at repository root: `npm run test:frontend -- --run src/app/App.test.tsx`.

Expected: FAIL because `App` is missing or does not render the name.

- [ ] **Step 4: Implement the minimum applications**

~~~python
from fastapi import FastAPI

app = FastAPI(title="미리살림 API", version="1.0.0")

@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
~~~

~~~tsx
export function App() {
  return <main>미리살림</main>;
}
~~~

- [ ] **Step 5: Verify tests and builds**

Run `python -m pytest tests/api/test_health.py -v`, `npm run test:frontend -- --run`, and `npm run build:frontend`.

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

~~~bash
git add package.json .gitignore .editorconfig .env.example compose.yaml apps/frontend apps/backend
git commit -m "chore: scaffold frontend and backend"
~~~

---

### Task 2: 디자인 시스템, 앱 셸, FSD 경계

**Files:**
- Create: `apps/frontend/tailwind.config.ts`
- Create: `apps/frontend/postcss.config.cjs`
- Create: `apps/frontend/eslint.config.js`
- Create: `apps/frontend/src/app/styles/globals.css`
- Create: `apps/frontend/src/shared/lib/use-window-width.ts`
- Create: `apps/frontend/src/shared/ui/button/Button.tsx`
- Create: `apps/frontend/src/shared/ui/button/Button.test.tsx`
- Create: `apps/frontend/src/shared/ui/badge/Badge.tsx`
- Create: `apps/frontend/src/shared/ui/pill-toggle/PillToggle.tsx`
- Create: `apps/frontend/src/shared/ui/pill-toggle/PillToggle.test.tsx`
- Create: `apps/frontend/src/shared/ui/progress/Progress.tsx`
- Create: `apps/frontend/src/widgets/app-header/ui/AppHeader.tsx`
- Create: `apps/frontend/src/widgets/app-footer/ui/AppFooter.tsx`
- Create: `apps/frontend/src/widgets/app-shell/ui/AppShell.tsx`
- Create: `apps/frontend/src/shared/ui/index.ts`
- Copy: `C:/Users/jhcho/Downloads/미리살림_사람.png` to `apps/frontend/public/images/미리살림_사람.png`
- Copy: `C:/Users/jhcho/Downloads/미리살림_3분_아이콘.png` to `apps/frontend/public/images/미리살림_3분_아이콘.png`

**Interfaces:**
- Produces: `ButtonProps`, `BadgeProps`, `PillToggleProps`, `AppShellProps`.
- Produces: `useWindowWidth(): number`; desktop navigation is active when width is at least 900.

- [ ] **Step 1: Write failing UI accessibility tests**

~~~tsx
it("exposes pressed state and keyboard focus", () => {
  render(<PillToggle pressed={false} onPressedChange={() => undefined}>선택</PillToggle>);
  const button = screen.getByRole("button", { name: "선택" });
  expect(button).toHaveAttribute("aria-pressed", "false");
  button.focus();
  expect(button).toHaveFocus();
});
~~~

- [ ] **Step 2: Run the focused test**

Run `npm run test:frontend -- --run src/shared/ui/button/Button.test.tsx src/shared/ui/pill-toggle/PillToggle.test.tsx`.

Expected: FAIL because shared UI components do not exist.

- [ ] **Step 3: Register exact design tokens and implement components**

~~~ts
export default {
  theme: {
    extend: {
      colors: {
        canvas: "#FCFCFB",
        ink: "#222222",
        muted: "#666666",
        green: { DEFAULT: "#43A77B", tint: "#EAF7F1", border: "#CFE9DC" },
        purple: { DEFAULT: "#8A6FD1", tint: "#F1EDFC", border: "#D9CFF3" }
      },
      borderRadius: { card: "20px", control: "14px" }
    }
  }
};
~~~

Implement `PillToggle` as a real `button type="button"` with `aria-pressed`. Implement `AppHeader` with the JavaScript 900px width subscription, sticky translucent background, desktop nav, and mobile menu.

- [ ] **Step 4: Enforce FSD imports**

Configure `eslint-plugin-boundaries` so lower layers never import higher layers and all cross-slice imports use each slice's `index.ts`.

Run `npm --workspace @mirisallim/frontend run lint`.

Expected: exit 0 and an intentionally inverted import in a temporary test fixture is rejected.

- [ ] **Step 5: Verify visual foundations**

Run `npm run test:frontend -- --run` and `npm run build:frontend`.

Expected: all UI tests pass and build exits 0.

- [ ] **Step 6: Commit**

~~~bash
git add apps/frontend
git commit -m "feat: add frontend design system and app shell"
~~~

---

### Task 3: 버전형 질문 계약과 OpenAPI 클라이언트

**Files:**
- Create: `apps/backend/config/light_questions.json`
- Create: `apps/backend/config/light_types.json`
- Create: `apps/backend/app/core/question_catalog.py`
- Create: `apps/backend/app/schemas/questions.py`
- Create: `apps/backend/app/api/v1/routers/questions.py`
- Create: `apps/backend/tests/core/test_question_catalog.py`
- Create: `apps/backend/tests/api/test_questions.py`
- Create: `apps/backend/scripts/export_openapi.py`
- Create: `apps/frontend/src/shared/api/schema.d.ts`
- Create: `apps/frontend/src/shared/api/client.ts`
- Create: `apps/frontend/src/entities/light-question/model/types.ts`
- Create: `apps/frontend/src/entities/light-question/index.ts`

**Interfaces:**
- Produces: `QuestionCatalog.get(version: str | None) -> QuestionSet`.
- Produces: `GET /api/v1/light/questions?version=light-v1 -> QuestionSetResponse`.
- Produces: typed frontend `apiClient` generated from FastAPI OpenAPI.

- [ ] **Step 1: Write catalog and endpoint tests**

~~~python
def test_current_question_set_has_stable_ids(catalog: QuestionCatalog) -> None:
    question_set = catalog.get()
    assert question_set.version == "light-v1"
    assert [q.id for q in question_set.questions] == [
        "monthly_income", "saving_ratio", "spending_style", "debt_load", "shared_expense"
    ]
    assert all(len(q.options) == 4 for q in question_set.questions)
~~~

~~~python
def test_unknown_question_version_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/light/questions?version=missing")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "QUESTION_SET_NOT_FOUND"
~~~

- [ ] **Step 2: Run tests and confirm failure**

Run in `apps/backend`: `python -m pytest tests/core/test_question_catalog.py tests/api/test_questions.py -v`.

Expected: FAIL because the catalog and route are absent.

- [ ] **Step 3: Create the exact first question set**

`light_questions.json` must contain version `light-v1` and the five stable IDs above, with the Korean topics, questions, descriptions, and four options copied verbatim from the approved product prompt. The catalog validates unique IDs, exactly four options per question, and a non-empty current version at startup.

~~~python
class QuestionSet(BaseModel):
    version: str
    questions: list[LightQuestion]

@router.get("/light/questions", response_model=QuestionSet)
async def get_questions(version: str | None = None) -> QuestionSet:
    return question_catalog.get(version)
~~~

- [ ] **Step 4: Export and consume OpenAPI**

`export_openapi.py` writes `app.openapi()` to `apps/frontend/openapi.json`. Add scripts that run `openapi-typescript` and create `schema.d.ts`, then initialize `openapi-fetch` with `baseUrl: "/api/v1"` and `credentials: "include"`.

Run `python scripts/export_openapi.py` and `npm --workspace @mirisallim/frontend run api:generate`.

Expected: generated schema contains `/light/questions` and `QuestionSet`.

- [ ] **Step 5: Verify**

Run backend tests, frontend typecheck, and `git diff --exit-code apps/frontend/src/shared/api/schema.d.ts` after a second generation.

Expected: tests pass and generation is deterministic.

- [ ] **Step 6: Commit**

~~~bash
git add apps/backend/config apps/backend/app apps/backend/tests apps/backend/scripts apps/frontend
git commit -m "feat: add versioned light question contract"
~~~

---

### Task 4: 세션 생성 수직 슬라이스

**Files:**
- Create: `apps/backend/app/core/settings.py`
- Create: `apps/backend/app/core/security.py`
- Create: `apps/backend/app/db/mongo.py`
- Create: `apps/backend/app/db/indexes.py`
- Create: `apps/backend/app/models/session.py`
- Create: `apps/backend/app/schemas/session.py`
- Create: `apps/backend/app/repositories/session_repository.py`
- Create: `apps/backend/app/services/session_service.py`
- Create: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/integration/test_session_create.py`
- Create: `apps/frontend/src/features/create-session/api/create-session.ts`
- Create: `apps/frontend/src/features/create-session/ui/StartLightButton.tsx`
- Create: `apps/frontend/src/features/create-session/index.ts`
- Create: `apps/frontend/src/pages/landing/ui/LandingPage.tsx`
- Create: `apps/frontend/src/pages/landing/ui/LandingPage.test.tsx`

**Interfaces:**
- Produces: `SessionService.create(question_set_version, idempotency_key, now) -> SessionCreated`.
- Produces: `POST /api/v1/sessions -> {sessionId, code, questionSetVersion, expiresAt}` and sets `mrs_participant`.
- Produces: `GET /api/v1/me/session -> ActiveSessionResponse`.

- [ ] **Step 1: Write failing backend creation tests**

~~~python
async def test_create_session_sets_private_cookie_and_hashes_token(client, sessions) -> None:
    response = await client.post("/api/v1/sessions", headers={"Idempotency-Key": "create-1"})
    assert response.status_code == 201
    assert "mrs_participant=" in response.headers["set-cookie"]
    document = await sessions.find_one({"id": response.json()["sessionId"]})
    assert document["participants"][0]["tokenHash"]
    assert "token" not in document["participants"][0]
    assert document["questionSetVersion"] == "light-v1"
~~~

Also test unique `MRS-XXXXXX` codes, seven-day `expiresAt`, idempotent retry, and TTL/unique index definitions.

- [ ] **Step 2: Run the backend test**

Run `python -m pytest tests/integration/test_session_create.py -v` from `apps/backend` with Docker running.

Expected: FAIL because persistence and route do not exist.

- [ ] **Step 3: Implement Mongo lifecycle and token security**

~~~python
def digest_participant_token(token: str, pepper: str) -> str:
    return hmac.new(pepper.encode(), token.encode(), hashlib.sha256).hexdigest()
~~~

Create indexes for unique `id`, unique `code`, nested token digest lookup, and `expiresAt` TTL with `expireAfterSeconds=0`. Generate invite characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.

- [ ] **Step 4: Write and run the failing landing integration test**

Mock `POST /api/v1/sessions`, click `가볍게 맞춰보기`, and assert navigation to `/light/1` plus `sessionStorage.activeSessionId`.

Expected before implementation: FAIL because `LandingPage` and `StartLightButton` do not exist.

- [ ] **Step 5: Implement the landing**

Build the approved hero, feature bullets, two mode cards, four-step guide, responsive images, and disabled `준비 중` full-mode CTA. Wire the light CTA to `createSession()` and preserve the Korean copy exactly.

- [ ] **Step 6: Verify**

Run session integration tests, landing tests, frontend typecheck, and frontend build.

Expected: all exit 0.

- [ ] **Step 7: Commit**

~~~bash
git add apps/backend apps/frontend
git commit -m "feat: create anonymous light sessions"
~~~

---

### Task 5: 질문 입력과 자동 저장 수직 슬라이스

**Files:**
- Create: `apps/backend/app/schemas/light_input.py`
- Modify: `apps/backend/app/repositories/session_repository.py`
- Modify: `apps/backend/app/services/session_service.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/integration/test_light_input.py`
- Create: `apps/frontend/src/entities/light-answer/model/types.ts`
- Create: `apps/frontend/src/features/save-light-answer/model/light-form-store.ts`
- Create: `apps/frontend/src/features/save-light-answer/api/light-input.ts`
- Create: `apps/frontend/src/features/save-light-answer/ui/AnswerGroup.tsx`
- Create: `apps/frontend/src/features/save-light-answer/index.ts`
- Create: `apps/frontend/src/widgets/light-question-card/ui/LightQuestionCard.tsx`
- Create: `apps/frontend/src/pages/light-form/ui/LightFormPage.tsx`
- Create: `apps/frontend/src/pages/light-form/ui/LightFormPage.test.tsx`

**Interfaces:**
- Produces: `GET /api/v1/sessions/{id}/me/input -> ParticipantInputResponse`.
- Produces: `PATCH /api/v1/sessions/{id}/me/input` accepting complete variable-length `answers` and `guesses` arrays.
- Produces: `useLightFormStore` with `setAnswer`, `setGuess`, `hydrate`, `currentStep`.

- [ ] **Step 1: Write backend validation and privacy tests**

~~~python
async def test_patch_rejects_length_not_matching_session_version(client_a, session_id) -> None:
    response = await client_a.patch(
        f"/api/v1/sessions/{session_id}/me/input",
        json={"answers": [0], "guesses": [0]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "QUESTION_COUNT_MISMATCH"
~~~

Also assert GET returns only A's input, nulls are accepted, values outside `0..3` fail, and a submitted participant receives 409 on PATCH.

- [ ] **Step 2: Run backend tests and confirm failure**

Run `python -m pytest tests/integration/test_light_input.py -v`.

Expected: FAIL because input endpoints are absent.

- [ ] **Step 3: Implement input repository and API**

Use a Mongo condition containing session ID, matching token digest, `expiresAt > now`, and `participants.completedAt: null`. Update only the matched participant element. Never project the partner input in the GET route.

- [ ] **Step 4: Write failing frontend wizard tests**

Test Green selection for self, Purple selection for guess, `aria-pressed`, previous/next, skip storing null, save state, and reload hydration. Add a three-question fixture and assert the progress total and saved array length are both 3 so the UI cannot silently reintroduce a fixed count of 5.

~~~tsx
await user.click(screen.getByRole("button", { name: "200~300만원" }));
expect(saveInput).toHaveBeenCalledWith(expect.objectContaining({ answers: [1, null, null, null, null] }));
~~~

- [ ] **Step 5: Implement form and auto-save**

Use TanStack Query for loading and a debounced mutation for saving. Keep local state on failure and show `저장되지 않음 · 다시 시도`. Derive total steps from the server question set; do not hardcode 5 in the progress component.

- [ ] **Step 6: Verify**

Run backend input tests, frontend page tests, lint, typecheck, and build.

Expected: all exit 0.

- [ ] **Step 7: Commit**

~~~bash
git add apps/backend apps/frontend
git commit -m "feat: save light answers and predictions"
~~~

---

### Task 6: 제출과 완료 화면 수직 슬라이스

**Files:**
- Modify: `apps/backend/app/repositories/session_repository.py`
- Modify: `apps/backend/app/services/session_service.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/integration/test_submit.py`
- Create: `apps/frontend/src/features/submit-light-form/api/submit-light-form.ts`
- Create: `apps/frontend/src/features/submit-light-form/ui/SubmitLightButton.tsx`
- Create: `apps/frontend/src/features/submit-light-form/index.ts`
- Create: `apps/frontend/src/pages/done/ui/DonePage.tsx`
- Create: `apps/frontend/src/pages/done/ui/DonePage.test.tsx`

**Interfaces:**
- Produces: `POST /api/v1/sessions/{id}/me/submit -> {status, completedAt}`.
- Produces: idempotent submit; repeated requests return the same completion time.

- [ ] **Step 1: Write failing submit invariants**

~~~python
async def test_submit_is_idempotent_and_freezes_input(client_a, session_id) -> None:
    first = await client_a.post(f"/api/v1/sessions/{session_id}/me/submit", headers={"Idempotency-Key": "submit-a"})
    second = await client_a.post(f"/api/v1/sessions/{session_id}/me/submit", headers={"Idempotency-Key": "submit-a"})
    assert first.json()["completedAt"] == second.json()["completedAt"]
    patch = await client_a.patch(f"/api/v1/sessions/{session_id}/me/input", json=valid_input())
    assert patch.status_code == 409
~~~

- [ ] **Step 2: Run and confirm failure**

Run `python -m pytest tests/integration/test_submit.py -v`.

Expected: FAIL because submit is absent.

- [ ] **Step 3: Implement atomic submit**

Set the authenticated participant's `completedAt` only when it is null. Do not calculate or attach result data in this task. Every repeated submit returns the original completion time regardless of whether the caller reused the idempotency key; input mutation remains a 409 after submission.

- [ ] **Step 4: Test and implement frontend completion**

Write a failing test asserting the final CTA reads `입력 완료하기`, waits for a successful response, then navigates to `/done`. Implement the approved code box, `입력 다시 보기` read-only link, `진행 상황 보기`, seven-day deletion copy, and home link.

- [ ] **Step 5: Verify**

Run submit tests, DonePage tests, frontend typecheck, and build.

Expected: all pass.

- [ ] **Step 6: Commit**

~~~bash
git add apps/backend apps/frontend
git commit -m "feat: submit and freeze light input"
~~~

---

### Task 7: 초대 조회와 참여 수직 슬라이스

**Files:**
- Create: `apps/backend/app/schemas/invitation.py`
- Modify: `apps/backend/app/repositories/session_repository.py`
- Modify: `apps/backend/app/services/session_service.py`
- Create: `apps/backend/app/api/v1/routers/invitations.py`
- Create: `apps/backend/tests/integration/test_invitation.py`
- Create: `apps/frontend/src/entities/session/model/invitation.ts`
- Create: `apps/frontend/src/features/join-session/api/join-session.ts`
- Create: `apps/frontend/src/features/join-session/ui/JoinSessionButton.tsx`
- Create: `apps/frontend/src/features/join-session/index.ts`
- Create: `apps/frontend/src/pages/invite/ui/InvitePage.tsx`
- Create: `apps/frontend/src/pages/invite/ui/InvitePage.test.tsx`

**Interfaces:**
- Produces: `GET /api/v1/invitations/{code} -> {mode, durationMinutes, expiresAt}` only.
- Produces: `POST /api/v1/invitations/{code}/join -> SessionJoined` and replaces `mrs_participant` cookie.

- [ ] **Step 1: Write safe-preview and atomic-join tests**

Assert preview never returns participants, input, completion flags, or result. Concurrent join requests must yield exactly one 201 and one generic 404/409 without exposing whether the code exists.

- [ ] **Step 2: Run and confirm failure**

Run `python -m pytest tests/integration/test_invitation.py -v`.

Expected: FAIL because invitation routes are absent.

- [ ] **Step 3: Implement invitation service**

Use a single conditional Mongo update requiring an unexpired session with exactly one participant. Append B with a token digest, empty arrays sized from `questionSetVersion`, and null `completedAt`.

- [ ] **Step 4: Test and implement InvitePage**

The failing UI test must confirm generic copy `파트너가 함께 해보자고 초대했어요`, mode badge, privacy copy, start CTA, and inaccessible-code state. On join success, store the public session ID and navigate to `/light/1`.

- [ ] **Step 5: Verify and commit**

Run backend invitation tests and frontend InvitePage tests, then:

~~~bash
git add apps/backend apps/frontend
git commit -m "feat: join sessions by invitation code"
~~~

---

### Task 8: 대기 상태, 폴링, 인앱 알림

**Files:**
- Create: `apps/backend/app/schemas/status.py`
- Create: `apps/backend/app/services/nudge_service.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/integration/test_status_and_nudge.py`
- Create: `apps/frontend/src/features/poll-session-status/api/session-status.ts`
- Create: `apps/frontend/src/features/poll-session-status/model/use-session-status.ts`
- Create: `apps/frontend/src/features/send-nudge/api/send-nudge.ts`
- Create: `apps/frontend/src/widgets/waiting-status/ui/WaitingStatus.tsx`
- Create: `apps/frontend/src/pages/waiting/ui/WaitingPage.tsx`
- Create: `apps/frontend/src/pages/waiting/ui/WaitingPage.test.tsx`

**Interfaces:**
- Produces: `GET /api/v1/sessions/{id}/status -> {status, meCompleted, partnerJoined, partnerCompleted, partnerNudgedAt, expiresAt}`.
- Produces: `POST /api/v1/sessions/{id}/nudge` with rolling 24-hour sender limit.
- Produces: `useSessionStatus(sessionId)` polling every 3000ms only while status is not ready.

- [ ] **Step 1: Write failing status privacy and nudge tests**

Assert status returns booleans and timestamps only, never input. Assert no-target returns `NUDGE_TARGET_UNAVAILABLE`, second nudge within 24 hours returns 429, and a nudge becomes visible to the partner.

- [ ] **Step 2: Run and confirm failure**

Run `python -m pytest tests/integration/test_status_and_nudge.py -v`.

Expected: FAIL because status/nudge services are absent.

- [ ] **Step 3: Implement status and Mongo-backed rate limiting**

Store `lastNudgedAt` on the sender participant with a conditional update that requires the previous timestamp to be absent or at least 24 hours old. Return a neutral partner notification timestamp without any answer data.

- [ ] **Step 4: Test and implement WaitingPage**

Cover waiting/ready badges, two participant cards, simultaneous-release explanation, locked previews, copy-link feedback for 1.6 seconds, nudge states, and automatic navigation/CTA enablement when ready.

- [ ] **Step 5: Verify and commit**

Run focused backend/frontend tests, then:

~~~bash
git add apps/backend apps/frontend
git commit -m "feat: poll waiting state and rate limit nudges"
~~~

---

### Task 9: 결과 엔진, 동시공개 게이트, 결과 화면

**Files:**
- Create: `apps/backend/app/engine/light_result.py`
- Create: `apps/backend/app/schemas/result.py`
- Create: `apps/backend/app/services/result_service.py`
- Modify: `apps/backend/app/repositories/session_repository.py`
- Modify: `apps/backend/app/api/v1/routers/sessions.py`
- Create: `apps/backend/tests/engine/test_light_result.py`
- Create: `apps/backend/tests/integration/test_result_gate.py`
- Create: `apps/frontend/src/entities/light-result/model/types.ts`
- Create: `apps/frontend/src/features/get-light-result/api/get-light-result.ts`
- Create: `apps/frontend/src/widgets/result-summary/ui/ResultSummary.tsx`
- Create: `apps/frontend/src/widgets/result-comparison/ui/ResultComparison.tsx`
- Create: `apps/frontend/src/pages/light-result/ui/LightResultPage.tsx`
- Create: `apps/frontend/src/pages/light-result/ui/LightResultPage.test.tsx`

**Interfaces:**
- Produces: `calculate_light_result(question_set, participant_a, participant_b, type_rules) -> LightResult`.
- Produces: discriminated response `WaitingResultResponse | ReadyResultResponse`.
- Produces: score `0..N`, threshold copy based on `ceil(N*0.8)` and `ceil(N*0.4)`.

- [ ] **Step 1: Write failing pure-engine tests**

~~~python
def test_mutual_hit_requires_both_predictions() -> None:
    result = calculate_light_result(
        question_set_two(),
        participant([0, 1], [1, 0]),
        participant([1, 0], [0, 3]),
        rules(),
    )
    assert result.mutual_hit_count == 1
    assert result.question_results[0].both_guessed is True
    assert result.question_results[1].both_guessed is False
~~~

Also test nulls never hit, `N` is dynamic, thresholds scale, type rules use stable question IDs, and income/debt do not affect type labels.

- [ ] **Step 2: Run engine tests and confirm failure**

Run `python -m pytest tests/engine/test_light_result.py -v`.

Expected: FAIL because `calculate_light_result` is absent.

- [ ] **Step 3: Implement the pure result engine**

Return immutable Pydantic/dataclass values containing both public answer sets, per-viewer prediction flags, neutral gap topics, two types, taglines, and the mutual score. Do not import FastAPI, PyMongo, or environment settings.

- [ ] **Step 4: Write and run result-gate integration tests**

Test all pre-ready combinations and inspect the raw response keys.

~~~python
assert set(response.json()) == {"status", "partnerCompleted"}
assert "result" not in response.text
~~~

Then submit both participants concurrently and assert exactly one cached result is stored and both viewers receive equivalent shared scores.

- [ ] **Step 5: Implement API gate and frontend result**

Use separate Pydantic response models for waiting and ready states. Build the score card, progress bar, two type cards, personalized three-column comparisons, conversation topics, share CTA, and 15-minute upsell.

- [ ] **Step 6: Verify and commit**

Run engine tests, gate tests, result page tests, full frontend build, then:

~~~bash
git add apps/backend apps/frontend
git commit -m "feat: unlock light results after both submissions"
~~~

---

### Task 10: 금액 없는 공유 카드와 PNG 저장

**Files:**
- Create: `apps/frontend/src/entities/share-card/model/types.ts`
- Create: `apps/frontend/src/features/download-share-card/lib/to-share-card-model.ts`
- Create: `apps/frontend/src/features/download-share-card/lib/to-share-card-model.test.ts`
- Create: `apps/frontend/src/features/download-share-card/ui/DownloadShareCardButton.tsx`
- Create: `apps/frontend/src/widgets/share-card/ui/ShareCard.tsx`
- Create: `apps/frontend/src/pages/share/ui/SharePage.tsx`
- Create: `apps/frontend/src/pages/share/ui/SharePage.test.tsx`

**Interfaces:**
- Produces: `ShareCardModel = {leftType, rightType, tagline, mutualHitCount, questionCount, ratio}`.
- Produces: `downloadShareCard(element, filename): Promise<void>`.

- [ ] **Step 1: Write a compile-time and runtime privacy test**

~~~ts
const model = toShareCardModel(readyResult, "square");
expect(Object.keys(model).sort()).toEqual([
  "leftType", "mutualHitCount", "questionCount", "ratio", "rightType", "tagline"
]);
expect(JSON.stringify(model)).not.toMatch(/amount|income|debt|saving/i);
~~~

- [ ] **Step 2: Run and confirm failure**

Run `npm run test:frontend -- --run src/features/download-share-card`.

Expected: FAIL because the mapper is absent.

- [ ] **Step 3: Implement the restricted model and card**

Make `ShareCard` accept only `ShareCardModel`, render 9:16 and 1:1 layouts, await `document.fonts.ready`, and call `html-to-image.toPng` with a fixed pixel ratio.

- [ ] **Step 4: Test download behavior**

Mock `toPng` and `HTMLAnchorElement.click`. Assert the generated filename contains no user input and the explanatory privacy copy is visible.

- [ ] **Step 5: Verify and commit**

Run share tests, frontend typecheck and build, then:

~~~bash
git add apps/frontend
git commit -m "feat: download privacy-safe light result cards"
~~~

---

### Task 11: 만료, 보안 헤더, 초대 코드 속도 제한

**Files:**
- Create: `apps/backend/app/core/errors.py`
- Create: `apps/backend/app/core/middleware.py`
- Modify: `apps/backend/app/main.py`
- Modify: `apps/backend/app/repositories/session_repository.py`
- Create: `apps/backend/app/models/rate_limit.py`
- Create: `apps/backend/app/repositories/rate_limit_repository.py`
- Create: `apps/backend/tests/security/test_privacy_guards.py`
- Create: `apps/backend/tests/security/test_expiry.py`
- Create: `apps/backend/tests/security/test_invite_rate_limit.py`
- Create: `apps/frontend/vercel.json`
- Create: `apps/frontend/src/pages/error/ui/SessionErrorPage.tsx`

**Interfaces:**
- Produces: common `ApiError` envelope.
- Produces: `SESSION_EXPIRED` 410 before repository reads sensitive projections.
- Produces: invite lookup limit keyed by HMAC(IP + normalized code) in Mongo TTL collection.

- [ ] **Step 1: Write failing security regression tests**

Assert expired sessions return 410 even while the document still exists, all session/result responses have `no-store`, invalid origins are rejected, invite errors are indistinguishable, and logs captured by `caplog` do not contain tokens or submitted values.

- [ ] **Step 2: Run and confirm failure**

Run `python -m pytest tests/security -v`.

Expected: at least expiry/header/rate-limit tests fail.

- [ ] **Step 3: Implement middleware and error mapping**

Map domain errors to 401/404/409/410/422/429/503, add request IDs, redact sensitive fields, validate allowed origins for mutation methods, and add `Cache-Control: no-store` to sensitive endpoints.

- [ ] **Step 4: Configure frontend security headers**

Set CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a same-origin `/api/(.*)` rewrite to Railway. Allow only the Pretendard font source required by the approved design.

- [ ] **Step 5: Verify and commit**

Run all backend tests and frontend build, then:

~~~bash
git add apps/backend apps/frontend/vercel.json apps/frontend/src/pages/error
git commit -m "feat: enforce expiry and privacy security controls"
~~~

---

### Task 12: 두 브라우저 E2E, 접근성, 반응형 검증

**Files:**
- Create: `apps/frontend/playwright.config.ts`
- Create: `apps/frontend/e2e/light-flow.spec.ts`
- Create: `apps/frontend/e2e/privacy-gate.spec.ts`
- Create: `apps/frontend/e2e/accessibility.spec.ts`
- Create: `apps/frontend/e2e/responsive.spec.ts`
- Modify: `apps/frontend/package.json`

**Interfaces:**
- Produces: `npm --workspace @mirisallim/frontend run test:e2e`.
- Consumes: local MongoDB on 27017, FastAPI on 8000, Vite on 5173.

- [ ] **Step 1: Write the failing two-context journey**

Create isolated A and B browser contexts. A creates a session, B joins the copied invite URL, A submits first and stays locked, B submits, and both result pages show the same mutual score.

- [ ] **Step 2: Add network privacy assertions**

Capture every A response after only A submits and fail if JSON contains keys `answers`, `guesses`, `result`, `type`, or `score` outside A's own-input endpoint.

- [ ] **Step 3: Add accessibility and responsive assertions**

Use `@axe-core/playwright` on each route, keyboard through all controls, test 390px mobile and 1280px desktop, and assert the 900px header switch.

- [ ] **Step 4: Run and fix only observed failures**

Start MongoDB with `docker compose up -d mongo`, backend with `uvicorn app.main:app --port 8000`, then run `npm --workspace @mirisallim/frontend run test:e2e`.

Expected: all journeys pass with zero serious axe violations.

- [ ] **Step 5: Run the full local gate**

Run backend Ruff, mypy, pytest; frontend lint, typecheck, Vitest, build; then Playwright.

Expected: every command exits 0.

- [ ] **Step 6: Commit**

~~~bash
git add apps/frontend/e2e apps/frontend/playwright.config.ts apps/frontend/package.json
git commit -m "test: cover two-participant light flow"
~~~

---

### Task 13: CI, MongoDB Atlas, Railway, Vercel 배포

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `apps/backend/Dockerfile`
- Create: `apps/backend/railway.toml`
- Modify: `.env.example`
- Modify: `apps/frontend/vercel.json`
- Create: `docs/operations/deployment.md`

**Interfaces:**
- Produces: CI checks `frontend`, `backend`, `e2e`.
- Produces: Railway `/health` and Vercel production URL.
- Produces: Atlas indexes `sessions.id`, `sessions.code`, `sessions.expiresAt`, `rate_limits.expiresAt`.

- [ ] **Step 1: Write CI and container smoke checks**

The backend Dockerfile must use Python 3.11, install the project without dev extras, run as a non-root user, and start `uvicorn app.main:app --host 0.0.0.0 --port 8000`. CI must use a MongoDB service container and run every command from Task 12.

- [ ] **Step 2: Build and test the container locally**

Run `docker build -t mirisallim-api apps/backend`, then start it with `docker run --rm -d --name mirisallim-api-smoke -p 8000:8000 --env-file apps/backend/.env.test mirisallim-api`. Verify `GET http://localhost:8000/health` returns 200, then stop only that named container with `docker stop mirisallim-api-smoke`.

- [ ] **Step 3: Create MongoDB Atlas resources**

Create project `mirisallim`, a production cluster, database `mirisallim`, and a least-privilege application user with read/write only on that database. Set the Railway-compatible network rule, store the URI only in Railway, run the idempotent index initializer, and verify:

~~~javascript
db.sessions.getIndexes()
db.rate_limits.getIndexes()
~~~

Expected: unique ID/code indexes and TTL indexes are present.

- [ ] **Step 4: Deploy Railway backend**

Create Railway project `mirisallim` and service `api` from `apps/backend`. Set `MONGODB_URI`, `MONGODB_DATABASE=mirisallim`, a generated 32-byte `PARTICIPANT_TOKEN_PEPPER`, `SESSION_TTL_DAYS=7`, and the eventual Vercel origin. Configure `/health` and verify the public endpoint returns 200.

- [ ] **Step 5: Deploy Vercel frontend**

Create Vercel project `mirisallim` rooted at `apps/frontend`. Set the Railway origin used by the same-origin rewrite, deploy, then update Railway `ALLOWED_ORIGINS` to the exact production Vercel origin.

- [ ] **Step 6: Run production smoke tests**

Run the Playwright smoke project against the Vercel URL using two fresh contexts. Verify session creation, invite join, locked result, simultaneous unlock, PNG download, security headers, and `Cache-Control: no-store`.

- [ ] **Step 7: Document operations and commit**

Document secret rotation, TTL/index inspection, deployment rollback, health checks, and how to revoke the Atlas user without copying any actual secret.

~~~bash
git add .github apps/backend/Dockerfile apps/backend/railway.toml apps/frontend/vercel.json .env.example docs/operations
git commit -m "ci: deploy mirisallim vertical slice"
~~~

---

## 최종 검증 명령

Run all commands from repository root unless a workdir is stated:

~~~text
npm --workspace @mirisallim/frontend run lint
npm --workspace @mirisallim/frontend run typecheck
npm --workspace @mirisallim/frontend run test -- --run
npm --workspace @mirisallim/frontend run build
python -m ruff check .                    (workdir: apps/backend)
python -m mypy app                        (workdir: apps/backend)
python -m pytest -v                       (workdir: apps/backend)
npm --workspace @mirisallim/frontend run test:e2e
git status --short
~~~

완료 조건은 모든 명령이 0으로 종료되고, 프로덕션 Vercel URL에서 두 브라우저 수직 슬라이스가 통과하며, Atlas에 TTL·유니크 인덱스가 확인되고, 미완료 결과 응답에 상대 데이터가 한 필드도 없는 것이다.
