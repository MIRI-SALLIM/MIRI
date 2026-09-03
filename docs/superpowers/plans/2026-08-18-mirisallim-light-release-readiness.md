# 미리살림 F8 릴리스 준비 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** F1~F7의 전체 3분 모드 흐름을 실제 API 기반 Playwright로 검증하고, 접근성·반응형·개인정보 회귀를 CI로 고정한 뒤 Vercel 배포와 프로덕션 smoke test가 가능한 상태로 만든다.

**Architecture:** Playwright가 FastAPI와 Vite를 함께 기동하고 두 개의 독립 BrowserContext로 실제 쿠키·세션 흐름을 검증한다. GitHub Actions에서는 MongoDB service를 사용하고, 로컬에서는 명시적으로 MongoDB E2E를 선택하지 않은 경우 backend의 test-memory 모드로 같은 HTTP 계약을 실행한다. Vercel은 브라우저가 항상 same-origin `/api/v1/...`만 호출하도록 실제 backend origin으로 rewrite한다.

**Tech Stack:** Playwright, @axe-core/playwright, React 18, Vite 8, FastAPI, MongoDB, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-05-mirisallim-light-vertical-slice-design.md`

## Agent Execution Policy

- Implementer for every task: `gpt-5.6-luna` with `xhigh` reasoning effort.
- Task reviewer, scoped re-reviewer, and final whole-branch reviewer: `gpt-5.6-sol` with `high` reasoning effort.
- The current primary `gpt-5.6-sol` agent is the supervisor. It owns planning, dispatch, review adjudication, progress ledger, and verification, but does not write implementation code.
- Implementation tasks run sequentially. A later task starts only after the Sol reviewer approves the preceding task or the supervisor completes the documented fix loop.

## Global Constraints

- F7이 `develop`에 병합된 뒤 최신 `develop`에서 F8 브랜치를 만든다.
- 프론트 코드의 API 호출 경로는 same-origin `/api/v1/...`로 유지한다.
- Playwright A와 B는 서로 다른 `BrowserContext`를 사용한다.
- A만 제출한 시점의 결과 응답 키는 정확히 `partnerCompleted`, `status` 두 개뿐이다.
- 네트워크·DOM·접근성 트리·web storage·공유 PNG에 준비 전 상대 데이터나 금액 정보가 없어야 한다.
- 뷰포트는 390px, 899px, 900px, 1280px를 검증한다.
- Vercel에는 CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`를 적용한다.
- 실제 backend origin은 supervisor가 운영 상태를 확인한 literal HTTPS URL만 사용한다. Render/Railway를 추측해 커밋하지 않는다.
- Vercel 프로젝트 생성, 환경 변수 변경, 프로덕션 배포, GitHub push/PR은 supervisor가 사용자 승인 범위를 확인한 뒤 수행한다.
- 비밀값, 쿠키, 답변, 예측, 결과 payload를 CI 로그나 artifact에 기록하지 않는다.

---

### Task 1: Playwright 실행 기반과 서버 수명주기

**Files:**
- Create: `apps/frontend/playwright.config.ts`
- Create: `apps/frontend/e2e/support/light-flow.ts`
- Create: `apps/frontend/e2e/smoke.spec.ts`
- Modify: `apps/frontend/package.json`

**Interfaces:**
- Consumes: backend command `python -m uvicorn main:app --host 127.0.0.1 --port 8000` from `apps/backend` and Vite proxy target `MIRISALLIM_API_PROXY_TARGET`.
- Produces: `test:e2e`, `test:e2e:smoke`, `PLAYWRIGHT_BASE_URL`, `MIRISALLIM_E2E_USE_MONGO`, and reusable role-based flow helpers.

- [x] **Step 1: Add the scripts and a failing smoke test**

Set scripts to:

```json
{
  "test:e2e": "playwright test",
  "test:e2e:smoke": "playwright test e2e/smoke.spec.ts"
}
```

The smoke test opens `/`, checks the heading `돈 이야기, 다투기 전에 맞춰봐요`, and asserts no horizontal overflow at 390px.

- [x] **Step 2: Run the smoke test and verify RED**

Run: `npm.cmd --workspace @mirisallim/frontend run test:e2e:smoke`

Expected: FAIL because Playwright config and managed web servers do not exist.

- [x] **Step 3: Implement Playwright config**

The config must:

- use `e2e` as `testDir`;
- use `http://127.0.0.1:4173` unless `PLAYWRIGHT_BASE_URL` is set;
- start backend from `../backend` and Vite from `apps/frontend` only when no external base URL is supplied;
- set backend `ENVIRONMENT=test` for local memory E2E, or `ENVIRONMENT=development` when `MIRISALLIM_E2E_USE_MONGO=1`;
- pass `MONGODB_URI`, `MONGODB_DATABASE`, and `PARTICIPANT_TOKEN_PEPPER` through without printing them;
- configure CI retries to 2 and local retries to 0;
- retain trace, screenshot, and video only on failure;
- define `desktop-chromium` at 1280×900 and `mobile-chromium` at 390×844.

The Vite web server command is:

```text
npm run dev -- --host 127.0.0.1 --port 4173
```

with `MIRISALLIM_API_PROXY_TARGET=http://127.0.0.1:8000`.

- [x] **Step 4: Add deterministic flow helpers**

`e2e/support/light-flow.ts` exports:

```ts
export async function startLightSession(page: Page): Promise<void>;
export async function joinInvitation(page: Page, invitationUrl: string): Promise<void>;
export async function answerEveryQuestion(page: Page): Promise<void>;
export async function submitLightForm(page: Page): Promise<void>;
```

Helpers use accessible names only: `가볍게 맞춰보기`, `참여하고 시작하기`, groups `내 답` and `상대 예측`, buttons `첫 번째 선택`, `두 번째 선택`, `다음`, `입력 완료하기`. They derive the question count from the rendered progress and loop until the submit button appears; they do not hardcode five questions.

- [x] **Step 5: Run smoke and commit**

Run:

```text
npm.cmd --workspace @mirisallim/frontend run test:e2e:smoke
npm.cmd --workspace @mirisallim/frontend run lint
npm.cmd --workspace @mirisallim/frontend run typecheck
```

Expected: all commands exit 0.

Commit:

```text
git add apps/frontend/playwright.config.ts apps/frontend/e2e apps/frontend/package.json
git commit -m "test(web): add playwright runtime"
```

---

### Task 2: 두 브라우저 전체 흐름과 동시공개 프라이버시

**Files:**
- Create: `apps/frontend/e2e/light-flow.spec.ts`
- Create: `apps/frontend/e2e/privacy-gate.spec.ts`
- Modify: `apps/frontend/e2e/support/light-flow.ts`

**Interfaces:**
- Consumes: Task 1 flow helpers and actual FastAPI HTTP responses.
- Produces: A/B end-to-end regression and strict waiting-response privacy assertions.

- [x] **Step 1: Write the full-flow test**

Create one Chromium browser with two independent contexts `contextA` and `contextB`.

1. A starts a session and completes its form.
2. A obtains the invitation URL from the submitted session UI/API without copying cookies between contexts.
3. B opens the invitation URL and joins.
4. A submits first and reaches the waiting state.
5. B completes and submits.
6. Both users reach `라이트 결과` within the polling window.
7. Both pages show the same `서로 맞힌 답` numerator and denominator.
8. A opens `결과 공유`, selects both ratios, and verifies a PNG download event.

- [x] **Step 2: Write the network privacy test**

Register a response listener for A before the first submission. At the result endpoint, parse JSON in memory and assert:

```ts
expect(Object.keys(body).sort()).toEqual(["partnerCompleted", "status"]);
expect(body).toEqual({ partnerCompleted: false, status: "waiting" });
expect(JSON.stringify(body)).not.toMatch(/answers|guesses|result|type|score/i);
```

Also assert A's DOM and accessibility-visible text do not contain a sentinel partner answer before B submits, and that local/session storage contain no answers, guesses, result, type, score, nickname, or participant token values.

- [x] **Step 3: Run the new specs and verify failures identify real gaps**

Run:

```text
npm.cmd --workspace @mirisallim/frontend run test:e2e -- e2e/light-flow.spec.ts
npm.cmd --workspace @mirisallim/frontend run test:e2e -- e2e/privacy-gate.spec.ts
```

Expected before helper completion: FAIL at the first missing flow integration or download assertion, not at Playwright startup.

- [x] **Step 4: Implement only the helper changes needed by the tests**

Keep all endpoint payload inspection inside the test process. Do not attach response bodies, cookies, trace annotations, or user inputs to test output. Wait for readiness using UI/response conditions with a 10-second assertion timeout; do not add fixed sleeps.

- [x] **Step 5: Run specs and commit**

Run both focused specs until they exit 0, then:

```text
git add apps/frontend/e2e/light-flow.spec.ts apps/frontend/e2e/privacy-gate.spec.ts apps/frontend/e2e/support/light-flow.ts
git commit -m "test(web): cover two-party privacy flow"
```

---

### Task 3: 접근성과 반응형 자동화

**Files:**
- Create: `apps/frontend/e2e/accessibility.spec.ts`
- Create: `apps/frontend/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: Task 1 flow helpers and `AxeBuilder` from `@axe-core/playwright`.
- Produces: route-level axe, keyboard, and viewport regression coverage.

- [x] **Step 1: Write accessibility tests**

Run axe after each reachable route state: landing, light form, done, invite, waiting, ready result, share. Fail on `serious` and `critical` violations. Add keyboard assertions for:

- Enter on `가볍게 맞춰보기`;
- Space on answer/guess buttons and `aria-pressed` changes;
- Tab reachability of `이전`, `다음`, `입력 완료하기`;
- ratio buttons on SharePage;
- visible focus outline through computed `outline-style` and `outline-width`.

- [x] **Step 2: Write responsive tests**

At 390×844 and 1280×900, assert `document.documentElement.scrollWidth <= window.innerWidth` on landing, light form, result, and share. At 899px the `주요 메뉴` navigation is absent; at 900px it is present. On desktop, result type cards form two columns and question comparison forms three columns; on mobile each becomes one column.

- [x] **Step 3: Run focused tests and fix only confirmed UI failures**

Run:

```text
npm.cmd --workspace @mirisallim/frontend run test:e2e -- e2e/accessibility.spec.ts
npm.cmd --workspace @mirisallim/frontend run test:e2e -- e2e/responsive.spec.ts
```

Any production-code fix must receive a focused Vitest regression in the owning slice before changing the implementation.

- [x] **Step 4: Commit**

```text
git add apps/frontend/e2e apps/frontend/src
git commit -m "test(web): enforce accessibility and responsive gates"
```

---

### Task 4: Frontend GitHub Actions

**Files:**
- Create: `.github/workflows/frontend.yml`

**Interfaces:**
- Consumes: npm scripts, Python `apps/backend/requirements.txt`, Playwright config, MongoDB service.
- Produces: GitHub check named `frontend`.

- [x] **Step 1: Add the workflow**

Trigger on pull requests and pushes to `develop` when frontend, backend contract, lockfile, or workflow files change. Configure Node 20, Python 3.11, npm cache, and a `mongo:8` service with health checks.

The job sequence is exactly:

```text
npm ci
python -m pip install -r apps/backend/requirements.txt
npx playwright install --with-deps chromium
npm.cmd --workspace @mirisallim/frontend run api:check
npm.cmd --workspace @mirisallim/frontend run lint
npm.cmd --workspace @mirisallim/frontend run typecheck
npm.cmd --workspace @mirisallim/frontend run test -- --run
npm.cmd --workspace @mirisallim/frontend run build
npm.cmd --workspace @mirisallim/frontend run test:e2e
```

In YAML use portable `npm`, not Windows-only `npm.cmd`. Set `CI=true`, `MIRISALLIM_E2E_USE_MONGO=1`, `MONGODB_URI=mongodb://127.0.0.1:27017`, `MONGODB_DATABASE=mirisallim_e2e`, and a non-production test pepper. Upload `playwright-report` and `test-results` only on failure with a seven-day retention.

- [x] **Step 2: Validate locally**

Parse the YAML and run the frontend command sequence locally. If Docker/MongoDB is unavailable, run the complete memory-mode E2E and record Mongo-backed CI validation as pending until the first GitHub run; do not report Gate 5 passed.

- [x] **Step 3: Commit**

```text
git add .github/workflows/frontend.yml
git commit -m "ci(web): verify frontend release readiness"
```

---

### Task 5: Vercel rewrite와 보안 헤더

**Files:**
- Create: `apps/frontend/vercel.json`
- Create: `apps/frontend/src/shared/config/vercel-config.test.ts`

**Interfaces:**
- Consumes: supervisor-confirmed production backend HTTPS origin.
- Produces: same-origin `/api` rewrite, SPA fallback, CSP, HSTS, nosniff, no-referrer.

- [x] **Step 1: Resolve the deployment gate**

Supervisor verifies one actual backend URL by requesting `/health` and confirming HTTP 200 from the intended production service. If neither a Render nor Railway production URL is known and healthy, stop this task before editing `vercel.json`; local F8 work may continue but production deployment remains blocked.

- [x] **Step 2: Write a failing config test**

Read `vercel.json` and assert:

- `/api/(.*)` is rewritten before `/(.*)` SPA fallback;
- destination starts with the verified literal `https://` origin and ends with `/api/$1`;
- all routes receive CSP, HSTS, `X-Content-Type-Options=nosniff`, and `Referrer-Policy=no-referrer`;
- CSP contains `default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `img-src 'self' data: blob:`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and the existing jsDelivr font/style source.

- [x] **Step 3: Run the test and verify RED**

Run: `npm.cmd --workspace @mirisallim/frontend run test -- --run src/shared/config/vercel-config.test.ts`

Expected: FAIL because `vercel.json` does not exist.

- [x] **Step 4: Implement config and verify**

Write the confirmed backend origin as a literal rewrite destination. Use HSTS `max-age=31536000; includeSubDomains`. Run the config test, full Vitest, and production build.

- [x] **Step 5: Commit**

```text
git add apps/frontend/vercel.json apps/frontend/src/shared/config/vercel-config.test.ts
git commit -m "chore(web): configure vercel security and api rewrite"
```

---

### Task 6: 운영 문서, 프로덕션 배포, smoke test

**Files:**
- Create: `docs/operations/frontend-deployment.md`
- Create: `apps/frontend/e2e/production-smoke.spec.ts`

**Interfaces:**
- Consumes: merged F8 branch, verified backend origin, Vercel project `mirisallim` rooted at `apps/frontend`.
- Produces: repeatable preview/prod deployment, rollback instructions, and production URL smoke evidence.

- [x] **Step 1: Write the operations document**

Document:

- local Vite proxy and `MIRISALLIM_API_PROXY_TARGET=http://127.0.0.1:8000`;
- preview versus production separation;
- Vercel root directory `apps/frontend`;
- backend rewrite verification with browser network logs and a redacted `curl -I` example;
- CSP maintenance and font/image allowances;
- deployment rollback to the previous Vercel deployment;
- production smoke command using `PLAYWRIGHT_BASE_URL`;
- exact rule that secrets, cookies, and response bodies are never copied into the document.

- [x] **Step 2: Add production smoke coverage**

The smoke spec uses an externally supplied `PLAYWRIGHT_BASE_URL`, does not start local web servers, and verifies landing, A/B session creation/join through same-origin `/api/v1`, simultaneous result, share preview, PNG download, no serious/critical axe violations, and the four security headers. Backend `/health` is verified separately against the confirmed backend origin because the frontend rewrite intentionally exposes only `/api/*` application routes.

- [x] **Step 3: Run the complete local gate**

Run:

```text
npm.cmd --workspace @mirisallim/frontend run api:check
npm.cmd --workspace @mirisallim/frontend run lint
npm.cmd --workspace @mirisallim/frontend run typecheck
npm.cmd --workspace @mirisallim/frontend run test -- --run
npm.cmd --workspace @mirisallim/frontend run build
npm.cmd --workspace @mirisallim/frontend run test:e2e
```

Expected: all local commands exit 0. This does not yet prove production deployment.

- [x] **Step 4: Commit local release readiness**

```text
git add apps/frontend .github/workflows/frontend.yml docs/operations/frontend-deployment.md
git commit -m "ci(web): complete release readiness"
```

- [x] **Step 5: External deployment approval gate**

After supervisor confirms user authorization, create or update Vercel project `mirisallim`, set root directory `apps/frontend`, deploy preview, inspect headers/rewrite, then promote the verified build to production. Update backend `ALLOWED_ORIGINS` to the exact Vercel production origin only through the backend owner's approved process.

- [ ] **Step 6: Run production smoke**

**아직 실행하지 않았다.** 2026-09-03 실행 중 이슈 #24(대기 중 결과 URL 방문 후 결과 보기가 되튕김)로 중단됐다. 그 수정(PR #25)과 후속 4건(PR #29·#30·#31·#35)이 `develop`에 병합되고 프로덕션에 배포된 지금 재실행 가능하다. 이 스텝이 F8에 남은 유일한 작업이다.

Set `PLAYWRIGHT_BASE_URL` to the exact Vercel production URL and run:

```text
npm.cmd --workspace @mirisallim/frontend run test:e2e:smoke
npx.cmd playwright test e2e/production-smoke.spec.ts
```

Record only command exit codes, test counts, production host, and header names. Do not record cookies or response bodies.

## F8 Completion Gate

- GitHub check `frontend` passes with MongoDB-backed E2E.
- Local and CI api:check, lint, typecheck, Vitest, build, and Playwright exit 0.
- Vercel production serves the SPA and rewrites `/api/v1/...` to the confirmed backend.
- CSP, HSTS, nosniff, and no-referrer are present.
- Production A/B flow, simultaneous privacy gate, accessibility, responsive checks, and PNG download pass.
- Until production evidence exists, report `Frontend: F7/8 completed, current F8` rather than `F8/8 completed`.
