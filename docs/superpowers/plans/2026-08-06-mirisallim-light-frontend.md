# 미리살림 3분 모드 프론트엔드 구현 계획

> **에이전트 작업자 안내:** 필수 서브스킬 — 이 계획을 태스크 단위로 실행할 때는 superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans를 사용한다. 각 스텝은 체크박스(`- [ ]`) 문법으로 진행 상황을 추적한다.

## 현재 진행 상황 (2026-08-18 기준, `develop` 커밋 `ca94786`)

| 단계 | 상태 | 이슈 | PR | 비고 |
| --- | --- | --- | --- | --- |
| F1 | ✅ 병합됨 | #1 | #2 | FSD 경계, 디자인 시스템 |
| F2 | ✅ 병합됨 | #4 | — | OpenAPI 클라이언트, 라우터. `feature/4-openapi-client` 커밋을 `develop`에 직접 통합 |
| F3 | ✅ 병합됨 | #7 | #9 | 랜딩·세션 시작. 무기명 진입으로 정정된 뒤 병합 |
| F4 | ✅ 병합됨 | #12 | #14 | 가변 질문 입력·자동저장·제출·완료 |
| F5 | ✅ 병합됨 | #8 | #13 | 초대·대기·폴링·nudge. 무기명 진입 |
| F6 | 🚧 진행 중 | #15 | — | 동시공개 결과 화면. 워크트리 `feature/15-light-result` 준비됨, 구현 착수 전 |
| F7 | ⬜ 미착수 | — | — | F6 위에서 진행 |
| F8 | 🟨 프로덕션 스모크만 남음 | #22 | #23 | Task 1~6 병합 완료. 이슈 #24(결과 페이지 되튕김)를 PR #25로 수정하고 후속 4건을 병합했다 — #26/PR #29(스모크 3초 예산 한정), #27/PR #30(캐시된 결과 보존), #28/PR #31(폴링 주기 단축), #32/PR #35(CI 산발 실패 제거). 남은 것은 Task 6 Step 6 프로덕션 스모크 재실행이다. 후속 이슈 #33(나중 제출자의 3초 보장), #34(적응형 폴링 주기)는 별도로 열려 있다. |

**병렬 트랙 구성**(`## 진행 방식` 섹션 참고): 트랙 A(F3→F4)는 완료되어 종료됐다. 트랙 B(F5→F6→F7)가 지금 F6을 진행 중이다.

**계약 변경 이력:** 백엔드 PR #5가 `nickname`을 선택 필드로 바꿔, F3·F5가 초안에서 만들었던 닉네임 다이얼로그를 제거하고 무기명 진입으로 정정했다. 아래 F3·F5 섹션 본문과 전역 제약사항의 "계약 편차 메모"는 이 정정을 반영해 갱신되어 있다.

**남은 미확정 사항:** F8 착수 전 배포 오리진(Render vs Railway) 확인이 필요하다. 전역 제약사항 하단 참고.

**이 표와 아래 체크박스가 실제 코드 상태와 어긋나면 이 표를 신뢰하지 마라.** `git log --oneline origin/develop` 과 `gh pr list --state all`로 직접 확인한 뒤 이 표를 갱신하라.

**목표:** 백엔드 OpenAPI 계약만 의존해 랜딩, 가변 질문 입력, 초대·대기, 동시공개 결과와 금액 없는 공유 카드를 제공하는 독립 React 애플리케이션을 구축하고 Vercel에 배포한다.

**아키텍처:** React 앱은 FSD의 `app/pages/widgets/features/entities/shared` 계층을 따르고 각 슬라이스는 `index.ts` 공개 API만 노출한다. 서버 상태는 TanStack Query, 미제출 폼 상태는 Zustand와 react-hook-form, API 타입은 FastAPI OpenAPI 생성물로 관리한다.

**기술 스택:** Node 20+, React 18, Vite, TypeScript, React Router, Tailwind CSS 4, Zustand, TanStack Query 5, react-hook-form, zod, openapi-fetch, openapi-typescript, html-to-image, Vitest, Testing Library, MSW, Playwright, axe-core, Vercel. (Tailwind v3.4→v4 결정 배경은 F2 참고)

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
   **재확인 (2026-08-17, `develop` `028797c` 기준):** 편차가 그대로 남아 있고, 범위가 F3보다 넓다는 점이 새로 확인됐다.
   - `apps/backend/schemas.py`의 `CreateSessionRequest.nickname`은 여전히 `Field(..., min_length=1, max_length=20)` 필수다.
   - **`JoinInvitationRequest.nickname`도 동일하게 필수다.** 즉 초대 참가에도 닉네임이 필요하므로, 닉네임 입력은 F3만의 문제가 아니라 **F5의 `JoinSessionButton`에도 필요하다**. 원래 계획에는 이 항목이 빠져 있었다.
   - 설계 스펙 2.3은 "익명 첫 사이클에서는 초대자 이름을 받지 않고 초대 화면에 `파트너가 함께 해보자고 초대했어요`라는 일반 카피를 사용한다"고 명시한다. 계약은 양측 모두에게 닉네임을 요구하므로 이 문장과 정면으로 어긋난다.
   - 응답 쪽 노출 범위는 확인 결과 제한적이다. `SessionStatusResponse`는 닉네임을 담지 않고 boolean 플래그(`partnerJoined`, `partnerCompleted`)만 반환한다. 닉네임이 실려오는 것은 `participants[]`를 포함하는 `SessionResponse`뿐이다.
   - **처리 방침:** 닉네임은 계약을 만족시키기 위해 수집하되 **화면에 렌더링하지 않는다.** 초대·대기·결과 화면은 스펙대로 일반 카피를 유지하고, 응답으로 받은 상대 닉네임은 어떤 UI에도 바인딩하지 않는다. 닉네임 입력 UI는 `features/create-session`과 `features/join-session` 안에만 가둬서, 계약이 뒤집히면 두 슬라이스만 되돌리면 되게 한다.
   - **최종 해소 (2026-08-18, 백엔드 PR #5 `9550d4b` 머지):** 편차가 뒤집혔다. `CreateSessionRequest.nickname`과 `JoinInvitationRequest.nickname` 모두 `str | None`(선택)으로 바뀌었고 `openapi.json`의 `required`에서 제거됐다. 즉 스펙 2.3의 무기명 진입이 최종 계약이다. F3·F5는 위 처리 방침대로 가뒀던 `NicknameDialog`/`JoinNicknameDialog`를 병합 직후 각각 제거했다(PR #9, #13). **더 이상 닉네임을 수집하지 않는다.** 이 항목은 F3/F5/F8에 재조정이 필요 없다 — 이미 반영 완료됐다.
2. OpenAPI 계약에 이번 사이클 범위 밖 엔드포인트(`/deep/questions`, `/calculate/light`, `/config/{config_type}`, `/validate/input`)와 타입(`SurplusResult`, `TypeClassificationResult` 등)이 함께 노출된다. F2는 실제로 호출하는 엔드포인트만의 명시적 화이트리스트를 유지한다. **(F2 반영 완료: `shared/api/allowed-operations.ts`의 `AllowedPaths`로 `apiClient`의 경로·메서드를 11개로 좁혔고, `allowed-operations.type-test.ts`가 범위 밖 호출이 컴파일되지 않음을 `tsc --noEmit`에서 강제한다)**
3. 백엔드 CORS 기본 오리진이 Render(`https://mirisalim-backend.onrender.com`)를 가리킨다. F8은 Vercel rewrite 대상을 확정하기 전에 실제 배포 오리진(Render 또는 Railway)을 인프라 담당자와 재확인한다.

---

## 진행 방식 (2026-08-17 결정)

### 2트랙 병렬

F1·F2가 `develop`에 들어간 시점부터 남은 슬라이스를 두 트랙으로 나눠 병렬 진행한다.

~~~text
트랙 A:  F3(랜딩/세션 생성) → F4(가변 질문 입력/자동저장/제출/완료)
트랙 B:  F5(초대/대기/폴링/nudge) → F6(동시공개 결과) → F7(공유 카드)
수렴:    F8(E2E/접근성/보안 헤더/Vercel) — 두 트랙이 모두 `develop`에 들어온 뒤 단독으로
~~~

**트랙 안에서는 직렬이다.** 트랙 A는 F4가 F3의 `activeSessionId`와 폼 진입 흐름 위에 올라가고, 트랙 B는 F6이 F5의 세션 상태 위에, F7이 F6의 결과 위에 올라간다.

**트랙 사이에는 파일이 거의 겹치지 않는다.** 트랙 A는 `pages/landing`·`pages/light-form`·`pages/done`과 `features/create-session`·`features/save-light-answer`·`features/submit-light-form`을, 트랙 B는 `pages/invite`·`pages/waiting`·`pages/light-result`·`pages/share`와 `features/join-session`·`features/poll-session-status`·`features/send-nudge`·`features/get-light-result`·`features/download-share-card`를 만진다.

**F5를 트랙 B의 머리에 두는 이유:** F5는 F3의 세션 생성 없이도 MSW mock만으로 완결 테스트가 되는 유일한 흐름이다. 초대 코드 조회와 참가는 자체 엔드포인트를 쓰고, 대기 화면은 `sessionId`만 주면 성립한다.

### 병렬화가 가능한 근거 (F2가 미리 해소한 것들)

- **공유 라우트 파일 충돌 없음.** `src/app/router/AppRoutes.tsx`에 7개 라우트와 lazy import가 이미 전부 선언되어 있다. 각 슬라이스는 자기 페이지 셸 파일만 채우면 되고 이 파일을 수정하지 않는다. (계획 초안의 "F3에서 `AppRoutes.tsx` 수정"은 더 이상 필요 없다)
- **ESLint 설정 충돌 없음.** `eslint.config.js`의 `boundaries/elements`가 `src/features/*` 같은 글롭 패턴이라 새 슬라이스를 추가해도 설정 파일을 건드릴 필요가 없다.
- **락파일 충돌 없음.** 남은 의존성(`zustand`, `react-hook-form`, `zod`, `html-to-image`, `msw`, `@playwright/test`, `@axe-core/playwright`)을 `028797c chore(web): add F4-F8 dependencies ahead of parallel slices` 한 커밋으로 미리 설치했다. **각 슬라이스는 의존성을 새로 설치하지 않는다.** 정말 필요해지면 트랙이 `develop`에서 만나는 시점에 추가한다.
- **F7이 F6을 기다리지 않아도 되는 여지.** `schema.d.ts`로 계약이 동결되어 있어, `ShareCardModel`은 F6의 런타임 산출물이 아니라 `ResultReadyResponse` 타입에서 파생할 수 있다.

### 전면 병렬(F3~F7 동시)을 하지 않는 이유

- 임시 worktree의 `node_modules` junction을 통해 재귀 삭제가 `apps/frontend`까지 번진 사고가 실제로 있었다. worktree 수를 늘릴수록 위험이 비례해 커진다.
- 닉네임 계약이 아직 확정이 아니다(2026-08-18에 PR #5로 해소됨 — 위 계약 편차 메모의 "최종 해소" 참고). 당시엔 트랙 A만 영향을 받도록 격리해 뒀다.
- 슬라이스가 TDD 단위라, 병렬 브랜치가 각자 초록불이어도 합칠 때 깨지는 것을 늦게 발견하게 된다. 트랙이 둘이면 수렴 지점도 둘뿐이다.

### 브랜치와 이슈

각 F 단계는 착수 전에 GitHub 이슈를 만들고 그 번호로 브랜치를 딴다. 규칙은 `CLAUDE.md`의 "Git flow"에 있다.

---

## 프론트엔드 파일 지도

~~~text
apps/frontend/
├─ package.json
├─ vite.config.ts
├─ eslint.config.js
├─ playwright.config.ts
├─ vercel.json
├─ openapi.json
├─ scripts/
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

> ✅ **병합됨** — 이슈 #1, PR #2. `chore/1-frontend-foundation` 브랜치.

**파일:**
- 생성: `.gitignore`
- 생성: `.editorconfig`
- 생성: `package.json`
- 생성: `apps/frontend/package.json`
- 생성: `apps/frontend/index.html`
- 생성: `apps/frontend/tsconfig.json`
- 생성: `apps/frontend/vite.config.ts`
- 생성: `apps/frontend/tailwind.config.ts` — F2의 Tailwind v4 전환으로 삭제됨. 토큰은 `src/app/styles/globals.css`의 `@theme` 블록에 있다.
- 생성: `apps/frontend/postcss.config.cjs` — F2의 Tailwind v4 전환으로 삭제됨(`@tailwindcss/vite`가 대체).
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

- [x] **Step 1: 워크스페이스와 테스트 설정 구성**

`dev`, `lint`, `typecheck`, `test`, `build`, `api:generate`, `test:e2e` 스크립트를 갖춘 npm 워크스페이스 `@mirisallim/frontend`를 구성한다. jsdom, Testing Library matcher, React 18, Vite를 설정한다.

- [x] **Step 2: 실패하는 공유 UI 테스트 작성**

~~~tsx
it("exposes toggle state", () => {
  render(<PillToggle pressed={false} onPressedChange={() => undefined}>선택</PillToggle>);
  expect(screen.getByRole("button", { name: "선택" })).toHaveAttribute("aria-pressed", "false");
});
~~~

정확히 900px에서 헤더 모드가 전환되는지 검증하는 `useWindowWidth` 테스트를 추가한다.

- [x] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/shared`를 실행한다.

예상 결과: UI와 훅 구현이 없으므로 FAIL.

- [x] **Step 4: 토큰과 UI 구현**

캔버스 `#FCFCFB`, Green `#43A77B`, Purple `#8A6FD1`, 카드 radius 20px, 컨트롤 radius 14px, fadeup 모션, Pretendard CDN, tabular numerals, 한글 word breaking을 등록한다. 버튼은 실제 button 요소를 사용하고 토글은 `aria-pressed`를 노출한다.

- [x] **Step 5: FSD 경계 강제**

상위 계층 import가 아래 방향으로만 흐르고 슬라이스 간 import는 `index.ts`를 통해서만 해석되도록 `eslint-plugin-boundaries`를 구성한다. shared→feature로 금지된 import를 시도하는 fixture가 lint에서 실패하는지 확인한 뒤, fixture를 제거하고 lint가 통과하는지 확인한다.

- [x] **Step 6: 검증 및 커밋**

lint, typecheck, 포커스 테스트, build를 실행한다.

~~~bash
git add .gitignore .editorconfig package.json apps/frontend
git commit -m "feat(web): scaffold FSD design system"
~~~

---

### F2: OpenAPI 클라이언트, 앱 프로바이더, 라우터

> ✅ **병합됨** — 이슈 #4. `feature/4-openapi-client` 브랜치의 커밋들을 `develop`에 직접 통합했다(별도 PR 번호 없음).

**파일:** (2026-08-14 `feature/4-openapi-client` 브랜치 `8be3fa4` 구현 결과를 반영해 갱신)
- 소비: 백엔드 B2가 제공하는 `apps/frontend/openapi.json` (읽기 전용 스냅샷. 프론트엔드에서 수정하거나 다시 뽑지 않는다)
- 생성: `apps/frontend/src/shared/api/schema.d.ts` (생성물. 수동 편집 금지)
- 생성: `apps/frontend/src/shared/api/client.ts`
- 생성: `apps/frontend/src/shared/api/errors.ts`
- 생성: `apps/frontend/src/shared/api/allowed-operations.ts`
- 생성: `apps/frontend/src/shared/api/idempotency.ts` — `createIdempotencyKey(): string`. 원래 F3/F5가 각자 만들 예정이었으나, 두 슬라이스가 같은 헬퍼를 쓰므로 `shared/api`에 한 번만 둔다. F3·F5는 새로 만들지 말고 이걸 import한다.
- 생성: `apps/frontend/src/shared/api/index.ts` — 필수. F1이 설정한 `boundaries/dependencies` 정책이 슬라이스 간 import를 `index.ts` 공개 API로만 허용하므로, 이 파일이 없으면 `app`/`pages`에서 `apiClient`를 import할 때 lint가 error로 막는다.
- 생성: `apps/frontend/src/app/providers/AppProviders.tsx`
- 생성: `apps/frontend/src/app/providers/query-client.ts` — `createAppQueryClient()`. 재시도 정책을 프로바이더 컴포넌트에서 분리해 단독으로 검증할 수 있게 한다.
- 생성: `apps/frontend/src/app/providers/AppErrorBoundary.tsx` — 렌더 단계 예외를 `SessionErrorPage kind="unavailable"`로 떨어뜨린다.
- 생성: `apps/frontend/src/app/providers/index.ts`
- 생성: `apps/frontend/src/app/router/AppRouter.tsx` — `BrowserRouter` 껍데기
- 생성: `apps/frontend/src/app/router/AppRoutes.tsx` — 라우트 선언. 껍데기와 분리하는 이유는 두 가지다. (1) 테스트에서 `MemoryRouter`로 라우트 트리만 렌더할 수 있다. (2) 한 파일이 컴포넌트와 라우트 상수를 함께 export하면 `react-refresh/only-export-components` 경고가 나고, `lint`는 `--max-warnings 0`이므로 그대로 실패한다.
- 생성: `apps/frontend/src/app/router/AppLayout.tsx` — `AppShell` + `Outlet`
- 생성: `apps/frontend/src/app/router/RouteLoadingFallback.tsx` — lazy 라우트용 `role="status"` 폴백
- 생성: `apps/frontend/src/app/router/index.ts`
- 생성: `apps/frontend/src/pages/error/ui/SessionErrorPage.tsx`
- 생성: `apps/frontend/src/pages/error/index.ts`
- 생성: 라우트 7개용 페이지 셸과 각 슬라이스의 `index.ts` — `pages/landing`, `pages/light-form`, `pages/done`, `pages/invite`, `pages/waiting`, `pages/light-result`, `pages/share`. F2는 이름만 있는 빈 셸까지만 만들고, 실제 화면은 F3~F7이 같은 파일을 채운다.
- 생성: `apps/frontend/scripts/generate-api-types.mjs` — `api:generate`가 호출하는 Node 래퍼 (Step 1 참고)
- 생성: 테스트 — `src/shared/api/client.test.ts`, `errors.test.ts`, `allowed-operations.test.ts`, `idempotency.test.ts`, `src/app/router/AppRoutes.test.tsx`
- 생성: 타입 전용 검사 — `src/shared/api/allowed-operations.type-test.ts`, `src/shared/api/result.type-test.ts`. 파일명이 `.type-test.ts`인 이유는 Vitest 기본 include(`*.{test,spec}.*`)에 걸리지 않으면서 `tsc --noEmit` 대상에는 포함되게 하려는 것이다. `result.type-test.ts`는 `ResultWaitingResponse | ResultReadyResponse` 판별 유니온에서 waiting 분기가 `result`에 접근하지 못함을 고정한다(F6의 프라이버시 전제를 타입 수준에서 먼저 못박는다).
- 수정: `apps/frontend/package.json` — F2 런타임 의존성 추가와 OpenAPI clean-diff 스크립트 추가
- 수정: `apps/frontend/vite.config.ts` — (1) `@tailwindcss/vite` 플러그인 추가(아래 Tailwind v4 메모), (2) 개발 서버 `/api` 프록시 추가. 대상은 `MIRISALLIM_API_PROXY_TARGET` 환경변수이고 기본값은 `http://127.0.0.1:8000`이다. 이건 로컬 개발 전용이며 프로덕션 rewrite는 F8이 `vercel.json`에서 따로 설정한다.
- 수정: `apps/frontend/tsconfig.json` — `include`에서 삭제된 `tailwind.config.ts` 제거
- 수정: `apps/frontend/src/app/styles/globals.css`, `apps/frontend/src/app/styles/globals.test.ts` — Tailwind v4 `@theme` 전환
- 삭제: `apps/frontend/postcss.config.cjs`, `apps/frontend/tailwind.config.ts` — Tailwind v4 전환으로 불필요
- 수정: `apps/frontend/src/app/App.tsx` — F1의 데모 미리보기 화면을 `AppProviders` 렌더링으로 교체
- 수정: `apps/frontend/src/app/App.test.tsx` — 데모 문구(`돈 이야기를, 조금 더 편안하게`, `3분 대화 시작하기`) 검증을 라우터 셸 검증으로 교체 (교체하지 않으면 기존 테스트가 깨진다)
- 변경 없음: `apps/frontend/src/app/main.tsx` — 원래 계획은 진입점을 `AppProviders` 기준으로 정리하는 것이었으나, `main.tsx`는 `App`을 렌더하고 `App`이 `AppProviders`를 렌더하는 구조를 유지했다. `main.tsx`가 `StrictMode`·`createRoot`·`globals.css` 로딩이라는 부트스트랩 책임만 갖고, `App`이 테스트에서 앱 전체를 렌더하는 진입점 역할을 하므로 `App.test.tsx`가 성립한다.

**인터페이스:**
- 소비: 백엔드 B2의 OpenAPI 스냅샷.
- 소비: 인증은 `securitySchemes.cookieAuth` — HttpOnly 쿠키 `mrs_participant`. Authorization 헤더를 만들지 않고 `credentials: "include"`만 설정한다.
- 산출물: `credentials: "include"`를 갖는 타입 지정된 `apiClient`. **`baseUrl`에 `/api/v1`을 넣지 않는다** — 생성된 스키마의 경로 키가 이미 `/api/v1/sessions`처럼 프리픽스를 포함하고 있어서, `baseUrl: "/api/v1"`로 두면 실제 요청이 `/api/v1/api/v1/sessions`가 된다. `baseUrl`은 같은 출처(`location.origin`)로 두고 호출 시 스키마의 전체 경로를 그대로 쓴다. (이 항목은 원래 `baseUrl: "/api/v1"`이라고 적혀 있었으나 계약과 맞지 않아 2026-08-14에 정정했다)
- 산출물: `/`, `/light/:step`, `/done`, `/invite/:code`, `/waiting/:sessionId`, `/result/light/:sessionId`, `/result/light/:sessionId/share` 라우트. 여기에 매칭되지 않는 경로는 `*` catch-all이 `SessionErrorPage kind="not-found"`로 받는다.
- 산출물: 라우터는 선언형 `<BrowserRouter>` + `<Routes>` 구성이다. react-router 7의 data router(`createBrowserRouter` + `RouterProvider`)는 쓰지 않는다 — 이번 사이클은 route loader나 route별 `errorElement`가 필요하지 않고(F5 폴링은 TanStack Query, F6 결과 분기는 컴포넌트 레벨), 데이터 라우터를 도입하면 쿼리 캐시와 로딩 책임이 두 곳으로 갈라진다. 나중에 loader가 필요해지면 `AppRoutes.tsx`만 교체하면 된다.
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

**기술 결정 메모 (Tailwind CSS v3.4 → v4 업그레이드):** 실제 Tailwind 설정 파일(`tailwind.config.ts`, `postcss.config.cjs`)은 F1에서 만들어지지만, 이 결정 자체는 여기 F2에 기록한다. v3.4에서 v4로 올리기로 한다.
- 이유: v4는 Rust 기반 Oxide 엔진으로 빌드 속도가 크게 빠르고, Vite 프로젝트라 `@tailwindcss/vite` 플러그인을 쓰면 `postcss.config.cjs`의 `tailwindcss` + `autoprefixer` 조합 자체가 필요 없어진다(벤더 프리픽싱은 Lightning CSS가 내장 처리). `tailwind.config.ts`의 JS 토큰 정의도 CSS `@theme` 디렉티브로 옮겨 네이티브 CSS 커스텀 프로퍼티로 노출할 수 있다.
- 타이밍: F1이 이제 막 스캐폴딩된 초기 단계라 마이그레이션 비용(토큰 몇 개 이전)이 지금이 가장 낮다. F1 Step 4(토큰과 UI 구현)를 v4 방식(`@tailwindcss/vite` 플러그인, `@theme` 기반 캔버스/Green/Purple/radius 토큰)으로 진행하고, F1의 **파일** 목록에서 `apps/frontend/postcss.config.cjs`는 제거 대상, `apps/frontend/tailwind.config.ts`는 CSS 진입점(`app/styles/globals.css`) 내 `@theme` 블록으로 대체 대상이 된다.
- 반영 완료 (2026-08-14): 이 계획 상단의 **기술 스택** 표기는 `Tailwind CSS 4`로 갱신했고, F2가 `postcss.config.cjs`·`tailwind.config.ts`를 삭제하고 토큰을 `globals.css`의 `@theme` 블록으로 옮겼다. F1의 **파일** 목록에 남아 있는 두 항목은 그래서 현재 트리에 존재하지 않는다.

- [x] **Step 0: F2 의존성 설치**

F1은 `api:generate` 스크립트만 만들어 두었고 실제 패키지는 아직 없다. 지금 상태에서 `api:generate`를 실행하면 바로 실패한다. 워크스페이스에 런타임 의존성 `openapi-fetch`, `react-router-dom`, `@tanstack/react-query`와 devDependency `openapi-typescript`를 설치한다. 버전은 이 계획의 기술 스택(React 18, TanStack Query 5)과 호환되는 것을 고른다.

~~~bash
npm install --workspace @mirisallim/frontend openapi-fetch react-router-dom @tanstack/react-query
npm install --workspace @mirisallim/frontend -D openapi-typescript
~~~

- [x] **Step 1: API 타입 생성**

`openapi-typescript openapi.json -o src/shared/api/schema.d.ts`를 실행한다. 셸 의존 문법과 PATH 의존을 피하기 위해 `api:generate`는 `node scripts/generate-api-types.mjs`로 두고, 이 Node 래퍼가 `require.resolve("openapi-typescript/package.json")`으로 찾은 로컬 CLI를 `apps/frontend`를 cwd로 실행한다. Windows와 Git Bash 양쪽에서 동일하게 동작한다.

clean-diff는 `api:check`로 구현한다: `npm run api:generate && git diff --exit-code -- src/shared/api/schema.d.ts`. 즉 "두 번 생성해 서로 비교"가 아니라 **재생성 결과를 커밋된 산출물과 비교**한다. CI에서 잡아야 하는 것이 `openapi.json`과 `schema.d.ts`의 드리프트(누군가 스냅샷만 갱신하고 타입을 다시 뽑지 않은 상태)이기 때문에 이 형태가 목적에 더 맞다. 한계도 기록한다 — 이 검사는 생성기 자체의 비결정적 출력은 잡지 못한다. `openapi-typescript` 버전을 올릴 때는 `api:check`를 연달아 두 번 돌려 확인한다.

주의: `git diff --exit-code`는 line ending 정규화 때문에 `git status`에는 ` M`으로 보이는데도 통과할 수 있다(내용이 같으면 diff가 비어 exit 0). 판단 기준은 `git status`가 아니라 `api:check`의 종료 코드다.

- [x] **Step 1b: 엔드포인트 화이트리스트 문서화**

`allowed-operations.ts`에 위 인터페이스의 11개 오퍼레이션 목록을 타입 수준으로 선언하고, `apiClient`가 이 목록 밖의 경로로 호출되면 typecheck·lint·test 중 하나가 반드시 실패하도록 구성한다. 목적은 범위 밖 백엔드 표면(deep 모드, 계산기, 설정, 검증기)이 라이트 모드 앱에 실수로 새어 들어오지 않게 막는 것이다. 주석만 남기는 것으로는 부족하며, 실제로 실패하는 검사가 있어야 한다.

- [x] **Step 2: 실패하는 API 클라이언트 테스트 작성**

fetch를 모킹해 요청이 `/api/v1`을 사용하고, credentials를 포함하며, 공통 에러 envelope(`{ error: { code, message, fieldErrors? } }`)를 파싱하고, 401/404/409/410/422/429 뮤테이션은 자동으로 재시도하지 않는지 검증한다. MSW는 아직 설치되어 있지 않고 이 스텝에 필요하지 않다. 화이트리스트 밖 경로 호출이 차단되는지도 함께 검증한다.

- [x] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/shared/api/client.test.ts`를 실행한다.

예상 결과: 클라이언트 래퍼가 없으므로 FAIL.

- [x] **Step 4: 클라이언트와 프로바이더 구현**

GET 재시도 횟수를 제한하고 뮤테이션은 재시도하지 않는 QueryClient를 하나 생성한다(`createAppQueryClient`, 인스턴스는 `useState` 초기화로 한 번만 만든다). `AppProviders`는 `QueryClientProvider` → `AppErrorBoundary` → `AppRouter` 순으로 감싼다 (data router를 쓰지 않으므로 `RouterProvider`가 아니라 `AppRouter`의 `BrowserRouter`다. 위 **인터페이스** 항목 참고). 서버의 원본 상세 정보를 노출하지 않고 API 에러 코드를 중립적인 한국어 에러 상태로 매핑한다. `shared/api/index.ts`에 `apiClient`, 에러 매핑, `createIdempotencyKey`, 스키마 파생 타입의 공개 API를 모아 re-export한다.

- [x] **Step 5: 라우트 셸과 앱 진입점 교체**

각 라우트는 처음에는 lazy import를 통해 이름이 지정된 페이지 셸을 렌더링한다. 에러 페이지는 인증 실패, 만료, 사용 불가능한 초대, 충돌, rate limit, 일시적 실패 상태를 처리한다. F1의 데모 미리보기를 렌더링하던 `App.tsx`를 `AppProviders` 렌더링으로 교체하고, 그 데모 문구를 검증하던 `App.test.tsx`를 라우터 셸 검증으로 함께 교체한다. 데모 마크업은 F3 랜딩에서 다시 만들므로 보존하지 않는다.

- [x] **Step 6: 검증 및 커밋**

API 생성 clean-diff, lint, typecheck, 전체 테스트, build를 실행한다. `lint`는 `--max-warnings 0`이므로 경고 하나도 허용되지 않는다. 특히 컴포넌트가 아닌 값을 export하는 `.tsx`(예: 라우트 상수를 함께 내보내는 `AppRoutes.tsx`)에서 `react-refresh/only-export-components`가 걸릴 수 있고, `boundaries/no-unknown-files`가 error이므로 새 디렉터리가 `eslint.config.js`의 `boundaries/elements` 패턴에 맞아야 한다. F1이 남긴 `src/shared/config/fsd-boundaries.test.ts`도 계속 통과해야 한다.

~~~bash
git add apps/frontend package-lock.json
git commit -m "feat(web): add typed API client and routes"
~~~

---

### F3: 랜딩과 세션 시작

> ✅ **병합됨** — 이슈 #7, PR #9. `feature/7-landing-session` 브랜치. 아래 본문은 초안이 만들었던 닉네임 다이얼로그를 병합 후 제거하고 무기명 진입으로 정정한 최종 상태를 반영한다.

**파일 (실제 병합된 상태):**
- 생성: `apps/frontend/src/features/create-session/api/create-session.ts` — `createSession()`은 인자를 받지 않고 `{ mode: "light" }`만 전송한다.
- 생성: `apps/frontend/src/features/create-session/ui/StartLightButton.tsx` — CTA에서 곧바로 세션을 생성한다. 실패 메시지는 인라인 `role="alert"`로 보여준다.
- 생성: `apps/frontend/src/features/create-session/index.ts`
- 생성: `apps/frontend/src/pages/landing/ui/LandingPage.tsx`
- 생성: `apps/frontend/src/pages/landing/ui/LandingPage.test.tsx`
- 생성: `apps/frontend/src/pages/landing/index.ts`
- 수정: `apps/frontend/src/app/router/AppRoutes.tsx` — 하지 않았다. F2가 만든 라우트 7개를 그대로 쓴다. 계획 초안의 "router.tsx 수정"과 "NicknameDialog.tsx 생성"은 낡은 항목이며 실제로는 만들어지지 않았다.

**인터페이스:**
- 소비: `POST /api/v1/sessions -> SessionCreated`. **닉네임을 보내지 않는다.** 백엔드 PR #5로 `nickname`이 선택 필드가 되어, 설계 스펙 2.3의 무기명 진입이 최종 동작이다. `mode`는 `"light"`로 고정 전송한다.
- 산출물: 랜딩 CTA를 누르면 **중간 다이얼로그 없이** 곧바로 세션을 생성하고, 성공 후 `activeSessionId`만 저장한 뒤 `/light/1`로 이동한다.

- [x] **Step 1: 실패하는 랜딩 테스트 작성**

정확한 히어로 eyebrow, 헤드라인, 3개의 프라이버시 불릿, 두 모드 카드, 4단계 사용 방법, 제공된 alt 텍스트, 비활성화된 `준비 중` 15분 CTA를 검증한다.

- [x] **Step 2: 실패하는 세션 시작 테스트 작성**

~~~tsx
// CTA 클릭 시 곧바로 세션 생성 요청이 나가고, 본문에 nickname 키가 없는지 검증
await user.click(screen.getByRole("button", { name: /가볍게 맞춰보기/ }));

expect(await screen.findByRole("heading", { name: "라이트 질문" })).toBeInTheDocument();
await expect(request.json()).resolves.toEqual({ mode: "light" });
expect(sessionStorage.getItem("activeSessionId")).toBe("session-a");
~~~

요청 실패 시 이동하지 않고 인라인 오류 상태를 보여주는지도 함께 검증한다.

- [x] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/pages/landing`을 실행한다.

예상 결과: 랜딩과 feature 구현이 없으므로 FAIL.

- [x] **Step 4: 반응형 랜딩 구현**

제공된 히어로와 3분 모드 PNG를 사용하고, 승인된 프레이밍에 맞는 object-position/크롭, border 기반 카드, Green CTA, 15분 카드와 사용법 아이콘용 인라인 SVG, sticky 헤더, 모바일 내비게이션을 구현한다.

- [x] **Step 5: 세션 뮤테이션 구현**

CTA를 누르면 F2가 만든 `createIdempotencyKey()`(`shared/api`)로 클라이언트 idempotency UUID를 생성하고 — 새로 만들지 않는다 — `{ mode: "light" }`로 타입이 지정된 엔드포인트를 호출한다. 공개 세션 ID만 `sessionStorage`에 저장한다. active-session 쿼리를 무효화하고 201 응답을 받은 뒤에만 이동한다.

- [x] **Step 6: 검증 및 커밋**

랜딩 테스트, lint, typecheck, build를 실행한다.

~~~bash
git add apps/frontend
git commit -m "feat(web): launch light sessions from landing"
~~~

---

### F4: 가변 질문 입력, 자동 저장, 제출, 완료

> ✅ **병합됨** — 이슈 #12, PR #14. `feature/12-light-form` 브랜치.

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

- [x] **Step 1: 실패하는 가변 개수 테스트 작성**

3문항 세트를 모킹한다. 진행률이 `1 / 3`으로 표시되고, 다음 버튼은 3단계에서 멈추며, 저장 payload 배열의 길이가 3이고, 점수 관련 UI가 `/5`를 절대 렌더링하지 않는지 검증한다.

- [x] **Step 2: 실패하는 인터랙션 테스트 작성**

Green 본인 답변 칩, Purple 예측 칩, `aria-pressed`, 이전/다음, null로 건너뛰기, 새로고침 시 hydration, 저장 성공, `저장되지 않음 · 다시 시도`, 키보드 인터랙션을 다룬다.

- [x] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/pages/light-form`을 실행한다.

예상 결과: 폼이 존재하지 않으므로 FAIL.

- [x] **Step 4: 폼 상태와 자동 저장 구현**

active session과 고정된 질문 버전, 본인의 입력을 가져온다. 답변은 메모리에만 유지하고, 타입별 PATCH 요청은 debounce 처리하며, 실패 시 로컬 값을 보존하고, 답변과 예측은 절대 web storage에 기록하지 않는다.

- [x] **Step 5: 제출과 완료 구현**

마지막 버튼은 `입력 완료하기` 문구를 표시하고 성공 응답을 받은 뒤에만 라우팅한다. DonePage는 초대 코드, 7일 후 삭제 안내 문구, 읽기 전용 입력 링크, 대기 링크, 홈 링크를 보여준다. 409 응답 시 로컬 데이터를 버리지 않고 읽기 전용 상태로 hydrate한다.

- [x] **Step 6: 검증 및 커밋**

포커스 테스트, lint, typecheck, build를 실행한다.

~~~bash
git add apps/frontend
git commit -m "feat(web): complete variable light questionnaire"
~~~

---

### F5: 초대, 대기, 폴링, 인앱 알림

> ✅ **병합됨** — 이슈 #8, PR #13. `feature/8-invite-waiting` 브랜치. 아래 본문은 초안이 만들었던 `JoinNicknameDialog`를 병합 후 제거하고 무기명 진입으로 정정한 최종 상태를 반영한다.

**파일 (실제 병합된 상태):**
- 생성: `apps/frontend/src/entities/session/api/active-session.ts`
- 생성: `apps/frontend/src/features/join-session/api/join-session.ts` — 닉네임을 보내지 않는다.
- 생성: `apps/frontend/src/features/join-session/ui/JoinSessionButton.tsx`
- 생성: `apps/frontend/src/features/poll-session-status/api/session-status.ts`
- 생성: `apps/frontend/src/features/poll-session-status/model/use-session-status.ts`
- 생성: `apps/frontend/src/features/send-nudge/api/send-nudge.ts`
- 생성: `apps/frontend/src/widgets/waiting-status/ui/WaitingStatus.tsx`
- 생성: `apps/frontend/src/pages/invite/ui/InvitePage.tsx`
- 생성: `apps/frontend/src/pages/invite/ui/InvitePage.test.tsx`
- 생성: `apps/frontend/src/pages/waiting/ui/WaitingPage.tsx`
- 생성: `apps/frontend/src/pages/waiting/ui/WaitingPage.test.tsx`
- 만들지 않음: `JoinNicknameDialog.tsx` — 계획 초안에는 있었으나, 백엔드 PR #5로 `JoinInvitationRequest.nickname`이 선택 필드가 되어 무기명 진입으로 정정됐다. 만들어지지 않았다.

**인터페이스:**
- 소비: 백엔드 B5의 초대, 참가, 상태, nudge 엔드포인트.
- **참가 요청에 `nickname`을 보내지 않는다.** 설계 스펙 2.3의 무기명 진입이 최종 동작이다.
- 산출물: 대기 중일 때만 1000ms 간격으로 폴링하는 `useSessionStatus(sessionId)`. 이 화면에서 준비를 알아내는 수단이 폴링뿐이라 주기가 공개 지연의 하한이고, 3000ms로는 대기 중인 참가자가 다음 tick을 기다리는 동안 스펙의 3초 예산을 다 쓸 수 있어 줄였다. 대기가 얼마나 길어지는지는 프론트엔드가 통제하지 못해 폴링 요청 총량에 상한이 없으며, 1000ms는 그 비용을 감수하고 고른 값이다(요청 예산은 미정).
- 제약: 닉네임을 수집하지 않으므로 저장·렌더링 문제 자체가 없다. 다만 응답 `SessionResponse.participants[].nickname`이 존재하더라도 **어떤 화면에도 렌더링하지 않는다.** 초대·대기 화면은 스펙 2.3대로 일반 카피(`파트너가 함께 해보자고 초대했어요`)를 유지한다. `SessionStatusResponse`는 닉네임을 담지 않고 `partnerJoined`/`partnerCompleted` boolean만 주므로, 대기 화면 구현은 이 플래그만으로 충분하다. 프라이버시 테스트는 응답에 상대 닉네임을 일부러 넣고 화면에 렌더링되지 않음을 확인하는 방식으로 검증했다(`InvitePage.test.tsx`).

- [x] **Step 1: 실패하는 InvitePage 테스트 작성**

일반화된 파트너 문구, 모드/소요시간 배지, 동시 공개 설명, 현재 데이터 프라이버시 문구, 사용 불가 코드 상태, 참가 성공 시 `/light/1`로의 이동을 검증한다.

- [x] **Step 2: 실패하는 WaitingPage 테스트 작성**

파트너 미참가, 파트너 입장 중, 준비 완료, 만료, nudge rate-limit 상태를 다룬다. 잠금 미리보기 아이콘은 준비 완료 상태에서만 사라지고, 복사 피드백 문구가 1.6초간 `복사됨`으로 바뀌는지 검증한다.

- [x] **Step 3: 테스트 실행**

`npm --workspace @mirisallim/frontend run test -- --run src/pages/invite src/pages/waiting`을 실행한다.

예상 결과: invite와 waiting 페이지가 없으므로 FAIL.

- [x] **Step 4: 초대 참가 구현**

코드를 저장하지 않고 미리보기만 하고, 참가 시 F2의 `createIdempotencyKey()`(`shared/api`)로 만든 클라이언트 idempotency 키를 전송하며, 반환된 공개 세션 ID만 저장하고, 인증은 백엔드 쿠키에 의존한다. 참가 요청에는 닉네임을 싣지 않는다.

- [x] **Step 5: 대기와 nudge 구현**

TanStack Query는 준비되지 않은 동안에만 1000ms 간격으로 폴링하고, unmount되거나 준비 완료되면 멈춘다. 주기가 공개 지연의 하한이므로 3000ms로는 스펙의 3초 예산을 지키지 못할 수 있어 1000ms로 줄였고, 폴링 요청 총량에 상한이 없다는 트레이드오프를 감수한다. 파트너가 참가하기 전에는 nudge 대신 링크 재공유를 보여준다. 참가 후에는 nudge 뮤테이션을 허용하고, 429는 다음 가능 시점 안내로 매핑한다.

- [x] **Step 6: 검증 및 커밋**

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
- 소비: 백엔드 B6의 `WaitingResultResponse | ReadyResultResponse` (실제 계약상 스키마명은 `ResultWaitingResponse`, `ResultReadyResponse`다).
- 산출물: 결과 엔티티를 생성하지 않는 대기 리다이렉트/상태, 또는 동적 `questionCount`를 사용하는 준비 완료 결과 UI.
- 이미 있는 것: F2가 `src/shared/api/result.type-test.ts`로 판별 유니온의 waiting 분기가 `result`에 접근하지 못함을 타입 수준에서 고정해 두었다. Step 5의 프라이버시 검증은 이 위에 런타임 검증(접근성 트리, 렌더된 HTML 문자열)을 얹는 것이다.

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

CI는 OpenAPI 생성 clean-diff(`api:check`), ESLint/FSD, TypeScript, Vitest, build, Playwright를 실행한다. Vercel은 CSP, HSTS, `nosniff`, `Referrer-Policy: no-referrer`를 설정하고 `/api/(.*)`를 실제 배포된 백엔드 오리진으로 rewrite한다.

로컬 개발용 `/api` 프록시는 F2가 `vite.config.ts`에 이미 넣었다(대상 `MIRISALLIM_API_PROXY_TARGET`, 기본 `http://127.0.0.1:8000`). F8이 새로 만드는 것은 프로덕션 rewrite뿐이며, 두 경로가 갈라지지 않도록 프론트엔드는 양쪽 모두에서 같은 출처 `/api/v1/...`로만 호출한다는 전제를 유지한다.

// 배포 오리진 확인 필요: 백엔드 CORS 기본값은 Render(`https://mirisalim-backend.onrender.com`)를 가리키지만, 원래 설계 스펙은 Railway를 가정했다. rewrite 대상을 하드코딩하기 전에 인프라 담당자에게 실제 프로덕션 배포처(Render vs Railway)를 재확인한다.

- [ ] **Step 5: Vercel 배포 및 smoke 테스트**

Vercel 프로젝트 `mirisallim`을 `apps/frontend` 루트로 생성하고, rewrite에 사용할 오리진을 Step 4에서 확인한 실제 배포처(Render 또는 Railway)로 설정한 뒤 배포한다. 이후 정확한 프로덕션 URL을 대상으로 Playwright smoke 프로젝트를 실행한다.

- [ ] **Step 6: 문서화 및 커밋**

preview/prod 환경 분리, rewrite 검증, CSP 유지보수, Vercel 롤백, 프로덕션 smoke 명령어를 문서화한다. 로컬 개발용 `MIRISALLIM_API_PROXY_TARGET` 환경변수(F2가 추가, 기본 `http://127.0.0.1:8000`)도 여기서 함께 문서화한다 — 현재 어디에도 설명이 없다.

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
