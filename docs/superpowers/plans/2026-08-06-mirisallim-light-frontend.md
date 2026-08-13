# 미리살림 3분 모드 프론트엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 백엔드 OpenAPI 계약만 의존해 랜딩, 가변 질문 입력, 초대·대기, 동시공개 결과와 금액 없는 공유 카드를 제공하는 독립 React 애플리케이션을 구축하고 Vercel에 배포한다.

**Architecture:** React 앱은 FSD의 `app/pages/widgets/features/entities/shared` 계층을 따르고 각 슬라이스는 `index.ts` 공개 API만 노출한다. 서버 상태는 TanStack Query, 미제출 폼 상태는 Zustand와 react-hook-form, API 타입은 FastAPI OpenAPI 생성물로 관리한다.

**Tech Stack:** Node 20+, React 18, Vite, TypeScript, React Router, Tailwind CSS 3, Zustand, TanStack Query 5, react-hook-form, zod, openapi-fetch, openapi-typescript, html-to-image, Vitest, Testing Library, MSW, Playwright, axe-core, Vercel.

## Global Constraints

- FSD 의존 방향은 `app → pages → widgets → features → entities → shared`만 허용한다.
- 서버 DTO를 수동 중복 선언하지 않고 `src/shared/api/schema.d.ts`에서 파생한다.
- 질문 수, 진행률, 저장 배열, 점수 분모를 고정 5로 구현하지 않는다.
- 3분 강조색은 Green `#43A77B`, 예측 영역은 Purple `#8A6FD1`, 배경은 `#FCFCFB`다.
- 전역 Pretendard Variable, `word-break: keep-all`, `focus-visible`, `aria-pressed`를 적용한다.
- 민감한 답과 토큰은 `localStorage`나 `sessionStorage`에 저장하지 않는다. 공개 세션 UUID만 `sessionStorage`에 저장한다.
- 결과 준비 전에는 상대 데이터용 UI 모델을 생성하지 않는다.
- 공유 카드 모델에는 금액 관련 키를 정의하지 않는다.
- 15분 모드는 랜딩에서 `준비 중`으로만 표시한다.

---

## 프론트엔드 파일 지도

~~~text
apps/frontend/
├─ package.json
├─ vite.config.ts
├─ tailwind.config.ts
├─ eslint.config.js
├─ playwright.config.ts
├─ vercel.json
├─ openapi.json
├─ public/images/
└─ src/
   ├─ app/
   │  ├─ providers/
   │  ├─ router/
   │  └─ styles/
   ├─ pages/
   ├─ widgets/
   ├─ features/
   ├─ entities/
   └─ shared/
      ├─ api/
      ├─ assets/
      ├─ config/
      ├─ lib/
      └─ ui/
~~~

---

### F1: Vite 실행 기반, FSD 경계, 디자인 시스템

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `package.json`
- Create: `apps/frontend/package.json`
- Create: `apps/frontend/index.html`
- Create: `apps/frontend/tsconfig.json`
- Create: `apps/frontend/vite.config.ts`
- Create: `apps/frontend/tailwind.config.ts`
- Create: `apps/frontend/postcss.config.cjs`
- Create: `apps/frontend/eslint.config.js`
- Create: `apps/frontend/src/app/main.tsx`
- Create: `apps/frontend/src/app/App.tsx`
- Create: `apps/frontend/src/app/styles/globals.css`
- Create: `apps/frontend/src/shared/config/test-setup.ts`
- Create: `apps/frontend/src/shared/lib/use-window-width.ts`
- Create: `apps/frontend/src/shared/ui/button/Button.tsx`
- Create: `apps/frontend/src/shared/ui/badge/Badge.tsx`
- Create: `apps/frontend/src/shared/ui/pill-toggle/PillToggle.tsx`
- Create: `apps/frontend/src/shared/ui/progress/Progress.tsx`
- Create: `apps/frontend/src/widgets/app-header/ui/AppHeader.tsx`
- Create: `apps/frontend/src/widgets/app-footer/ui/AppFooter.tsx`
- Create: `apps/frontend/src/widgets/app-shell/ui/AppShell.tsx`
- Create: `apps/frontend/src/shared/ui/pill-toggle/PillToggle.test.tsx`
- Copy: user-provided PNG files to `apps/frontend/public/images`

**Interfaces:**
- Produces: `App(): JSX.Element`.
- Produces: `Button`, `Badge`, `PillToggle`, `Progress`, `AppShell` public APIs.
- Produces: `useWindowWidth(): number`.

- [ ] **Step 1: Create workspace and test setup**

Configure npm workspace `@mirisallim/frontend` with scripts `dev`, `lint`, `typecheck`, `test`, `build`, `api:generate`, and `test:e2e`. Configure jsdom, Testing Library matchers, React 18, and Vite.

- [ ] **Step 2: Write failing shared UI tests**

~~~tsx
it("exposes toggle state", () => {
  render(<PillToggle pressed={false} onPressedChange={() => undefined}>선택</PillToggle>);
  expect(screen.getByRole("button", { name: "선택" })).toHaveAttribute("aria-pressed", "false");
});
~~~

Add a `useWindowWidth` test that switches header mode at exactly 900px.

- [ ] **Step 3: Run the tests**

Run `npm --workspace @mirisallim/frontend run test -- --run src/shared`.

Expected: FAIL because UI and hook implementations are absent.

- [ ] **Step 4: Implement tokens and UI**

Register canvas `#FCFCFB`, Green `#43A77B`, Purple `#8A6FD1`, card radius 20px, control radius 14px, fadeup motion, Pretendard CDN, tabular numerals, and Korean word breaking. Buttons are real buttons and toggles expose `aria-pressed`.

- [ ] **Step 5: Enforce FSD**

Configure `eslint-plugin-boundaries` so higher-level imports only flow downward and cross-slice imports resolve through `index.ts`. Verify a forbidden shared-to-feature fixture fails lint, remove the fixture, then verify lint succeeds.

- [ ] **Step 6: Verify and commit**

Run lint, typecheck, focused tests, and build.

~~~bash
git add .gitignore .editorconfig package.json apps/frontend
git commit -m "feat(web): scaffold FSD design system"
~~~

---

### F2: OpenAPI 클라이언트, 앱 프로바이더, 라우터

**Files:**
- Consume: `apps/frontend/openapi.json` from Backend B2
- Create: `apps/frontend/src/shared/api/schema.d.ts`
- Create: `apps/frontend/src/shared/api/client.ts`
- Create: `apps/frontend/src/shared/api/errors.ts`
- Create: `apps/frontend/src/app/providers/AppProviders.tsx`
- Create: `apps/frontend/src/app/router/router.tsx`
- Create: `apps/frontend/src/pages/error/ui/SessionErrorPage.tsx`
- Create: `apps/frontend/src/shared/api/client.test.ts`

**Interfaces:**
- Consumes: Backend B2 OpenAPI snapshot.
- Produces: typed `apiClient` with `baseUrl: "/api/v1"` and `credentials: "include"`.
- Produces: routes `/`, `/light/:step`, `/done`, `/invite/:code`, `/waiting/:sessionId`, `/result/light/:sessionId`, `/result/light/:sessionId/share`.

- [ ] **Step 1: Generate API types**

Run `openapi-typescript openapi.json -o src/shared/api/schema.d.ts`. Add a clean-diff script that generates twice and fails if the second output changes.

- [ ] **Step 2: Write failing API client tests**

Mock fetch and assert requests use `/api/v1`, include credentials, parse the common error envelope, and never retry 401/404/409/410/422/429 mutations automatically.

- [ ] **Step 3: Run the tests**

Run `npm --workspace @mirisallim/frontend run test -- --run src/shared/api/client.test.ts`.

Expected: FAIL because the client wrapper is absent.

- [ ] **Step 4: Implement client and providers**

Create one QueryClient with bounded GET retries and no mutation retries. Wrap RouterProvider and QueryClientProvider in `AppProviders`. Map API error codes to neutral Korean error states without exposing raw server detail.

- [ ] **Step 5: Implement route shells**

Each route initially renders a named page shell through lazy imports. The error page handles unauthorized, expired, unavailable invite, conflict, rate limit, and temporary failure states.

- [ ] **Step 6: Verify and commit**

Run API generation, lint, typecheck, focused tests, and build.

~~~bash
git add apps/frontend
git commit -m "feat(web): add typed API client and routes"
~~~

---

### F3: 랜딩과 세션 시작

**Files:**
- Create: `apps/frontend/src/features/create-session/api/create-session.ts`
- Create: `apps/frontend/src/features/create-session/ui/StartLightButton.tsx`
- Create: `apps/frontend/src/features/create-session/index.ts`
- Create: `apps/frontend/src/pages/landing/ui/LandingPage.tsx`
- Create: `apps/frontend/src/pages/landing/ui/LandingPage.test.tsx`
- Create: `apps/frontend/src/pages/landing/index.ts`
- Modify: `apps/frontend/src/app/router/router.tsx`

**Interfaces:**
- Consumes: `POST /sessions -> SessionCreated` from Backend B3.
- Produces: landing CTA that stores only `activeSessionId` and navigates to `/light/1`.

- [ ] **Step 1: Write failing landing tests**

Assert the exact hero eyebrow, headline, three privacy bullets, both mode cards, four usage steps, provided alt text, and disabled `준비 중` 15-minute CTA.

- [ ] **Step 2: Write failing session-start test**

~~~tsx
await user.click(screen.getByRole("button", { name: /가볍게 맞춰보기/ }));
expect(createSession).toHaveBeenCalledTimes(1);
expect(sessionStorage.getItem("activeSessionId")).toBe("session-a");
expect(router.state.location.pathname).toBe("/light/1");
~~~

- [ ] **Step 3: Run the tests**

Run `npm --workspace @mirisallim/frontend run test -- --run src/pages/landing`.

Expected: FAIL because landing and feature implementations are absent.

- [ ] **Step 4: Implement responsive landing**

Use the provided hero and 3-minute PNGs, object-position/cropping matching the approved framing, border-based cards, Green CTA, inline SVG for the 15-minute card and usage icons, sticky header, and mobile navigation.

- [ ] **Step 5: Implement session mutation**

Generate a client idempotency UUID, call the typed endpoint, store only the public session ID in `sessionStorage`, invalidate active-session query, and navigate only after a 201 response.

- [ ] **Step 6: Verify and commit**

Run landing tests, lint, typecheck, and build.

~~~bash
git add apps/frontend
git commit -m "feat(web): launch light sessions from landing"
~~~

---

### F4: 가변 질문 입력, 자동 저장, 제출, 완료

**Files:**
- Create: `apps/frontend/src/entities/light-question/model/types.ts`
- Create: `apps/frontend/src/entities/light-question/index.ts`
- Create: `apps/frontend/src/entities/light-answer/model/types.ts`
- Create: `apps/frontend/src/features/save-light-answer/model/light-form-store.ts`
- Create: `apps/frontend/src/features/save-light-answer/api/light-input.ts`
- Create: `apps/frontend/src/features/save-light-answer/ui/AnswerGroup.tsx`
- Create: `apps/frontend/src/features/submit-light-form/api/submit-light-form.ts`
- Create: `apps/frontend/src/features/submit-light-form/ui/SubmitLightButton.tsx`
- Create: `apps/frontend/src/widgets/light-question-card/ui/LightQuestionCard.tsx`
- Create: `apps/frontend/src/pages/light-form/ui/LightFormPage.tsx`
- Create: `apps/frontend/src/pages/light-form/ui/LightFormPage.test.tsx`
- Create: `apps/frontend/src/pages/done/ui/DonePage.tsx`
- Create: `apps/frontend/src/pages/done/ui/DonePage.test.tsx`

**Interfaces:**
- Consumes: Backend B2 question set and Backend B4 active-session/input/submit endpoints.
- Produces: `useLightFormStore` with `hydrate`, `setAnswer`, `setGuess`, `setCurrentStep`.
- Produces: `LightFormPage` and `DonePage`.

- [ ] **Step 1: Write failing variable-count tests**

Mock a three-question set. Assert progress displays `1 / 3`, next stops at step 3, save payload arrays have length 3, and score-related UI never renders `/5`.

- [ ] **Step 2: Write failing interaction tests**

Cover Green self-answer chips, Purple guess chips, `aria-pressed`, previous/next, skip to null, reload hydration, save success, `저장되지 않음 · 다시 시도`, and keyboard interaction.

- [ ] **Step 3: Run the tests**

Run `npm --workspace @mirisallim/frontend run test -- --run src/pages/light-form`.

Expected: FAIL because the form does not exist.

- [ ] **Step 4: Implement form state and auto-save**

Fetch active session, its pinned question version, and own input. Keep answers in memory, debounce typed PATCH requests, retain local values on failure, and never write answers or guesses to web storage.

- [ ] **Step 5: Implement submit and done**

The final button reads `입력 완료하기` and waits for success before routing. DonePage shows the invite code, seven-day deletion copy, read-only input link, waiting link, and home link. On 409, hydrate read-only state instead of discarding local data.

- [ ] **Step 6: Verify and commit**

Run focused tests, lint, typecheck, and build.

~~~bash
git add apps/frontend
git commit -m "feat(web): complete variable light questionnaire"
~~~

---

### F5: 초대, 대기, 폴링, 인앱 알림

**Files:**
- Create: `apps/frontend/src/entities/session/model/invitation.ts`
- Create: `apps/frontend/src/features/join-session/api/join-session.ts`
- Create: `apps/frontend/src/features/join-session/ui/JoinSessionButton.tsx`
- Create: `apps/frontend/src/features/poll-session-status/api/session-status.ts`
- Create: `apps/frontend/src/features/poll-session-status/model/use-session-status.ts`
- Create: `apps/frontend/src/features/send-nudge/api/send-nudge.ts`
- Create: `apps/frontend/src/widgets/waiting-status/ui/WaitingStatus.tsx`
- Create: `apps/frontend/src/pages/invite/ui/InvitePage.tsx`
- Create: `apps/frontend/src/pages/invite/ui/InvitePage.test.tsx`
- Create: `apps/frontend/src/pages/waiting/ui/WaitingPage.tsx`
- Create: `apps/frontend/src/pages/waiting/ui/WaitingPage.test.tsx`

**Interfaces:**
- Consumes: Backend B5 invitation, join, status, and nudge endpoints.
- Produces: `useSessionStatus(sessionId)` with 3000ms polling only while waiting.

- [ ] **Step 1: Write failing InvitePage tests**

Assert generic partner copy, mode/duration badge, simultaneous-release explanation, current-data privacy copy, unavailable-code state, and successful join navigation to `/light/1`.

- [ ] **Step 2: Write failing WaitingPage tests**

Cover partner-not-joined, partner-entering, ready, expired, and nudge-rate-limited states. Assert locked preview icons disappear only when ready and copy feedback changes to `복사됨` for 1.6 seconds.

- [ ] **Step 3: Run the tests**

Run `npm --workspace @mirisallim/frontend run test -- --run src/pages/invite src/pages/waiting`.

Expected: FAIL because invite and waiting pages are absent.

- [ ] **Step 4: Implement invite participation**

Preview the code without storing it, send a client idempotency key on join, store only returned public session ID, and rely on the backend cookie for authentication.

- [ ] **Step 5: Implement waiting and nudge**

TanStack Query polls every 3000ms only while not ready and stops on unmount/ready. Before partner join, show link re-share instead of nudge. After join, allow the nudge mutation and map 429 to the next-available explanation.

- [ ] **Step 6: Verify and commit**

Run focused tests, lint, typecheck, and build.

~~~bash
git add apps/frontend
git commit -m "feat(web): join and wait for partner"
~~~

---

### F6: 동시공개 결과 화면

**Files:**
- Create: `apps/frontend/src/entities/light-result/model/types.ts`
- Create: `apps/frontend/src/features/get-light-result/api/get-light-result.ts`
- Create: `apps/frontend/src/features/get-light-result/index.ts`
- Create: `apps/frontend/src/widgets/result-summary/ui/ResultSummary.tsx`
- Create: `apps/frontend/src/widgets/result-comparison/ui/ResultComparison.tsx`
- Create: `apps/frontend/src/widgets/result-topics/ui/ResultTopics.tsx`
- Create: `apps/frontend/src/pages/light-result/ui/LightResultPage.tsx`
- Create: `apps/frontend/src/pages/light-result/ui/LightResultPage.test.tsx`

**Interfaces:**
- Consumes: Backend B6 `WaitingResultResponse | ReadyResultResponse`.
- Produces: a waiting redirect/state without constructing result entities, or a ready result UI using dynamic `questionCount`.

- [ ] **Step 1: Write failing discriminated-response tests**

For `status: waiting`, assert no type card, score, comparison, or partner answer appears and the page routes to waiting. For `status: ready`, assert the result is rendered.

- [ ] **Step 2: Write failing dynamic-score tests**

Mock `mutualHitCount=4` and `questionCount=7`. Assert `4 / 7` and a width derived from `4/7`, not a hardcoded denominator.

- [ ] **Step 3: Run the tests**

Run `npm --workspace @mirisallim/frontend run test -- --run src/pages/light-result`.

Expected: FAIL because the result page is absent.

- [ ] **Step 4: Implement result widgets**

Render the result badge/header, score card, progress, two neutral type cards, personalized three-column comparisons, gap topics, share CTA, and 15-minute upsell. Use Green for self and Purple for partner without value hierarchy.

- [ ] **Step 5: Add privacy assertions**

Inspect the waiting mock's accessible tree and rendered HTML for partner answer strings. Assert neither exists before ready. Do not persist ready result in local storage.

- [ ] **Step 6: Verify and commit**

Run focused tests, lint, typecheck, and build.

~~~bash
git add apps/frontend
git commit -m "feat(web): render simultaneous light results"
~~~

---

### F7: 개인정보 제한 공유 카드

**Files:**
- Create: `apps/frontend/src/entities/share-card/model/types.ts`
- Create: `apps/frontend/src/features/download-share-card/lib/to-share-card-model.ts`
- Create: `apps/frontend/src/features/download-share-card/lib/to-share-card-model.test.ts`
- Create: `apps/frontend/src/features/download-share-card/ui/DownloadShareCardButton.tsx`
- Create: `apps/frontend/src/widgets/share-card/ui/ShareCard.tsx`
- Create: `apps/frontend/src/pages/share/ui/SharePage.tsx`
- Create: `apps/frontend/src/pages/share/ui/SharePage.test.tsx`

**Interfaces:**
- Consumes: ready light result from F6.
- Produces: `ShareCardModel = {leftType, rightType, tagline, mutualHitCount, questionCount, ratio}`.
- Produces: 9:16 or 1:1 PNG download.

- [ ] **Step 1: Write failing model privacy tests**

~~~ts
const model = toShareCardModel(readyResult, "square");
expect(Object.keys(model).sort()).toEqual([
  "leftType",
  "mutualHitCount",
  "questionCount",
  "ratio",
  "rightType",
  "tagline"
]);
expect(JSON.stringify(model)).not.toMatch(/amount|income|debt|saving/i);
~~~

- [ ] **Step 2: Run the tests**

Run `npm --workspace @mirisallim/frontend run test -- --run src/features/download-share-card`.

Expected: FAIL because the restricted mapper is absent.

- [ ] **Step 3: Implement model and ratios**

Make `ShareCard` accept only `ShareCardModel`. Render exact 9:16 and 1:1 frames with service logo, two types, neutral tagline, score, service slogan, and domain.

- [ ] **Step 4: Implement tested PNG download**

Await `document.fonts.ready`, call `html-to-image.toPng` with fixed pixel ratio, create a local anchor, and download a filename that contains no user input. Mock both the renderer and click in tests.

- [ ] **Step 5: Verify privacy copy**

Assert `금액, 부채, 저축액 같은 재무 정보는 카드에 담기지 않아요` is visible and the rendered card has no hidden amount text.

- [ ] **Step 6: Verify and commit**

Run focused tests, lint, typecheck, and build.

~~~bash
git add apps/frontend
git commit -m "feat(web): download privacy-safe result cards"
~~~

---

### F8: E2E, 접근성, 보안 헤더, Vercel

**Files:**
- Create: `apps/frontend/playwright.config.ts`
- Create: `apps/frontend/e2e/light-flow.spec.ts`
- Create: `apps/frontend/e2e/privacy-gate.spec.ts`
- Create: `apps/frontend/e2e/accessibility.spec.ts`
- Create: `apps/frontend/e2e/responsive.spec.ts`
- Create: `apps/frontend/vercel.json`
- Create: `.github/workflows/frontend.yml`
- Create: `docs/operations/frontend-deployment.md`
- Modify: `apps/frontend/package.json`

**Interfaces:**
- Produces: GitHub check `frontend`.
- Produces: `npm --workspace @mirisallim/frontend run test:e2e`.
- Produces: Vercel production frontend with same-origin `/api` rewrite.

- [ ] **Step 1: Write two-browser E2E**

Create independent A and B contexts. Exercise landing, session creation, all questions, invite join, A-first lock, B submit, simultaneous result, and PNG download.

- [ ] **Step 2: Add network privacy checks**

Capture A's responses after only A submits. Fail if any non-own-input response contains `answers`, `guesses`, `result`, `type`, or `score`.

- [ ] **Step 3: Add accessibility and responsive checks**

Run `@axe-core/playwright` on all routes, keyboard through every control, test 390px and 1280px viewports, and assert header navigation switches at 900px.

- [ ] **Step 4: Configure frontend CI and headers**

CI runs OpenAPI generation clean-diff, ESLint/FSD, TypeScript, Vitest, build, and Playwright. Vercel sets CSP, HSTS, `nosniff`, `Referrer-Policy: no-referrer`, and rewrites `/api/(.*)` to Railway.

- [ ] **Step 5: Deploy and smoke test Vercel**

Create Vercel project `mirisallim` rooted at `apps/frontend`, set the Railway origin used by the rewrite, deploy, then run the Playwright smoke project against the exact production URL.

- [ ] **Step 6: Document and commit**

Document preview/prod environment separation, rewrite validation, CSP maintenance, Vercel rollback, and production smoke commands.

~~~bash
git add apps/frontend .github/workflows/frontend.yml docs/operations/frontend-deployment.md
git commit -m "ci(web): deploy frontend to Vercel"
~~~

---

## 프론트엔드 최종 검증

~~~text
npm --workspace @mirisallim/frontend run api:generate
npm --workspace @mirisallim/frontend run lint
npm --workspace @mirisallim/frontend run typecheck
npm --workspace @mirisallim/frontend run test -- --run
npm --workspace @mirisallim/frontend run build
npm --workspace @mirisallim/frontend run test:e2e
~~~

모든 명령이 0으로 종료되고 Vercel 프로덕션 URL에서 두 브라우저 흐름, 접근성, 390px/1280px 반응형, 공유 PNG가 확인되기 전에는 프론트엔드 트랙을 완료로 표시하지 않는다.
