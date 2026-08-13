# 미리살림 3분 모드 프론트엔드 구현 계획

> **에이전트 작업자 안내:** 필수 서브스킬 — 이 계획을 태스크 단위로 실행할 때는 superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans를 사용한다. 각 스텝은 체크박스(`- [ ]`) 문법으로 진행 상황을 추적한다.

**목표:** 백엔드 OpenAPI 계약만 의존해 랜딩, 가변 질문 입력, 초대·대기, 동시공개 결과와 금액 없는 공유 카드를 제공하는 독립 React 애플리케이션을 구축하고 Vercel에 배포한다.

**아키텍처:** React 앱은 FSD의 `app/pages/widgets/features/entities/shared` 계층을 따르고 각 슬라이스는 `index.ts` 공개 API만 노출한다. 서버 상태는 TanStack Query, 미제출 폼 상태는 Zustand와 react-hook-form, API 타입은 FastAPI OpenAPI 생성물로 관리한다.

**기술 스택:** Node 20+, React 18, Vite, TypeScript, React Router, Tailwind CSS 3, Zustand, TanStack Query 5, react-hook-form, zod, openapi-fetch, openapi-typescript, html-to-image, Vitest, Testing Library, MSW, Playwright, axe-core, Vercel.

## 전역 제약사항

- FSD 의존 방향은 `app → pages → widgets → features → entities → shared`만 허용한다.
- 서버 DTO를 수동 중복 선언하지 않고 `src/shared/api/schema.d.ts`에서 파생한다.
- 질문 수, 진행률, 저장 배열, 점수 분모를 고정 5로 구현하지 않는다.
- 3분 강조색은 Green `#43A77B`, 예측 영역은 Purple `#8A6FD1`, 배경은 `#FCFCFB`다.
- 전역 Pretendard Variable, `word-break: keep-all`, `focus-visible`, `aria-pressed`를 적용한다.
- 민감한 답과 토큰은 `localStorage`나 `sessionStorage`에 저장하지 않는다. 공개 세션 UUID만 `sessionStorage`에 저장한다.
- 결과 준비 전에는 상대 데이터용 UI 모델을 생성하지 않는다.
- 공유 카드 모델에는 금액 관련 키를 정의하지 않는다.
- 15분 모드는 랜딩에서 `준비 중`으로만 표시한다.

**계약 편차 메모 (2026-08-13, 백엔드 `develop` 브랜치 `de07aff` 커밋, PR #3 병합 반영):** 백엔드 계약이 여전히 아래 3가지 지점에서 원래 설계(스펙 2.3 등)와 다르다. 백엔드 수정을 기다리지 않고 프론트엔드 구현을 현재 계약에 맞춘다. 계약이 추후 바뀌면 F2/F3/F8의 해당 스텝을 다시 조정한다.
1. `POST /api/v1/sessions`가 `nickname`(1–20자, 필수)과 `mode`("light" 고정 기본값)를 요구한다. F3는 익명 무기명 진입이 아니라 닉네임 입력 스텝을 포함해야 한다.
2. OpenAPI 계약에 이번 사이클 범위 밖 엔드포인트(`/deep/questions`, `/calculate/light`, `/config/{config_type}`, `/validate/input`)와 타입(`SurplusResult`, `TypeClassificationResult` 등)이 함께 노출된다. F2는 실제로 호출하는 엔드포인트만의 명시적 화이트리스트를 유지한다.
3. 백엔드 CORS 기본 오리진이 Render(`https://mirisalim-backend.onrender.com`)를 가리킨다. F8은 Vercel rewrite 대상을 확정하기 전에 실제 배포 오리진(Render 또는 Railway)을 인프라 담당자와 재확인한다.

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

**파일:**
- 생성: `.gitignore`
- 생성: `.editorconfig`
- 생성: `package.json`
- 생성: `apps/frontend/package.json`
- 생성: `apps/frontend/index.html`
- 생성: `apps/frontend/tsconfig.json`
- 생성: `apps/frontend/vite.config.ts`
- 생성: `apps/frontend/tailwind.config.ts`
- 생성: `apps/frontend/postcss.config.cjs`
- 생성: `apps/frontend/eslint.config.js`
- 생성: `apps/frontend/src/app/main.tsx`
- 생성: `apps/frontend/src/app/App.tsx`
- 생성: `apps/frontend/src/app/styles/globals.css`
- 생성: `apps/frontend/src/shared/config/test-setup.ts`
- 생성: `apps/frontend/src/shared/lib/use-window-width.ts`
- 생성: `apps/frontend/src/shared/ui/button/Button.tsx`
- 생성: `apps/frontend/src/shared/ui/badge/Badge.tsx`
- 생성: `apps/frontend/src/shared/ui/pill-toggle/PillToggle.tsx`
- 생성: `apps/frontend/src/shared/ui/progress/Progress.tsx`
- 생성: `apps/frontend/src/widgets/app-header/ui/AppHeader.tsx`
- 생성: `apps/frontend/src/widgets/app-footer/ui/AppFooter.tsx`
- 생성: `apps/frontend/src/widgets/app-shell/ui/AppShell.tsx`
- 생성: `apps/frontend/src/shared/ui/pill-toggle/PillToggle.test.tsx`
- 복사: 사용자가 제공한 PNG 파일을 `apps/frontend/public/images`로

**인터페이스:**
- 산출물: `App(): JSX.Element`.
- 산출물: `Button`, `Badge`, `PillToggle`, `Progress`, `AppShell` 공개 API.
- 산출물: `useWindowWidth(): number`.

- [ ] **Step 1: 워크스페이스와 테스트 설정 구성**

`dev`, `lint`, `typecheck`, `test`, `build`, `api:generate`, `test:e2e` 스크립트를 갖춘 npm 워크스페이스 `@mirisallim/frontend`를 구성한다. jsdom, Testing Library matcher, React 18, Vite를 설정한다.

- [ ] **Step 2: 실패하는 공유 UI 테스트 작성**

~~~tsx
it("exposes toggle state", () => {
  render(<PillToggle pressed={false} onPressedChange={() => undefined}>선택</PillToggle>);
  expect(screen.getByRole("button", { name: "선택" })).toHaveAttribute("aria-pressed", "false");
});
~~~

정확히 900px에서 헤더 모드가 전환되는지 검증하는 `useWindowWidth` 테스트를 추가한다.

- [ ] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/shared`를 실행한다.

예상 결과: UI와 훅 구현이 없으므로 FAIL.

- [ ] **Step 4: 토큰과 UI 구현**

캔버스 `#FCFCFB`, Green `#43A77B`, Purple `#8A6FD1`, 카드 radius 20px, 컨트롤 radius 14px, fadeup 모션, Pretendard CDN, tabular numerals, 한글 word breaking을 등록한다. 버튼은 실제 button 요소를 사용하고 토글은 `aria-pressed`를 노출한다.

- [ ] **Step 5: FSD 경계 강제**

상위 계층 import가 아래 방향으로만 흐르고 슬라이스 간 import는 `index.ts`를 통해서만 해석되도록 `eslint-plugin-boundaries`를 구성한다. shared→feature로 금지된 import를 시도하는 fixture가 lint에서 실패하는지 확인한 뒤, fixture를 제거하고 lint가 통과하는지 확인한다.

- [ ] **Step 6: 검증 및 커밋**

lint, typecheck, 포커스 테스트, build를 실행한다.

~~~bash
git add .gitignore .editorconfig package.json apps/frontend
git commit -m "feat(web): scaffold FSD design system"
~~~

---

### F2: OpenAPI 클라이언트, 앱 프로바이더, 라우터

**파일:**
- 소비: 백엔드 B2가 제공하는 `apps/frontend/openapi.json` (읽기 전용 스냅샷. 프론트엔드에서 수정하거나 다시 뽑지 않는다)
- 생성: `apps/frontend/src/shared/api/schema.d.ts` (생성물. 수동 편집 금지)
- 생성: `apps/frontend/src/shared/api/client.ts`
- 생성: `apps/frontend/src/shared/api/errors.ts`
- 생성: `apps/frontend/src/shared/api/allowed-operations.ts`
- 생성: `apps/frontend/src/shared/api/index.ts` — 필수. F1이 설정한 `boundaries/dependencies` 정책이 슬라이스 간 import를 `index.ts` 공개 API로만 허용하므로, 이 파일이 없으면 `app`/`pages`에서 `apiClient`를 import할 때 lint가 error로 막는다.
- 생성: `apps/frontend/src/app/providers/AppProviders.tsx`
- 생성: `apps/frontend/src/app/router/router.tsx`
- 생성: `apps/frontend/src/pages/error/ui/SessionErrorPage.tsx`
- 생성: `apps/frontend/src/pages/error/index.ts`
- 생성: 라우트 7개용 페이지 셸과 각 슬라이스의 `index.ts` — `pages/landing`, `pages/light-form`, `pages/done`, `pages/invite`, `pages/waiting`, `pages/light-result`, `pages/share`. F2는 이름만 있는 빈 셸까지만 만들고, 실제 화면은 F3~F7이 같은 파일을 채운다.
- 생성: `apps/frontend/src/shared/api/client.test.ts`
- 수정: `apps/frontend/package.json` — F2 런타임 의존성 추가와 OpenAPI clean-diff 스크립트 추가
- 수정: `apps/frontend/src/app/App.tsx` — F1의 데모 미리보기 화면을 `AppProviders` 렌더링으로 교체
- 수정: `apps/frontend/src/app/App.test.tsx` — 데모 문구(`돈 이야기를, 조금 더 편안하게`, `3분 대화 시작하기`) 검증을 라우터 셸 검증으로 교체 (교체하지 않으면 기존 테스트가 깨진다)
- 수정: `apps/frontend/src/app/main.tsx` — 진입점을 `AppProviders` 기준으로 정리

**인터페이스:**
- 소비: 백엔드 B2의 OpenAPI 스냅샷.
- 소비: 인증은 `securitySchemes.cookieAuth` — HttpOnly 쿠키 `mrs_participant`. Authorization 헤더를 만들지 않고 `credentials: "include"`만 설정한다.
- 산출물: `baseUrl: "/api/v1"`과 `credentials: "include"`를 갖는 타입 지정된 `apiClient`.
- 산출물: `/`, `/light/:step`, `/done`, `/invite/:code`, `/waiting/:sessionId`, `/result/light/:sessionId`, `/result/light/:sessionId/share` 라우트.
- 산출물: 공통 에러 envelope 파서. 실제 계약 형태는 `ErrorResponse = { error: ErrorDetail }`, `ErrorDetail = { code: string; message: string; fieldErrors?: Record<string, string[]> }`이다. 분기는 `error.code`로만 하고 서버 원본 `message`를 화면에 그대로 노출하지 않는다.
- 산출물: 이 앱이 실제로 호출하는 엔드포인트만의 명시적 화이트리스트. 아래 11개가 전부다.
  - `POST /api/v1/sessions` (F3 세션 생성)
  - `GET /api/v1/me/session` (F4 active session)
  - `GET /api/v1/light/questions` (F4 고정 질문 세트)
  - `GET /api/v1/invitations/{code}` (F5 초대 미리보기)
  - `POST /api/v1/invitations/{code}/join` (F5 참가)
  - `GET /api/v1/sessions/{session_id}/me/input` (F4 본인 입력 조회)
  - `PATCH /api/v1/sessions/{session_id}/me/input` (F4 자동 저장)
  - `POST /api/v1/sessions/{session_id}/me/submit` (F4 제출)
  - `GET /api/v1/sessions/{session_id}/status` (F5 폴링)
  - `POST /api/v1/sessions/{session_id}/nudge` (F5 인앱 알림)
  - `GET /api/v1/sessions/{session_id}/result` (F6 결과)
- 산출물: 범위 밖 표면 차단. 생성된 스키마에 포함된 `POST /api/v1/calculate/light`, `GET /api/v1/config/{config_type}`, `GET /api/v1/deep/questions`, `POST /api/v1/validate/input`은 호출하거나 감싸지 않고, 관련 타입(`SurplusResult`, `TypeClassificationResult`, `LightDiagnosis*`, `InputValidation*`, `ConfigResponse`)도 래핑하지 않는다. (배경: 백엔드 계약에 이번 사이클 범위 밖 엔드포인트가 함께 노출되어 있어, 실수로 호출되지 않도록 화이트리스트로 명시한다)

- [ ] **Step 0: F2 의존성 설치**

F1은 `api:generate` 스크립트만 만들어 두었고 실제 패키지는 아직 없다. 지금 상태에서 `api:generate`를 실행하면 바로 실패한다. 워크스페이스에 런타임 의존성 `openapi-fetch`, `react-router-dom`, `@tanstack/react-query`와 devDependency `openapi-typescript`를 설치한다. 버전은 이 계획의 기술 스택(React 18, TanStack Query 5)과 호환되는 것을 고른다.

~~~bash
npm install --workspace @mirisallim/frontend openapi-fetch react-router-dom @tanstack/react-query
npm install --workspace @mirisallim/frontend -D openapi-typescript
~~~

- [ ] **Step 1: API 타입 생성**

`openapi-typescript openapi.json -o src/shared/api/schema.d.ts`를 실행한다. 두 번 생성해서 두 번째 출력이 다르면 실패하는 clean-diff 스크립트를 추가한다. `package.json`에는 아직 이 스크립트가 없으므로 새로 추가하며, Windows와 Git Bash 양쪽에서 동작하도록 셸 의존 문법 대신 작은 Node 스크립트로 비교한다.

- [ ] **Step 1b: 엔드포인트 화이트리스트 문서화**

`allowed-operations.ts`에 위 인터페이스의 11개 오퍼레이션 목록을 타입 수준으로 선언하고, `apiClient`가 이 목록 밖의 경로로 호출되면 typecheck·lint·test 중 하나가 반드시 실패하도록 구성한다. 목적은 범위 밖 백엔드 표면(deep 모드, 계산기, 설정, 검증기)이 라이트 모드 앱에 실수로 새어 들어오지 않게 막는 것이다. 주석만 남기는 것으로는 부족하며, 실제로 실패하는 검사가 있어야 한다.

- [ ] **Step 2: 실패하는 API 클라이언트 테스트 작성**

fetch를 모킹해 요청이 `/api/v1`을 사용하고, credentials를 포함하며, 공통 에러 envelope(`{ error: { code, message, fieldErrors? } }`)를 파싱하고, 401/404/409/410/422/429 뮤테이션은 자동으로 재시도하지 않는지 검증한다. MSW는 아직 설치되어 있지 않고 이 스텝에 필요하지 않다. 화이트리스트 밖 경로 호출이 차단되는지도 함께 검증한다.

- [ ] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/shared/api/client.test.ts`를 실행한다.

예상 결과: 클라이언트 래퍼가 없으므로 FAIL.

- [ ] **Step 4: 클라이언트와 프로바이더 구현**

GET 재시도 횟수를 제한하고 뮤테이션은 재시도하지 않는 QueryClient를 하나 생성한다. `AppProviders`에서 RouterProvider와 QueryClientProvider를 감싼다. 서버의 원본 상세 정보를 노출하지 않고 API 에러 코드를 중립적인 한국어 에러 상태로 매핑한다. `shared/api/index.ts`에 `apiClient`, 에러 매핑, 스키마 파생 타입의 공개 API를 모아 re-export한다.

- [ ] **Step 5: 라우트 셸과 앱 진입점 교체**

각 라우트는 처음에는 lazy import를 통해 이름이 지정된 페이지 셸을 렌더링한다. 에러 페이지는 인증 실패, 만료, 사용 불가능한 초대, 충돌, rate limit, 일시적 실패 상태를 처리한다. F1의 데모 미리보기를 렌더링하던 `App.tsx`를 `AppProviders` 렌더링으로 교체하고, 그 데모 문구를 검증하던 `App.test.tsx`를 라우터 셸 검증으로 함께 교체한다. 데모 마크업은 F3 랜딩에서 다시 만들므로 보존하지 않는다.

- [ ] **Step 6: 검증 및 커밋**

API 생성 clean-diff, lint, typecheck, 전체 테스트, build를 실행한다. `lint`는 `--max-warnings 0`이므로 경고 하나도 허용되지 않는다. 특히 컴포넌트가 아닌 값을 export하는 `.tsx`(예: `router.tsx`)에서 `react-refresh/only-export-components`가 걸릴 수 있고, `boundaries/no-unknown-files`가 error이므로 새 디렉터리가 `eslint.config.js`의 `boundaries/elements` 패턴에 맞아야 한다. F1이 남긴 `src/shared/config/fsd-boundaries.test.ts`도 계속 통과해야 한다.

~~~bash
git add apps/frontend package-lock.json
git commit -m "feat(web): add typed API client and routes"
~~~

---

### F3: 랜딩과 세션 시작

**파일:**
- 생성: `apps/frontend/src/features/create-session/api/create-session.ts`
- 생성: `apps/frontend/src/features/create-session/ui/StartLightButton.tsx`
- 생성: `apps/frontend/src/features/create-session/ui/NicknameDialog.tsx` — 백엔드가 `nickname`을 필수로 요구하므로 세션 생성 전 닉네임을 입력받는 다이얼로그
- 생성: `apps/frontend/src/features/create-session/index.ts`
- 생성: `apps/frontend/src/pages/landing/ui/LandingPage.tsx`
- 생성: `apps/frontend/src/pages/landing/ui/LandingPage.test.tsx`
- 생성: `apps/frontend/src/pages/landing/index.ts`
- 수정: `apps/frontend/src/app/router/router.tsx`

**인터페이스:**
- 소비: 백엔드 B3의 `POST /sessions -> SessionCreated`. 현재 계약은 `nickname`(1–20자, 필수)을 요구하고 `mode`는 `"light"`로 고정 전송한다.
- 산출물: 랜딩 CTA는 닉네임 다이얼로그를 먼저 열고, 제출 후 `activeSessionId`만 저장한 뒤 `/light/1`로 이동한다.

- [ ] **Step 1: 실패하는 랜딩 테스트 작성**

정확한 히어로 eyebrow, 헤드라인, 3개의 프라이버시 불릿, 두 모드 카드, 4단계 사용 방법, 제공된 alt 텍스트, 비활성화된 `준비 중` 15분 CTA를 검증한다.

- [ ] **Step 2: 실패하는 세션 시작 테스트 작성**

~~~tsx
// 닉네임 다이얼로그가 열리고, 유효한 닉네임 입력 후에만 세션 생성 요청이 나가는지 검증
await user.click(screen.getByRole("button", { name: /가볍게 맞춰보기/ }));
await user.type(screen.getByLabelText("닉네임"), "예랑이");
await user.click(screen.getByRole("button", { name: "시작하기" }));
expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ nickname: "예랑이", mode: "light" }));
expect(sessionStorage.getItem("activeSessionId")).toBe("session-a");
expect(router.state.location.pathname).toBe("/light/1");
~~~

닉네임이 비어 있거나 20자를 초과하면 제출이 막히고 검증 메시지가 보이는지도 함께 검증한다.

- [ ] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/pages/landing`을 실행한다.

예상 결과: 랜딩과 feature 구현이 없으므로 FAIL.

- [ ] **Step 4: 반응형 랜딩 구현**

제공된 히어로와 3분 모드 PNG를 사용하고, 승인된 프레이밍에 맞는 object-position/크롭, border 기반 카드, Green CTA, 15분 카드와 사용법 아이콘용 인라인 SVG, sticky 헤더, 모바일 내비게이션을 구현한다.

- [ ] **Step 5: 세션 뮤테이션 구현**

CTA를 누르면 `NicknameDialog`가 열린다 (백엔드와 동일한 1–20자 클라이언트 검증). 제출 시 클라이언트 idempotency UUID를 생성하고, `{ nickname, mode: "light" }`로 타입이 지정된 엔드포인트를 호출한다. 공개 세션 ID만 `sessionStorage`에 저장하고 닉네임 자체는 저장하지 않는다(민감 정보 저장 금지 원칙 유지). active-session 쿼리를 무효화하고 201 응답을 받은 뒤에만 이동한다.

- [ ] **Step 6: 검증 및 커밋**

랜딩 테스트, lint, typecheck, build를 실행한다.

~~~bash
git add apps/frontend
git commit -m "feat(web): launch light sessions from landing"
~~~

---

### F4: 가변 질문 입력, 자동 저장, 제출, 완료

**파일:**
- 생성: `apps/frontend/src/entities/light-question/model/types.ts`
- 생성: `apps/frontend/src/entities/light-question/index.ts`
- 생성: `apps/frontend/src/entities/light-answer/model/types.ts`
- 생성: `apps/frontend/src/features/save-light-answer/model/light-form-store.ts`
- 생성: `apps/frontend/src/features/save-light-answer/api/light-input.ts`
- 생성: `apps/frontend/src/features/save-light-answer/ui/AnswerGroup.tsx`
- 생성: `apps/frontend/src/features/submit-light-form/api/submit-light-form.ts`
- 생성: `apps/frontend/src/features/submit-light-form/ui/SubmitLightButton.tsx`
- 생성: `apps/frontend/src/widgets/light-question-card/ui/LightQuestionCard.tsx`
- 생성: `apps/frontend/src/pages/light-form/ui/LightFormPage.tsx`
- 생성: `apps/frontend/src/pages/light-form/ui/LightFormPage.test.tsx`
- 생성: `apps/frontend/src/pages/done/ui/DonePage.tsx`
- 생성: `apps/frontend/src/pages/done/ui/DonePage.test.tsx`

**인터페이스:**
- 소비: 백엔드 B2의 질문 세트와 백엔드 B4의 active-session/input/submit 엔드포인트.
- 산출물: `hydrate`, `setAnswer`, `setGuess`, `setCurrentStep`을 갖는 `useLightFormStore`.
- 산출물: `LightFormPage`와 `DonePage`.

- [ ] **Step 1: 실패하는 가변 개수 테스트 작성**

3문항 세트를 모킹한다. 진행률이 `1 / 3`으로 표시되고, 다음 버튼은 3단계에서 멈추며, 저장 payload 배열의 길이가 3이고, 점수 관련 UI가 `/5`를 절대 렌더링하지 않는지 검증한다.

- [ ] **Step 2: 실패하는 인터랙션 테스트 작성**

Green 본인 답변 칩, Purple 예측 칩, `aria-pressed`, 이전/다음, null로 건너뛰기, 새로고침 시 hydration, 저장 성공, `저장되지 않음 · 다시 시도`, 키보드 인터랙션을 다룬다.

- [ ] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/pages/light-form`을 실행한다.

예상 결과: 폼이 존재하지 않으므로 FAIL.

- [ ] **Step 4: 폼 상태와 자동 저장 구현**

active session과 고정된 질문 버전, 본인의 입력을 가져온다. 답변은 메모리에만 유지하고, 타입별 PATCH 요청은 debounce 처리하며, 실패 시 로컬 값을 보존하고, 답변과 예측은 절대 web storage에 기록하지 않는다.

- [ ] **Step 5: 제출과 완료 구현**

마지막 버튼은 `입력 완료하기` 문구를 표시하고 성공 응답을 받은 뒤에만 라우팅한다. DonePage는 초대 코드, 7일 후 삭제 안내 문구, 읽기 전용 입력 링크, 대기 링크, 홈 링크를 보여준다. 409 응답 시 로컬 데이터를 버리지 않고 읽기 전용 상태로 hydrate한다.

- [ ] **Step 6: 검증 및 커밋**

포커스 테스트, lint, typecheck, build를 실행한다.

~~~bash
git add apps/frontend
git commit -m "feat(web): complete variable light questionnaire"
~~~

---

### F5: 초대, 대기, 폴링, 인앱 알림

**파일:**
- 생성: `apps/frontend/src/entities/session/model/invitation.ts`
- 생성: `apps/frontend/src/features/join-session/api/join-session.ts`
- 생성: `apps/frontend/src/features/join-session/ui/JoinSessionButton.tsx`
- 생성: `apps/frontend/src/features/poll-session-status/api/session-status.ts`
- 생성: `apps/frontend/src/features/poll-session-status/model/use-session-status.ts`
- 생성: `apps/frontend/src/features/send-nudge/api/send-nudge.ts`
- 생성: `apps/frontend/src/widgets/waiting-status/ui/WaitingStatus.tsx`
- 생성: `apps/frontend/src/pages/invite/ui/InvitePage.tsx`
- 생성: `apps/frontend/src/pages/invite/ui/InvitePage.test.tsx`
- 생성: `apps/frontend/src/pages/waiting/ui/WaitingPage.tsx`
- 생성: `apps/frontend/src/pages/waiting/ui/WaitingPage.test.tsx`

**인터페이스:**
- 소비: 백엔드 B5의 초대, 참가, 상태, nudge 엔드포인트.
- 산출물: 대기 중일 때만 3000ms 간격으로 폴링하는 `useSessionStatus(sessionId)`.

- [ ] **Step 1: 실패하는 InvitePage 테스트 작성**

일반화된 파트너 문구, 모드/소요시간 배지, 동시 공개 설명, 현재 데이터 프라이버시 문구, 사용 불가 코드 상태, 참가 성공 시 `/light/1`로의 이동을 검증한다.

- [ ] **Step 2: 실패하는 WaitingPage 테스트 작성**

파트너 미참가, 파트너 입장 중, 준비 완료, 만료, nudge rate-limit 상태를 다룬다. 잠금 미리보기 아이콘은 준비 완료 상태에서만 사라지고, 복사 피드백 문구가 1.6초간 `복사됨`으로 바뀌는지 검증한다.

- [ ] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/pages/invite src/pages/waiting`을 실행한다.

예상 결과: invite와 waiting 페이지가 없으므로 FAIL.

- [ ] **Step 4: 초대 참가 구현**

코드를 저장하지 않고 미리보기만 하고, 참가 시 클라이언트 idempotency 키를 전송하며, 반환된 공개 세션 ID만 저장하고, 인증은 백엔드 쿠키에 의존한다.

- [ ] **Step 5: 대기와 nudge 구현**

TanStack Query는 준비되지 않은 동안에만 3000ms 간격으로 폴링하고, unmount되거나 준비 완료되면 멈춘다. 파트너가 참가하기 전에는 nudge 대신 링크 재공유를 보여준다. 참가 후에는 nudge 뮤테이션을 허용하고, 429는 다음 가능 시점 안내로 매핑한다.

- [ ] **Step 6: 검증 및 커밋**

포커스 테스트, lint, typecheck, build를 실행한다.

~~~bash
git add apps/frontend
git commit -m "feat(web): join and wait for partner"
~~~

---

### F6: 동시공개 결과 화면

**파일:**
- 생성: `apps/frontend/src/entities/light-result/model/types.ts`
- 생성: `apps/frontend/src/features/get-light-result/api/get-light-result.ts`
- 생성: `apps/frontend/src/features/get-light-result/index.ts`
- 생성: `apps/frontend/src/widgets/result-summary/ui/ResultSummary.tsx`
- 생성: `apps/frontend/src/widgets/result-comparison/ui/ResultComparison.tsx`
- 생성: `apps/frontend/src/widgets/result-topics/ui/ResultTopics.tsx`
- 생성: `apps/frontend/src/pages/light-result/ui/LightResultPage.tsx`
- 생성: `apps/frontend/src/pages/light-result/ui/LightResultPage.test.tsx`

**인터페이스:**
- 소비: 백엔드 B6의 `WaitingResultResponse | ReadyResultResponse`.
- 산출물: 결과 엔티티를 생성하지 않는 대기 리다이렉트/상태, 또는 동적 `questionCount`를 사용하는 준비 완료 결과 UI.

- [ ] **Step 1: 실패하는 판별 응답 테스트 작성**

`status: waiting`일 때는 타입 카드, 점수, 비교, 파트너 답변이 전혀 나타나지 않고 페이지가 waiting으로 라우팅되는지 검증한다. `status: ready`일 때는 결과가 렌더링되는지 검증한다.

- [ ] **Step 2: 실패하는 동적 점수 테스트 작성**

`mutualHitCount=4`, `questionCount=7`을 모킹한다. 분모를 하드코딩하지 않고 `4 / 7` 표시와 `4/7`에서 도출된 너비를 검증한다.

- [ ] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/pages/light-result`을 실행한다.

예상 결과: 결과 페이지가 없으므로 FAIL.

- [ ] **Step 4: 결과 위젯 구현**

결과 배지/헤더, 점수 카드, 진행률, 중립적인 두 타입 카드, 개인화된 3열 비교, 격차 주제, 공유 CTA, 15분 모드 업셀을 렌더링한다. 우열을 나타내지 않고 본인은 Green, 파트너는 Purple을 사용한다.

- [ ] **Step 5: 프라이버시 검증 추가**

waiting 목업의 접근성 트리와 렌더링된 HTML에서 파트너 답변 문자열을 검사한다. 준비 완료 전에는 둘 다 존재하지 않는지 검증한다. 준비 완료 결과를 local storage에 저장하지 않는다.

- [ ] **Step 6: 검증 및 커밋**

포커스 테스트, lint, typecheck, build를 실행한다.

~~~bash
git add apps/frontend
git commit -m "feat(web): render simultaneous light results"
~~~

---

### F7: 개인정보 제한 공유 카드

**파일:**
- 생성: `apps/frontend/src/entities/share-card/model/types.ts`
- 생성: `apps/frontend/src/features/download-share-card/lib/to-share-card-model.ts`
- 생성: `apps/frontend/src/features/download-share-card/lib/to-share-card-model.test.ts`
- 생성: `apps/frontend/src/features/download-share-card/ui/DownloadShareCardButton.tsx`
- 생성: `apps/frontend/src/widgets/share-card/ui/ShareCard.tsx`
- 생성: `apps/frontend/src/pages/share/ui/SharePage.tsx`
- 생성: `apps/frontend/src/pages/share/ui/SharePage.test.tsx`

**인터페이스:**
- 소비: F6의 준비 완료된 라이트 결과.
- 산출물: `ShareCardModel = {leftType, rightType, tagline, mutualHitCount, questionCount, ratio}`.
- 산출물: 9:16 또는 1:1 PNG 다운로드.

- [ ] **Step 1: 실패하는 모델 프라이버시 테스트 작성**

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

- [ ] **Step 2: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/features/download-share-card`를 실행한다.

예상 결과: 제한된 mapper가 없으므로 FAIL.

- [ ] **Step 3: 모델과 비율 구현**

`ShareCard`가 오직 `ShareCardModel`만 받도록 만든다. 서비스 로고, 두 타입, 중립적인 tagline, 점수, 서비스 슬로건, 도메인을 담은 정확한 9:16, 1:1 프레임을 렌더링한다.

- [ ] **Step 4: 테스트된 PNG 다운로드 구현**

`document.fonts.ready`를 대기한 뒤 고정된 pixel ratio로 `html-to-image.toPng`를 호출하고, 로컬 anchor를 생성해 사용자 입력이 전혀 포함되지 않은 파일명으로 다운로드한다. 테스트에서는 렌더러와 클릭 둘 다 모킹한다.

- [ ] **Step 5: 프라이버시 문구 검증**

`금액, 부채, 저축액 같은 재무 정보는 카드에 담기지 않아요` 문구가 보이는지, 렌더링된 카드에 숨겨진 금액 텍스트가 없는지 검증한다.

- [ ] **Step 6: 검증 및 커밋**

포커스 테스트, lint, typecheck, build를 실행한다.

~~~bash
git add apps/frontend
git commit -m "feat(web): download privacy-safe result cards"
~~~

---

### F8: E2E, 접근성, 보안 헤더, Vercel

**파일:**
- 생성: `apps/frontend/playwright.config.ts`
- 생성: `apps/frontend/e2e/light-flow.spec.ts`
- 생성: `apps/frontend/e2e/privacy-gate.spec.ts`
- 생성: `apps/frontend/e2e/accessibility.spec.ts`
- 생성: `apps/frontend/e2e/responsive.spec.ts`
- 생성: `apps/frontend/vercel.json`
- 생성: `.github/workflows/frontend.yml`
- 생성: `docs/operations/frontend-deployment.md`
- 수정: `apps/frontend/package.json`

**인터페이스:**
- 산출물: GitHub 체크 `frontend`.
- 산출물: `npm --workspace @mirisallim/frontend run test:e2e`.
- 산출물: 동일 출처 `/api` rewrite를 사용하는 Vercel 프로덕션 프론트엔드.

- [ ] **Step 1: 두 브라우저 E2E 작성**

독립적인 A, B 컨텍스트를 생성한다. 랜딩, 세션 생성, 전체 질문, 초대 참가, A 선제출 잠금, B 제출, 동시 결과, PNG 다운로드를 거친다.

- [ ] **Step 2: 네트워크 프라이버시 검사 추가**

A만 제출한 시점에서 A의 응답을 캡처한다. 본인 입력이 아닌 응답에 `answers`, `guesses`, `result`, `type`, `score`가 포함되면 실패 처리한다.

- [ ] **Step 3: 접근성과 반응형 검사 추가**

모든 라우트에서 `@axe-core/playwright`를 실행하고, 모든 컨트롤을 키보드로 조작하며, 390px와 1280px 뷰포트를 테스트하고, 900px에서 헤더 내비게이션이 전환되는지 검증한다.

- [ ] **Step 4: 프론트엔드 CI와 헤더 구성**

CI는 OpenAPI 생성 clean-diff, ESLint/FSD, TypeScript, Vitest, build, Playwright를 실행한다. Vercel은 CSP, HSTS, `nosniff`, `Referrer-Policy: no-referrer`를 설정하고 `/api/(.*)`를 실제 배포된 백엔드 오리진으로 rewrite한다.

// 배포 오리진 확인 필요: 백엔드 CORS 기본값은 Render(`https://mirisalim-backend.onrender.com`)를 가리키지만, 원래 설계 스펙은 Railway를 가정했다. rewrite 대상을 하드코딩하기 전에 인프라 담당자에게 실제 프로덕션 배포처(Render vs Railway)를 재확인한다.

- [ ] **Step 5: Vercel 배포 및 smoke 테스트**

Vercel 프로젝트 `mirisallim`을 `apps/frontend` 루트로 생성하고, rewrite에 사용할 오리진을 Step 4에서 확인한 실제 배포처(Render 또는 Railway)로 설정한 뒤 배포한다. 이후 정확한 프로덕션 URL을 대상으로 Playwright smoke 프로젝트를 실행한다.

- [ ] **Step 6: 문서화 및 커밋**

preview/prod 환경 분리, rewrite 검증, CSP 유지보수, Vercel 롤백, 프로덕션 smoke 명령어를 문서화한다.

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
