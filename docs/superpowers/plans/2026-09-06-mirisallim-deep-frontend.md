# 미리살림 딥(15분) 모드 프론트엔드 구현 계획

> **에이전트 작업자 안내:** 각 F 단계는 체크박스(`- [ ]`) 대신 아래 진행 상황 표로 추적한다. 착수 전에 반드시 `AGENTS.md`와 `CLAUDE.md`를 읽는다.

## 현재 진행 상황 (2026-09-06 기준, `develop` 커밋 `ec81b0f`)

| 단계 | 상태 | 이슈 | PR | 트랙 | 비고 |
| --- | --- | --- | --- | --- | --- |
| 계획서 | ✅ 병합됨 | #79 | #80 | — | 이 문서 |
| F9 | ✅ 병합됨 | #81 | #83 | — | 딥 기반. 병합 커밋 `ec81b0f`. `codex-sol-high` 3라운드 + 병합 전 Opus 5 독립 검증. 후속 이슈 #84·#85·#86 |
| F10 | 대기 | — | — | A | 세션·초대·참여·상태·철회 |
| F11 | 대기 | — | — | A | 공동 계획·확인 |
| F12a | 대기 | — | — | B | 기본 재무 입력·자동저장 스파인 |
| F12b | 대기 | — | — | B | 재원·정산·자금 미리보기 |
| F13 | 대기 | — | — | B | 가치관·분담 질문 |
| F14+F15 | 대기 | — | — | 수렴 | 동의·제출·대기 + 공동 리포트. **함께 병합** |
| F16 | 대기 | — | — | 수렴 | 기준표(합의) |
| F17 | 대기 | — | — | 수렴 | 기준회의·해설 |
| F18 | 대기 | — | — | 수렴 | 라운드·E2E·접근성·배포 검증 |

### F9에서 확정된 것과 남은 것

**확정:** 화이트리스트가 딥 31개 + 라이트 12개로 열렸다(리뷰 중 PR #82가 추가한
`meeting/standards`·`meeting/preview` 포함). `entities/deep-input`·`entities/deep-plan`에 zod 미러,
`shared/lib/server-decimal`·`calendar-date`·`funding-id`, `shared/ui/amount-field`,
`/deep/*` 라우트 서브트리가 들어갔다. 테스트 177 → 267.

**F10 착수 전에 처리할 것:**
- **#84 — 미러가 서버 검증자 12개를 놓쳤다.** `SKIPPED_QUESTION_HAS_ANSWER`,
  `DUPLICATE_IMPORTANT_AREA`, `UNKNOWN_CONTEXT_KEY` 등 최소 3건은 F12a·F13이 화면을 만드는
  순간 도달한다. 타입 동치 단언은 모양 드리프트만 잡고 검증자 드리프트는 못 잡는다는 점도
  이 이슈에 기록돼 있다
- **#85 — `AmountField`** id 충돌·상태 융합·0원 주입. 소비자가 생기기 전에 고치는 편이 싸다
- **#86 — `shared/api`·`lib` 정리.** `codeKinds` 13줄이 전부 무의미하고 드리프트 경로를 만든다

**검증이 실제로 잡은 것(참고):** 1라운드에서 `annualRate` 정규식 리터럴의 `\d`가
`"1.5"`를 거부해 금리가 있는 초안의 저장이 통째로 막혔다. 2라운드에서는 `max_digits`와
`decimal_places`를 독립 상한으로 읽어 양방향으로 어긋났다. 해결은 `DebtInput`을 pydantic으로
직접 호출해 실측표를 만드는 것이었다 — **문서 해석이 아니라 실행 결과를 기준으로 삼는다.**

**이 표가 실제 코드 상태와 어긋나면 이 표를 신뢰하지 마라.** `git log --oneline origin/develop`과 `gh pr list --state all`로 직접 확인한 뒤 갱신하라.

## Context

라이트(3분) 모드는 F1~F8로 완주해 프로덕션에 떠 있다. 딥 모드는 **백엔드만 완성돼 있고 프론트가 전혀 없다.**

- 딥 백엔드는 2026-09-03~09-05 사흘간 `testosbug` 단독으로 만들어졌고 `bd4a33c`까지 들어와 있다.
- 프론트는 2026-09-05 PR #75(`8e086bc`)로 **로그인 문 앞까지만** 지었다. 카카오 로그인·`entities/account`·`/deep` 라우트가 있고, 그 안쪽은 `DeepEntryPage`의 `딥모드는 아직 준비 중이에요.` 한 줄이다.
- 프로덕션은 `DEEP_MODE_ENABLED=true`다. `/auth/me`가 404가 아니라 401을 반환하는 것이 그 증거다(둘 다 `get_enabled_settings` 게이트를 공유한다). **딥 API가 지금 실제로 열려 있다.**

기존 계획서(`2026-08-06-mirisallim-light-frontend.md`)는 딥을 **의도적으로 범위 밖으로 밀어냈고** 그 결과가 `allowed-operations.ts`의 12개 화이트리스트다. 딥 관련 계획 문서는 전부 백엔드용이며 하나같이 "프론트 화면은 이번에 만들지 않는다"고 못박고 있다. **딥 프론트엔드 계획서는 이 문서가 처음이다.**

**목표:** 카카오 로그인으로 들어온 두 사람이 공동 계획을 세우고, 각자의 돈 현황과 가치관을 입력하고, 동의 하에 공동 리포트를 받고, 그 위에서 기준표(합의)를 만들고, 추가 질문에 답해 해설까지 받는 종단 흐름을 구축한다.

`CLAUDE.md`가 "계획서가 원본이고 이슈는 그 사본"이라고 규정한다. **각 F 단계 이슈 본문은 이 문서의 해당 섹션에서 파생시킨다.** 둘이 어긋나면 이 문서를 고치고 이슈를 다시 맞춘다.

### 사용자 결정 (2026-09-06)

| 항목 | 결정 |
| --- | --- |
| 계획 범위 | **전체 완주** — 세션 생성부터 기준회의·E2E까지 |
| 재무 입력 | **`DeepInputV3` 전체** — 축소하지 않는다 |
| 디자인 | **레퍼런스 없음** — `@theme` 토큰과 기존 프리미티브로 새로 설계 |

---

## 계약 사실 (검증 완료 — 구현 시 재조사 불필요)

**정본은 `apps/backend/frontend-handoff/02-api-guide.md`다.** `docs/deep-v3-api.md`는 stale 사본이며 존재하지 않는 경로를 참조한다. 읽지 않는다.

### 인증·게이트

- 모든 `/api/v1/deep/v3/*`가 `get_enabled_settings` + `require_account` + `require_session_version`을 통과해야 한다.
- **계정 쿠키 `mrs_account` 전용.** 라이트의 참가자 토큰은 딥에서 통하지 않는다. 카카오 로그인이 하드 선행 조건이다.
- 모든 변경 요청은 `Origin`이 `public_app_origin`과 **정확히 일치**해야 한다(403 `UNTRUSTED_ORIGIN`).
- `POST /sessions`와 `POST /invitations/{code}/join`에만 `Idempotency-Key`가 **필수**(`^[a-zA-Z0-9_-]{1,128}$`).
- 레이트 리밋: 액션별(`create`/`join`/`agreement`/`funding-preview`) user·IP당 20회 → 429.

### CAS 토큰이 네 종류다

| 토큰 | 대상 | 충돌 코드 |
| --- | --- | --- |
| `expectedRevision` | 본인 입력 | `REVISION_CONFLICT` |
| `expectedVersion` | 공동 계획 / 합의 | `PLAN_VERSION_CONFLICT` / `AGREEMENT_VERSION_CONFLICT` |
| `planVersion` | 제출·확인 시 계획 고정 | `PLAN_VERSION_CONFLICT` |
| `expectedRound` | 라운드 | `ROUND_VERSION_CONFLICT` |

- **`PATCH me/input`은 부분 병합이 아니다.** GET한 초안 전체에 변경분을 병합해 통째로 보낸다.
- **`PATCH /plan`은 버전을 올리면서 양쪽 확인을 0으로 리셋한다**(`repository.py:246-250`).
- 한쪽이라도 제출하면 계획은 `PLAN_LOCKED`, 그 사람 입력은 `INPUT_LOCKED`.

### ⚠ 저장이 검증으로 실패한다 — 라이트와 다른 전제

`v3_models.py:85`에서 `DeepInputV3`의 모델 검증자가 **끝에 `self.funding_request(date.max)`를 호출한다.** 즉 `FundingPreviewRequest`의 교차 검증자 8개가 **모든 `PATCH me/input`마다 실행된다.**

라이트의 "저장은 항상 성공하고 409만 처리하면 된다"는 전제가 여기서 깨진다. 정산을 재원보다 먼저 추가하면 `UNKNOWN_FUNDING_REFERENCE`, `sourcesStatus`를 `known`으로 올리기 전에 항목을 넣으면 `FUNDING_ITEMS_REQUIRE_KNOWN_COLLECTION`으로 **입력 중간 상태 자체가 저장 불가**다.

덤으로 `asOf`가 저장 시엔 `date.max`, 프리뷰에선 실제 날짜라 **같은 규칙이 두 경로에서 다르게 판정된다.** 클라이언트 미러는 `asOf`를 인자로 받아야 한다.

### ⚠ 필드 단위 오류가 오지 않는다

`deep/router.py:66-67`이 v3 경로의 **모든 검증 실패를 단일 `422 INVALID_DEEP_INPUT`으로 뭉갠다.** loc 정보가 사라진다. `fieldErrors`가 채워지는 유일한 422는 `INPUT_INCOMPLETE`(제출 시 D1~D10 미응답, `{"values.D3": ["ANSWER_OR_SKIP_REQUIRED"]}`)뿐이다.

**예외 통로가 하나 있다.** `POST /api/v1/deep/funding/preview`는 저장하지 않고 상대 데이터도 읽지 않으면서 `missingFields`와 `issues[{code, message, question, date, sourceId, amountWon}]`를 돌려준다. **필드 정보를 얻는 유일한 서버 채널**이다. 단 자신의 422도 `INVALID_FUNDING_INPUT`으로 붕괴되고 레이트리밋 대상이므로 키 입력마다 부르는 검증기가 아니라 **명시적 "미리보기" 패널**이다. 어떤 핸드오프 문서에도 없지만 스키마는 완성돼 있다.

→ **클라이언트 검증이 선택이 아니라 필수다.**

### 공개 게이트 — 6개 조건이 A·B 각각에 대해 모두 참

`deep/state.py:19-27`: `submittedAt != None` · `confirmedPlanVersion == plan.version` · `consent.version == doc.consentVersion` · `consent.submittedRevision == member.revision` · `consent.round == doc.round` · `shareFinance`/`shareValues` 둘 다 bool.

리포트 블록 가시성도 **양쪽 동의**가 조건이다. 재무 4블록은 양쪽 `shareFinance`, `values`는 양쪽 `shareValues`. 아니면 `unavailable("sharing_not_authorized")`.

**상대의 동의 여부는 어떤 응답에도 노출되지 않는다.** `partnerCompleted` boolean만 온다.

### 폴링 (푸시 없음)

- 제출 대기: `GET /status`(가벼움) 또는 `GET /result`의 waiting
- 해설 대기: `GET /meeting/explanation` — **5초 간격, 최대 60초**. 화면 숨김·철회·완료 시 중단. 시간 초과 후 "다시 확인"도 **GET만**. POST 재시도로 연결하지 않는다.
- **`GET`은 절대 유료 AI 호출을 만들지 않는다.**

### 타입 공백

`GET /me/questions`에 `response_model`이 없어 생성 타입이 `Record<string, unknown>`이다. 같은 문제: `ReportV3.issues`/`topics`, `ReadyResultV3.operatingStatus`, `ReadyGuide.operatingStatus`, `GuideTopic.evidence`. → 수기 인터페이스 + **런타임 파싱으로 그 가정을 검증**한다. 캐스팅만 하면 서버가 모양을 바꿔도 조용히 깨진다.

### 기타 함정

1. `Amount`는 `{value, status, precision}`이고 **`status === "known"` ⟺ `value !== null`**이 강제된다.
2. `extra="forbid"` — 모르는 키 하나로 422. GET한 초안을 그대로 되돌리는 왕복이 안전한 이유다.
3. v3에서 `assets[].housingAllocationWon`/`goalAllocationWon`은 **반드시 0**, `debts[].disposition`은 **반드시 `"keep"`**이다. 배분·상환은 v3 전용 `funding` 구조로만 표현한다.
4. `ExplanationCard.explanation`/`question`에 **숫자 문자가 들어갈 수 없다.** 숫자는 `factIds` → `brief.facts[].valueWon`으로 렌더링한다.
5. `brief.housingGapDate`의 null은 **0이 아니라 "확인 필요"**다.
6. `consentVersion`을 하드코딩하지 않는다. `GET /meeting/me`가 준 값을 그대로 POST한다.
7. `shareWithPartner=false && allowAiProcessing=true`는 422다.
8. `deep-rules-v2`/`deep-copy-ko-v2`는 **라벨일 뿐 대응 파일이 없다.** 실제 계산은 `deep-rules-v1`이다.
9. AI 해설은 `DEEP_MEETING_AI_TOTAL_MICRO_USD` 미설정 시 **항상 템플릿**이다. 운영 활성화가 별도 승인 사항이므로 **템플릿이 기본 경로**라고 보고 설계한다.
10. `MEETING_AI_CONSENT_REQUIRED`(409)는 `service.py:34`가 권한을 하드코딩해 **도달 불가능한 죽은 코드**다. 처리하지 않는다.
11. `/meeting/guide`는 미준비 시 **200 `{status:"waiting"}`**, `/meeting/me`는 **409 `MEETING_REPORT_NOT_READY`**다. 같은 상황에 응답이 다르다.

---

## 전역 제약사항

- FSD 의존 방향 `app → pages → widgets → features → entities → shared`. 슬라이스 간 import는 `index.ts` 배럴 경유.
- 서버 DTO를 수동 중복 선언하지 않고 `schema.d.ts`에서 파생한다. **예외는 타입 공백 구역뿐이고 그때는 런타임 파싱을 함께 붙인다.**
- **진행 중 답변을 `localStorage`/`sessionStorage`에 넣지 않는다.** 공개 세션 UUID만 저장한다. 새로고침 복구는 서버 GET → `hydrate()`. `e2e/privacy-gate.spec.ts`가 강제한다. 딥은 근거가 더 강하다 — 백엔드가 `except Exception → DEEP_UNAVAILABLE`로 재무 데이터의 로그 유출까지 막고 있다.
- **새 의존성을 설치하지 않는다.** 이미 설치돼 있으나 미사용인 `zod`는 사용한다. `react-hook-form`은 쓰지 않는다(사유는 F9).
- `openapi.json`은 백엔드 소유 읽기 전용. `schema.d.ts`는 `api:generate`로만 갱신.
- 딥 강조색은 Purple(`--color-purple` `#8A6FD1`, `--color-purple-strong` `#6848AE`). 랜딩이 이미 15분 모드를 Purple로 배정해 뒀다.
- 새 색 토큰을 추가하면 `src/app/styles/globals.test.ts`에 명암비 단언을 함께 추가한다.
- **금액 화면에서 사용자를 탓하거나 우열을 표현하지 않는다.** "부족"은 상태이지 평가가 아니다.
- 각 F 단계는 착수 전 이슈 생성(`[Frontend] F<n>: <한국어 요약>`), `develop`에서 브랜치, PR base `develop`.
- 병합 전 5개 게이트: `api:check` · `lint` · `typecheck` · `test -- --run` · `build`.

### 과거 오류에서 상속하는 제약 (`docs/errors/` 5건)

1. **완료 조건을 개수로 쓰지 않는다.** 딥은 화면 수·호출 수를 세기 쉬워 특히 위험하다. 의도를 그대로 쓴다.
2. **이슈가 나열한 옵션을 전부 넣지 않는다.** 최소 옵션으로 회귀 테스트를 통과시키고 나머지는 기각 근거를 남긴다.
3. **하나의 상태 값이 두 질문에 답하게 하지 않는다.** 딥은 `waiting`/`ready`/`template`/`ai`/`budget_exhausted`/`locked`가 얽혀 이 함정이 정확히 재현된다.
4. **타임아웃·재시도를 메서드별로 분리한다.**
5. **커밋·문서에 확인하지 않은 일반화를 쓰지 않는다.**

---

## 진행 방식

### 프로덕션 노출 통제 (가장 중요)

`develop`이 곧 Vercel 프로덕션 브랜치다. **F10만 병합된 상태가 최악이다** — 사용자가 실제 딥 세션을 만들고 초대 코드까지 받은 뒤 아무것도 없는 화면에 도달한다. 세션은 `expiresAt`이 걸린 실데이터고 `create`는 레이트리밋 대상이라 되돌릴 수도 없다.

**두 가지로 막는다.**
1. `POST /withdraw`(탈출구)와 `GET /status`를 **F10에 포함한다.** 후반부로 미루지 않는다.
2. **딥 진입 CTA는 F15 병합 전까지 어떤 화면에도 노출하지 않는다.** `/deep/*` 직접 URL은 살려 두어 테스트에 쓴다. 랜딩의 `15분 모드 준비 중` 문구는 F15까지 유지한다.

### 2트랙 병렬

공유 지점이 F9뿐이라 실제로 병렬이 성립한다.

~~~text
F9 (기반 · 사용자 노출 0)
 ├─ 트랙 A: F10(세션·초대·참여·상태·철회) → F11(공동 계획·확인)
 └─ 트랙 B: F12a(기본 재무·자동저장 스파인) → F12b(재원·정산·미리보기) → F13(가치관·분담 질문)
수렴: F14(동의·제출·대기) → F15(공동 리포트) → F16(기준표) → F17(기준회의) → F18(라운드·E2E·배포)
~~~

**숨은 의존 간선 세 개** — 초안에서 놓치기 쉬운 부분이다.
- `can_publish`가 `confirmedPlanVersion == plan.version`을 요구하므로 **F11이 `plan/confirm`을 빼면 F14는 영원히 제출 불가**다. `plan/confirm`은 F11에서 분리할 수 없다.
- `v3_questions.py`가 C1·C2의 `requiresSharedBudget`, C3 바인딩, followup(P8·U4)을 **`plan.commonExpensesStatus`와 `funding.sources`에서** 계산한다. 따라서 **F13은 F11과 F12b 양쪽에 의존**한다.
- **F14·F15는 함께 병합한다.** F14만 있으면 양쪽 제출 후 `status: ready`인데 결과 화면이 없어 흐름이 죽는다.

### 워크플로

각 단계는 워크트리에서 `codex-luna-xhigh`가 구현하고 **`codex-sol-high`가 검증**한다. 검증은 `--deps`로 선언한 DAG 의존성이며 건너뛰지 않는다. 코디네이터가 커밋·PR을 담당한다(샌드박스가 워크트리의 `.git`을 막는다).

---

## 파일 지도

~~~text
apps/frontend/src/
├─ app/router/AppRoutes.tsx            (F9: /deep 서브트리)
├─ pages/
│  ├─ deep-entry/                      (기존 — F10에서 허브로 대체)
│  ├─ deep-invite/    deep-plan/       (F10, F11)
│  ├─ deep-input/     deep-questions/  (F12, F13)
│  ├─ deep-waiting/   deep-result/     (F14, F15)
│  └─ deep-agreements/ deep-meeting/   (F16, F17)
├─ widgets/
│  ├─ deep-progress/  deep-plan-form/  funding-preview/
│  ├─ deep-report-*/  agreement-card/  meeting-*/
├─ features/
│  ├─ create-deep-session/ join-deep-session/ withdraw-deep-session/
│  ├─ save-deep-input/     save-deep-plan/    confirm-deep-plan/
│  ├─ submit-deep-input/   poll-deep-status/
│  ├─ propose-agreement/   confirm-agreement/
│  └─ complete-meeting/    poll-explanation/
├─ entities/
│  ├─ deep-session/  deep-input/  deep-plan/
│  ├─ deep-question/ deep-report/ deep-agreement/ deep-meeting/
└─ shared/
   ├─ api/allowed-operations.ts        (F9: 확장)
   ├─ api/errors.ts                    (F9: deep 코드 + 오퍼레이션별 타임아웃)
   ├─ ui/amount-field/ money-input/    (F9)
   └─ lib/polling/                     (F15: 5s/60s 프리미티브)
~~~

---

## F9 — 딥 기반 (사용자 노출 0)

**의도:** 이후 모든 단계가 같은 계약 해석·같은 검증기·같은 오류 매핑 위에서 작업하게 만든다. 두 트랙이 공유 파일을 반복 수정하지 않도록 **화이트리스트를 한 번에 전부** 연다(런타임 영향이 없다).

- `allowed-operations.ts`: 딥 v3 경로 전체 + `POST /api/v1/deep/funding/preview` 등록. `AllowedMethod` 유니온에 `"delete"` 추가(`DELETE /meeting/me/consent`).
- `errors.ts`: 딥 오류 코드를 `codeKinds`에 등재. **409를 `kind`가 아니라 `code`로 분기**할 수 있게 노출한다 — `REVISION_CONFLICT`/`INPUT_LOCKED`/`PLAN_VERSION_CONFLICT`/`PLAN_LOCKED`는 대응이 전부 다르다.
- **오퍼레이션별 타임아웃 예산.** 현재 `API_REQUEST_TIMEOUT_MS = 10_000`이 전 메서드 일괄이다. `POST /meeting/complete`는 AI 생성을 유발할 수 있어 10초로는 모자라다. 그렇다고 일괄 상향하면 `docs/errors/2026-09-05-request-timeout-locked-users-out-of-join.md`의 반복이다. 오퍼레이션별로 분리한다.
- `entities/deep-input`·`entities/deep-plan`에 **zod 미러**(`model/schema.ts`)와 `.type-test.ts`.
- `entities/deep-question`: `me/questions` 수기 타입 + 런타임 파싱.
- `shared/ui`에 `AmountField`(3-상태 컨트롤: 알고 있음 / 모름 / 밝히지 않음 + 금액), 원 단위 입력기, `FundingId` 생성기.
- `/deep/*` 라우트 서브트리(전부 준비 중 렌더).
- 가득 찬 `DeepInputV3` 픽스처 1건. `login-check/sample.json`을 출발점으로 쓴다.

**zod를 쓰되 범위를 좁힌다.** 응답 검증이 아니라 **PATCH 직전 요청 본문 검증**으로만 쓴다. 위치는 `entities/*`이지 `shared`가 아니다 — 도메인 형상이고, entities에 두어야 features·widgets가 공개 API로 내려받는 방향이 유지된다.

`schema.d.ts`와의 동기화는 코드젠이 아니라 **타입 동치 단언**으로 한다. `z.infer<typeof deepInputV3Schema>`와 `components["schemas"]["DeepInputV3"]`의 상호 할당 가능성을 `.type-test.ts`에서 단언하면 `api:check` + `typecheck` 두 게이트가 백엔드 드리프트를 자동으로 잡는다. 저장소에 이미 `allowed-operations.type-test.ts` 선례가 있다.

**미러할 교차 검증자** (코드 문자열을 키로 한 테이블 주도 테스트):
`AMOUNT_STATUS_MISMATCH` · `ITEMS_REQUIRE_KNOWN_COLLECTION` · `DUPLICATE_FUNDING_ID` · `UNKNOWN_FUNDING_REFERENCE` · `SETTLEMENT_PARTS_MISMATCH` · `SETTLEMENT_EXCEEDS_DEBT` · `ALLOCATION_EXCEEDS_NET_SOURCE` · `FUNDING_EXCEEDS_OWN_ASSET` · `FUNDING_ASSET_REFERENCE_MISMATCH` · `EXTERNAL_SOURCE_DUPLICATES_ASSET` · `DEADLINE_TOTAL_MISMATCH`

**미러하지 않는 것:** `USE_V3_FUNDING_ALLOCATIONS_ONLY` · `USE_V3_SETTLEMENT_EVENTS_ONLY` · `V3_ID_TOO_LONG`. UI가 구조적으로 도달 불가하게 만드는 규칙이다. 서버 검증자를 전부 복제하는 것이 바로 기록된 "옵션을 전부 구현" 실수다.

**`react-hook-form`은 쓰지 않는다.** 비제어 폼 상태 + Zustand 정본 + 자동저장을 겹치면 아키텍처 수준에서 "한 값이 두 질문에 답하는" 구조가 된다. 리프 아이템 편집기 안에서만 예외를 검토한다.

**완료 조건:** 딥 경로를 `apiClient`로 호출하는 코드가 컴파일되고, 계약 위반 입력이 네트워크에 나가기 전에 코드 문자열로 식별되며, 사용자에게 보이는 동작은 변하지 않는다.

## F10 — 세션 생성·초대·참여 (트랙 A)

`POST /sessions` · `POST /invitations/{code}/join` · `GET /status` · **`POST /withdraw`**

- 생성/참여는 `useRef`로 시도 단위 `Idempotency-Key`를 유지한다(라이트 `StartLightButton` 선례).
- 409 분기: `SELF_INVITATION`(본인 초대) · `SESSION_FULL`(이미 두 명) · `IDEMPOTENCY_CONFLICT`. 이미 참여한 본인의 재요청은 **200 멱등 재생**이므로 오류로 취급하지 않는다.
- `/deep`을 허브로 바꾼다: 진행 중 세션이 있으면 이어가기, 없으면 시작/초대코드 입력.
- **철회를 반드시 포함한다.** 사용자가 만든 세션에서 빠져나올 수 없는 상태로 프로덕션에 올리지 않는다.

**완료 조건:** 두 계정이 한 세션에 들어가고, 어느 쪽이든 스스로 세션을 닫고 나올 수 있다.

## F11 — 공동 계획 (트랙 A)

`GET/PATCH /plan` · **`POST /plan/confirm`**

`SharedPlanV3`: `startMonth`(필수) · `housingType`(keep/rent/jeonse/buy) · `monthlyHousingCost`·`housingPriceWon`·`oneOffCostsWon` · `newHousingLoan` · `target`(제목·금액·목표월) · `fundingAsOf`(필수) · `fundingDeadlines[]` · `commonExpensesStatus`+`commonExpenses`(6분류) · `newLoanAvailableOn` · `newLoanCertainty`.

- **`PATCH`가 양쪽 확인을 리셋한다는 사실을 저장 전에 알린다.** 확인 UI 없이 배포하면 사용자가 자기 진행을 지우는 것을 인지할 수 없다.
- 클라이언트 미러: `BUDGET_ITEMS_REQUIRE_KNOWN_SCOPE` · `DUPLICATE_FUNDING_DEADLINE` · `DEADLINE_TOTAL_MISMATCH` · `INVALID_NEW_HOUSING_LOAN`.
- `PLAN_LOCKED`(한쪽 제출 후)는 읽기 전용 전환.

**완료 조건:** 두 사람이 같은 계획 버전을 확인한 상태에 도달할 수 있고, 계획이 바뀌면 양쪽이 다시 확인해야 한다는 것이 화면에 드러난다.

## F12a — 기본 재무 입력 + 자동저장 스파인 (트랙 B)

`GET/PATCH /me/input`의 `income` · `fixedExpenses`(5) · `variableExpenses`(5) · `housingCost` · `debtsStatus`+`debts[]` · `assetsStatus`+`assets[]` · `livingTogether`.

**상태 설계 — 문서 단위로 스토어를 나눈다.** 단일 "deep 스토어"를 만들지 않는다. CAS 토큰이 세 종류고 잠금 규칙이 서로 다르다.

`useDeepInputStore`:
- `draft: DeepInputV3` — 서버 문서와 **동일 형상**. 부분 객체 금지(전체 치환 PATCH라서).
- `baseRevision: number` — 현재 draft가 파생된 CAS 토큰.
- `syncState: "idle"|"saving"|"retrying"|"conflict"|"locked"|"rejected"` — **서버 저장 상태 한 질문에만** 답한다. 검증 결과는 별도 `blockingIssues: {code, path}[]`로 분리한다.
- persist·웹 스토리지 금지. 새로고침은 GET → `hydrate()`.
- **디바운스 2단:** 350ms 로컬 커밋 / 1200ms(또는 blur) 네트워크 PATCH. 인플라이트 PATCH는 항상 1개 + trailing 병합. 두 개가 겹치면 두 번째가 자기 선행 요청 때문에 `REVISION_CONFLICT`를 맞는다.
- **`blockingIssues`가 비어 있지 않으면 PATCH를 보내지 않는다.** 마지막 유효 스냅샷만 저장하고 델타는 로컬 보관 + "저장 대기" 표시. 이것이 붕괴된 422를 UX 전면에서 치우는 실제 메커니즘이다.
- 409는 `code`로 분기한다: `REVISION_CONFLICT` → 재조회 후 병합, `INPUT_LOCKED` → 읽기 전용.

**완료 조건:** 여러 화면에 걸친 재무 입력이 새로고침을 건너 살아남고, 저장할 수 없는 중간 상태가 사용자에게 이유와 함께 보인다.

## F12b — 재원·정산·배분 + 미리보기 (트랙 B, 최고 위험)

`funding.sourcesStatus`+`sources[]`(≤100) · `settlementsStatus`+`settlements[]`(≤60, `parts[]`≤100) · `afterSettlementMonthlyPayments` · `POST /deep/funding/preview`.

id로 세 컬렉션이 상호참조되고 날짜축과 금액 불변식이 8개 검증자로 얽힌다. **이 계획에서 가장 폭발하기 쉬운 단계다.**

- 위험 완화는 F9가 이미 담당한다(`Amount` 컨트롤·zod 미러·코드 테이블·id 생성기·화이트리스트·풀 픽스처).
- 추가 완화: **`funding/preview` 왕복을 F12a 끝에서 스켈레톤 데이터로 먼저 붙여 본다.** F12b에서 처음 연결하지 않는다.
- 미리보기는 명시적 버튼이다. 레이트리밋(20회) 대상이므로 입력마다 부르지 않는다.
- `asOf`를 인자로 받는 미러를 쓴다. 저장(`date.max`)과 미리보기(실제 날짜)의 판정이 다르다.

**완료 조건:** 재원과 상환을 연결한 입력이 서버에 저장되고, 서버가 거절할 조합을 사용자가 저장 전에 이유와 함께 알 수 있다.

## F13 — 가치관·분담 질문 (트랙 B, F11·F12b 의존)

`GET /me/questions` → D1~D10(5점 척도, 역방향은 **D2·D7·D8만**) · C1~C6 · followups(P8·U4) · consent 블록.

- C1~C6은 타입이 6종으로 제각각이다: `amount`(C1·C2) · `fundingAllocation`(C3) · `amounts`(C4) · `constraints`(C5) · `choice`(C6). C1·C2는 `requiresSharedBudget`이라 계획이 선행돼야 한다.
- `constraints[]`(≤20)는 C5가 바인딩한다: `kind`(5) · `scope`(2) · `strength`(2) · `amount` · `allowBorrowing` · `note`(≤300).
- 진행률은 **적용되는 질문 기준**이다. 고정 문항 수를 약속하지 않는다(설계 문서 명시). 라이트의 `AnswerGroup`·`PillToggle`을 재사용하되 5점 척도는 새 컴포넌트다.
- `skippedQuestionIds`와 `values`가 동시에 채워지면 `SKIPPED_QUESTION_HAS_ANSWER`다. 건너뛰기는 값을 지운다.
- `importantAreas`는 최대 2개, `contextNotes` 키는 D1~D10 ∪ 영역명으로 제한된다.

**완료 조건:** 서버가 준 질문만 렌더되고, 조건부 질문이 계획·재원 변화에 따라 나타났다 사라지며, 제출을 막는 미응답이 사용자에게 특정된다.

## F14 + F15 — 동의·제출·대기 + 공동 리포트 (함께 병합)

**F14:** `POST /me/submit`(`expectedRevision`·`planVersion`·`consentVersion:"deep-sharing-v2"`·`shareFinance`·`shareValues`) · `GET /status` 폴링.

- 동의는 **화면 하단 한 곳에 모은다.** 단계마다 팝업을 띄우지 않는다(설계 명시).
- `INPUT_INCOMPLETE`의 `fieldErrors`를 해당 질문으로 되돌려 보낸다. 딥에서 필드 정보를 주는 유일한 422다.
- 재제출: 동일 consent면 무변경 200, 다른 consent면 `INPUT_LOCKED`.
- **상대 동의 여부를 추론해 보여주지 않는다.** `partnerCompleted`만 쓴다.

**F15:** `GET /result` ready → `ReportV3`(cashflow·housing·goal·planning·values 5블록 + issues + topics + limitations) + `agreements` + `operatingStatus`.

- 각 `CalculationBlock`은 `available`/`partial`/`unavailable`이고 `missingFields`·`assumptions`·`reason`을 갖는다. **`unavailable("sharing_not_authorized")`를 오류로 렌더하지 않는다** — 동의하지 않은 정상 상태다.
- `issues[]`·`topics[]`·`operatingStatus`는 타입 공백이다. 수기 타입 + 런타임 파싱. `issues[].code` 집합은 `v3_report.py:17-27`의 `topic_priority`에서 확인된다.
- **5초/60초 폴링 프리미티브를 여기서 만든다.** F17이 재발명하지 않도록 `shared/lib/polling`에 둔다.
- 여기까지 병합되면 **딥 진입 CTA를 노출한다.**

**완료 조건:** 양쪽이 제출한 뒤 두 사람이 같은 리포트를 보고, 동의하지 않은 영역이 오류가 아니라 선택의 결과로 표시된다.

## F16 — 기준표(합의)

`GET/POST /agreements` · `PATCH /agreements/{id}` · `POST .../confirm` · `POST .../defer`

- `DecisionTerms`: `topic`(8) · `scope` · `owner`(A/B/both) · `startMonth` · `dueDay` · `monthlyContributions` · `commonScope` · `exceptions`. `topic === "monthlyContribution"`이면 `monthlyContributions`에 A·B가 **둘 다** 있어야 한다(`BOTH_CONTRIBUTIONS_REQUIRED`). 아니면 넣으면 안 된다.
- 상태 `proposed`/`agreed`/`deferred`의 한국어 매핑은 프론트 소유다: **제안됨 / 둘 다 확인 / 보류**.
- 수정하면 확인이 풀린다. `AGREEMENT_VERSION_CONFLICT`는 재조회 후 재시도.

**완료 조건:** 두 사람이 금액·범위·시작월이 명시된 기준을 만들고 각자 확인하거나 보류할 수 있으며, 한쪽이 고치면 재확인이 필요하다는 것이 드러난다.

## F17 — 기준회의 (두 번째 위험 지점)

`GET /meeting/guide` → `GET /meeting/me` → **`POST /meeting/complete`** → `GET /meeting/explanation` 폴링

- **개발자 점검용 개별 버튼을 답습하지 않는다.** `docs/deep-meeting-api.md`가 명시적으로 금지한 형태이며 `pages/login-check/ui/DeepCheck.tsx`가 정확히 그 반례다. 동의는 하단 한 곳, 상대 공유와 AI 처리는 **기본 미선택**, 최종 버튼 하나.
- `POST /complete`가 답변·동의를 원자 저장하고 같은 요청에서 해설까지 만든다. **동일 재전송은 no-op**이다.
- 폴링은 F15의 프리미티브를 쓴다. 타임아웃 후 "다시 확인"도 **GET만**.
- 해설 카드에 숫자를 넣지 않는다. `factIds` → `brief.facts[].valueWon`으로 렌더링한다.
- `providerStatus`가 `disabled`이거나 예산 미설정이면 **템플릿 해설이 정상 경로**다. 실패로 표시하지 않는다.
- **AI 카드 세 개 뒤에도 guide의 나머지 쟁점을 삭제하지 않는다**(인계 문서 명시).

**완료 조건:** 각자 하단에서 한 번 완료하면 두 사람이 같은 해설을 보고, 답변을 고치면 이전 동의로 새 해설이 생성되지 않는다.

## F18 — 라운드·철회·E2E·배포 검증

`GET/POST /rounds`(양쪽 요청 필요, `pending`은 상대 대기) · E2E · 접근성 · 프로덕션 스모크.

**E2E의 핵심 난점:** 딥은 계정 쿠키가 필수인데 **카카오 OAuth는 CI에서 돌릴 수 없다.** `/api/v1/auth/reviewer/{context,login,reset}`가 유일한 통로다. `playwright.config.ts`의 백엔드 `webServer` 환경변수에 `DEEP_MODE_ENABLED=true`와 리뷰어 로그인 설정을 추가해야 한다. **이 경로를 F18까지 미루지 말고 F10에서 한 번 뚫어 둔다** — 못 뚫리면 그 뒤 모든 단계가 수동 테스트만 남는다.

- `e2e/support/deep-flow.ts` 헬퍼를 먼저 만들고 스펙은 얇게 유지한다(라이트 선례).
- 두 개의 독립 브라우저 컨텍스트로 A·B를 동시에 몬다.
- `@axe-core/playwright`로 serious/critical 0건.
- 프로덕션 스모크 기록은 **종료 코드·테스트 수·호스트·헤더 이름만** 남긴다. 쿠키·응답 본문·토큰·답변은 기록하지 않는다.

---

## 검증

각 단계 병합 전:

~~~bash
npm --workspace @mirisallim/frontend run api:check
npm --workspace @mirisallim/frontend run lint
npm --workspace @mirisallim/frontend run typecheck
npm --workspace @mirisallim/frontend run test -- --run
npm --workspace @mirisallim/frontend run build
~~~

F18 및 종단 확인:

~~~bash
npm --workspace @mirisallim/frontend run test:e2e
~~~

로컬 딥 E2E는 백엔드에 `DEEP_MODE_ENABLED=true`와 리뷰어 로그인 설정이 필요하다. Mongo를 쓰려면 `MIRISALLIM_E2E_USE_MONGO=1`.

**단계별 종단 확인은 두 계정으로 한다.** 딥은 혼자서 검증할 수 있는 흐름이 거의 없다 — 공개 게이트가 A·B 양쪽 조건을 요구하기 때문이다.

---

## 실행 절차 (워크트리·브랜치·에이전트)

### 상수

~~~text
repoId   2aebd786-298f-4802-9bce-7692a72cb670
본체     C:/Users/jhcho/Documents/MIRI_FE          (브랜치 develop, 코디네이터 전용)
워크트리 C:/Users/jhcho/orca/workspaces/MIRI_FE/<name>
구현자   codex  gpt-5.6-luna  xhigh
검증자   codex  gpt-5.6-sol   high
~~~

`orca repo list`로 확인한 것: `setupAgentStartupPolicy`가 `start-immediately`라 2단계 custom-argv 경로가 허용된다. `worktreeBaseRef`는 `origin/develop`. `scripts.setup`이 **비어 있어 `--setup run`을 줘도 아무것도 설치되지 않는다** — `npm ci`는 수동이다.

### 단계별 워크트리·브랜치 이름

`<N>`은 **이슈 번호이지 F 번호가 아니다.** GitHub이 이슈와 PR 번호를 공유하므로 둘은 반드시 어긋난다.

| 단계 | 워크트리 `--name` | 최종 브랜치 | 트랙 |
| --- | --- | --- | --- |
| F9 | `deep-f9-foundation` | `chore/<N>-deep-foundation` | — |
| F10 | `deep-f10-session` | `feature/<N>-deep-session` | A |
| F11 | `deep-f11-plan` | `feature/<N>-deep-plan` | A |
| F12a | `deep-f12a-input` | `feature/<N>-deep-input-core` | B |
| F12b | `deep-f12b-funding` | `feature/<N>-deep-funding` | B |
| F13 | `deep-f13-questions` | `feature/<N>-deep-questions` | B |
| F14+15 | `deep-f14-result` | `feature/<N>-deep-result` | 수렴 |
| F16 | `deep-f16-agreements` | `feature/<N>-deep-agreements` | 수렴 |
| F17 | `deep-f17-meeting` | `feature/<N>-deep-meeting` | 수렴 |
| F18 | `deep-f18-e2e` | `chore/<N>-deep-e2e` | 수렴 |

**동시 워크트리는 최대 2개다**(트랙 A 하나 + 트랙 B 하나). 라이트 계획이 전면 병렬을 거부한 이유가 그대로 유효하다 — 워크트리 수에 비례해 삭제 사고 위험이 커진다.

### 단계 하나의 절차

**1. 이슈** (코디네이터가 본체에서). 본문은 이 계획서의 해당 F 섹션에서 파생시킨다.

~~~bash
gh issue create --title "[Frontend] F9: 딥 기반 — 화이트리스트·계약 미러·라우트 셸" --body-file <파일>
~~~

**2. 워크트리 생성**

~~~bash
orca worktree create --name deep-f9-foundation \
  --repo id:2aebd786-298f-4802-9bce-7692a72cb670 \
  --no-parent --base-branch develop --issue <N> --setup run --json
~~~

**3. 브랜치 이름 교정.** `worktree create`에 브랜치 지정 플래그가 없어 `hotpringles/deep-f9-foundation`이 만들어진다. `CLAUDE.md` 규칙에 맞춘다.

~~~bash
git -C <워크트리> branch -m chore/<N>-deep-foundation
~~~

**4. 의존성.** 워크트리 안에서 `npm ci`를 실행한다. **`node_modules`를 junction으로 연결하지 않는다** — 실제로 재귀 삭제가 링크를 타고 들어가 본체의 `apps/frontend`를 지운 사고가 있었다.

**5. 브리프 두 개를 코디네이터가 작성한다.**

- `.agent/CONTEXT.md` — 저장소 규칙, 계약 사실, **이전 단계에서 확정된 결론**. 단계마다 갱신되어 이월된다.
- `.agent/TASK.md` — 이번 단계만의 지시와 완료 조건.

산출물은 구현 `.agent/RESULT.md`, 검증 `.agent/REVIEW-RESULT.md`.

**6. 검증을 DAG 의존성으로 선언한다.** 구현이 끝난 뒤 리뷰 태스크를 즉흥으로 만들지 않는다. 그러면 절차가 Run 구조가 아니라 내 기억에 남는다.

~~~bash
RUN=$(orca orchestration run-create --objective "이슈 #<N>: F9 딥 기반" --json | jq -r .result.run.id)
IMPL=$(orca orchestration task-create --run "$RUN" --task-title "F9 구현" \
  --spec "워크트리의 .agent/CONTEXT.md와 .agent/TASK.md를 따른다." --json | jq -r .result.task.id)
orca orchestration task-create --run "$RUN" --task-title "F9 검증" --deps "[\"$IMPL\"]" \
  --spec "이슈 #<N> 검증. 커밋 <SHA>. .agent/REVIEW-TASK.md를 따른다." --json
~~~

구현 태스크를 `task-update --status completed`로 종결하면 검증 태스크가 `pending` → `ready`로 자동 전이한다.

**7. 에이전트 기동.** 만들기 전에 `orca terminal list --worktree <selector>`로 기존 터미널을 확인한다. 생성 명령은 멱등하지 않다.

~~~bash
orca terminal create --worktree id:<repoId>::<워크트리> --title deep-f9-foundation --json \
  --command 'codex -a never -s workspace-write --model gpt-5.6-luna -c model_reasoning_effort="xhigh"'
orca orchestration dispatch --task "$IMPL" --to <handle> --inject --json
~~~

검증은 같은 워크트리에 별도 터미널로 띄운다.

~~~bash
--command 'codex -a never -s workspace-write --model gpt-5.6-sol -c model_reasoning_effort="high"'
~~~

`worktree create`가 남기는 빈 `Terminal 1` fallback 셸은 `preview`가 빈 프롬프트인 것을 확인한 뒤 `orca terminal close`로 닫는다.

**8. 코디네이터가 커밋하고 PR을 연다.**

~~~bash
gh pr create --base develop --head <브랜치> --title "<제목>" --body "Closes #<N>

<요약>"
~~~

`--head`를 반드시 준다. 본체가 `develop`에 있어 생략하면 "head branch develop is the same as base branch" 오류가 난다.

**9. 병합 후** 원격 브랜치를 삭제하고, 이 계획서의 진행 표를 갱신한다. 사소하지 않은 설계·코드 오류를 고쳤다면 `docs/errors/`에 기록했는지 확인한다.

### 에이전트 브리프에 미리 적을 샌드박스 한계

- **네트워크 차단** — `gh`·`curl`이 실패한다. 이슈 본문은 `.agent/` 파일로 내려준다.
- **Orca IPC 차단** — 워크트리 안에서 `orca` 명령이 액세스 거부로 실패한다("Orca is not running"이라고 표시되지만 거짓이다). 그래서 워커가 `worker_done`을 보내지 못하고 dispatch가 settle되지 않는다. **코디네이터가 매 라운드 `task-update --status completed`로 직접 종결해야** 다음이 풀린다.
- **커밋 불가** — 워크트리의 `.git`이 샌드박스 밖이라 `index.lock` 권한 거부다. `--add-dir`로도 풀리지 않는다. **커밋은 코디네이터 몫**이 기본 역할 분담이다.
- 에이전트는 이슈·브랜치·PR을 만들지 않고, push하지 않고, `orca orchestration`과 `gh`를 실행하지 않는다.
- `apps/backend/`는 읽기 전용이다. 프론트 작업에서 수정하지 않는다.

### 진행 판정

**`orca terminal tail`을 믿지 않는다. 이 빌드에서 `{}`만 반환한다.** tail 기반 감지는 무엇을 검사하든 거짓 통과한다 — 빈 응답은 영원히 "안정적"이다. 쓸 수 있는 것은 `orca terminal list --worktree <selector>`의 **`preview` 필드**뿐이다.

**완료는 상태가 아니라 산출물로 판정한다.** `agents[]`가 `done`인데 파일 변경도 보고서도 없는 빈 라운드가 실제로 있었다. `.agent/RESULT*.md`의 존재와 `git status`의 변경을 본다. 빈손이면 재시도로 라운드를 태우지 말고 코디네이터가 직접 처리하되, **그 산출물이 에이전트 검토를 안 거친 코드라는 사실을 다음 검증 브리프에 적는다.**

### 첫 실행 순서

1. F9 이슈 생성 → `deep-f9-foundation` 워크트리 → 구현·검증 DAG → PR → 병합
2. F9 병합 후 트랙 A(F10)와 트랙 B(F12a)를 **동시에** 착수

F9는 두 트랙이 공유하는 유일한 지점이므로 병합 전에는 어느 트랙도 시작하지 않는다.

---

## 미해결 사항

1. **AI 해설 운영 활성화는 이 계획의 범위 밖이다.** `DEEP_MEETING_AI_EXTENDED_ENABLED`와 누적 예산 설정은 별도 승인 사항이다. F17은 템플릿 경로를 기본으로 완성하고, 유료 경로는 설정이 켜지면 자동으로 동작하는 형태로 둔다.
2. **개인정보 고지 검토가 끝나지 않았다.** 설계 문서가 개인정보 보호법 제22조·제28조의8을 참조하되 "현재 안내문만으로 모든 의무 충족이라고 표시하지 않는다"고 명시했다. 동의 UI는 만들되 법적 충족을 주장하는 문구를 넣지 않는다.
3. **`pages/login-check`의 처분은 이 계획에서 다루지 않는다.** `App.tsx`가 라우터 밖에서 가로채는 개발자 도구이며 다른 트랙(`testosbug`)이 2026-09-05에 재작성했다. F17이 정식 슬라이스를 완성한 뒤 별도 이슈로 판단한다.
4. **이슈 #76**(인증 비활성 배포에서 `login-check`가 카카오 링크를 렌더)도 같은 파일이라 위와 함께 묶는다.
