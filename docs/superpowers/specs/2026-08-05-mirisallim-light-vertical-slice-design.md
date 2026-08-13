# 미리살림 3분 모드 프로덕션 수직 슬라이스 설계

- 작성일: 2026-08-05
- 상태: 사용자 문서 검토 승인 완료
- 구현 방식: 계약 우선 수직 슬라이스

## 1. 배경과 결정 우선순위

미리살림은 예비부부 두 사람이 각자 재무 관련 답변과 상대에 대한 예측을 입력하고, 양측 제출이 끝난 뒤에만 결과를 동시에 공개하는 서비스다. 첫 구현 사이클은 전체 제품을 얕게 만드는 대신 3분 모드의 시작부터 결과 공유까지를 프로덕션 수준으로 완성한다.

요구사항 문서가 충돌할 때는 다음 순서를 적용한다.

1. 사용자와의 설계 대화에서 승인된 결정
2. `미리살림 — 기술 스택` PRD v0.2 확정안
3. `미리살림 — 개발 구현 프롬프트`

기술 스택 문서의 Motor 선택은 현재 지원 상태를 반영해 PyMongo Async API로 교체한다. MongoDB는 Motor가 2026년 5월 14일 deprecated 되었으며 신규 비동기 애플리케이션에는 PyMongo Async를 권장한다. 근거는 [MongoDB 공식 마이그레이션 문서](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/reference/migration/)다.

## 2. 목표와 범위

### 2.1 목표

- 익명 사용자 A가 3분 세션을 생성하고 초대 코드를 공유한다.
- 익명 사용자 B가 코드로 세션에 참여한다.
- 각 참여자는 현재 질문 설정에 정의된 모든 답과 상대에 대한 예측을 저장하고 제출한다. 첫 버전의 기본 질문 수는 5개다.
- 한 사람만 제출한 동안 상대 입력과 합산 결과가 모든 API 응답에서 완전히 제외된다.
- 양측 제출 후 3초 이내 두 사용자에게 결과가 공개된다.
- 세션 데이터는 7일 뒤 접근 불가 상태가 되고 MongoDB TTL 인덱스로 물리 삭제된다.
- 결과 공유 PNG에는 유형, 태그라인, 적중 점수만 포함되고 금액 관련 데이터는 포함되지 않는다.
- Vercel, Railway, MongoDB Atlas에 실제 배포한다.

### 2.2 첫 사이클에 포함하는 화면

| 경로 | 화면 |
| --- | --- |
| `/` | 랜딩과 모드 선택 |
| `/light/:step` | 3분 입력(기본 5문항) |
| `/done` | 제출 완료와 초대 코드 |
| `/invite/:code` | 초대 참여 |
| `/waiting/:sessionId` | 상대 대기와 완료 감지 |
| `/result/light/:sessionId` | 3분 결과 |
| `/result/light/:sessionId/share` | 공유 카드 미리보기와 PNG 저장 |

### 2.3 명시적 제외 범위

- 15분 입력과 전체 재무 리포트
- 회원가입, 이메일 로그인, 카카오 OAuth
- LLM 설명 생성
- 금융감독원 API와 정책금융 매칭
- PDF 리포트
- WebSocket, Redis, LangChain

랜딩에는 15분 모드 카드와 카피를 노출하되 CTA는 `준비 중`으로 비활성화한다. 익명 첫 사이클에서는 초대자 이름을 받지 않고 초대 화면에 `파트너가 함께 해보자고 초대했어요`라는 일반 카피를 사용한다.

## 3. 확정 기술 스택

| 영역 | 기술 |
| --- | --- |
| 저장소 | 단일 저장소, `apps/frontend`와 `apps/backend` |
| 프론트엔드 | Vite, React 18, TypeScript, React Router |
| 스타일 | Tailwind CSS, Pretendard Variable |
| 클라이언트 상태 | Zustand |
| 서버 상태 | TanStack Query |
| 폼 검증 | react-hook-form, zod |
| 공유 이미지 | html-to-image |
| 백엔드 | Python 3.11, FastAPI, Pydantic |
| 데이터베이스 | MongoDB Atlas |
| 드라이버 | PyMongo Async API |
| 테스트 | Vitest, Testing Library, MSW, pytest, Playwright |
| 배포 | 프론트엔드 Vercel, 백엔드 Railway |
| CI | GitHub Actions |

FastAPI가 내보내는 OpenAPI 명세에서 TypeScript 타입과 API 클라이언트를 생성한다. 프론트엔드는 손으로 중복 선언한 서버 DTO를 사용하지 않는다.

라이트 질문 목록은 `apps/backend/config/light_questions.json`을 단일 원본으로 관리한다. 질문은 안정적인 `id`와 표시 순서를 가지며, 세션 생성 시 `questionSetVersion`을 세션에 고정한다. 질문 수나 문구가 바뀌어도 이미 시작한 세션은 생성 당시 버전의 질문·채점 규칙을 사용한다. 프론트엔드는 `GET /api/v1/light/questions?version=...`으로 공개 질문 설정을 받아 렌더링한다.

## 4. 저장소 구조

```text
apps/
├─ frontend/
│  ├─ src/
│  └─ public/
└─ backend/
   ├─ app/
   ├─ config/
   └─ tests/
```

루트에는 공통 개발 명령, GitHub Actions, 로컬 MongoDB용 Compose 파일, 환경 변수 예시와 프로젝트 문서를 둔다. 프론트엔드와 백엔드는 각각 독립 빌드·배포가 가능해야 한다.

## 5. 프론트엔드 아키텍처

### 5.1 FSD 계층

```text
apps/frontend/src/
├─ app/
│  ├─ providers/
│  ├─ router/
│  └─ styles/
├─ pages/
│  ├─ landing/
│  ├─ light-form/
│  ├─ done/
│  ├─ invite/
│  ├─ waiting/
│  ├─ light-result/
│  └─ share/
├─ widgets/
│  ├─ app-header/
│  ├─ app-footer/
│  ├─ light-question-card/
│  ├─ waiting-status/
│  └─ result-summary/
├─ features/
│  ├─ create-session/
│  ├─ join-session/
│  ├─ save-light-answer/
│  ├─ submit-light-form/
│  ├─ poll-session-status/
│  └─ download-share-card/
├─ entities/
│  ├─ session/
│  ├─ participant/
│  ├─ light-answer/
│  └─ light-result/
└─ shared/
   ├─ api/
   ├─ ui/
   ├─ lib/
   ├─ config/
   └─ assets/
```

각 슬라이스는 필요한 경우 `ui`, `model`, `api`, `lib`, `config` 세그먼트를 사용한다. 외부 접근은 슬라이스 루트의 `index.ts` 공개 API로만 허용한다. ESLint는 `app → pages → widgets → features → entities → shared` 방향의 의존만 허용한다.

### 5.2 주요 공용 UI

- `PrimaryButton`, `SecondaryButton`
- `PillToggle`과 `PredictionToggle`
- `Badge`, `ProgressDots`, `ProgressBar`
- `StatusCard`, `LockedPreview`
- `AppHeader`, `AppFooter`, `PageContainer`
- `ShareCard`

Green은 3분 플로우의 주 강조색이고 Purple은 상대 예측 영역의 보조 강조색이다. 전역 `word-break: keep-all`, `focus-visible` 아웃라인, 숫자 tabular glyph, `aria-pressed`, 명시적 라벨 연결을 적용한다.

### 5.3 입력과 제출 정책

- 선택은 즉시 Zustand 상태에 반영하고 서버에 자동 저장한다.
- 자동 저장 성공 여부를 화면에 표시한다.
- 건너뛴 답은 `null`로 저장하며 적중 점수의 분모는 해당 세션의 질문 설정에 정의된 전체 질문 수(`questions.length`)와 같다. 실제로 답한 문항 수를 분모로 사용하지 않는다.
- 제출 전에는 이전 단계로 이동해 수정할 수 있다.
- 제출 후에는 입력 다시 보기만 허용하며 수정하지 못한다.
- 서버 응답이 성공하기 전에는 완료 화면으로 이동하지 않는다.

### 5.4 새로고침 복구

익명 브라우저는 한 번에 하나의 활성 참여 세션을 가진다. 공개 세션 UUID만 `sessionStorage`에 저장하고 답변·예측·토큰은 웹 저장소에 넣지 않는다. 새로고침 시 프론트엔드는 활성 참여자 쿠키로 `GET /api/v1/me/session`을 호출해 세션 ID와 현재 단계를 복구한다. 새 세션 생성이나 다른 초대 참여는 활성 쿠키를 교체하며, 이전 세션 데이터는 원래 만료 시각까지 서버에 남지만 해당 브라우저에서는 다시 접근할 수 없다.

## 6. 백엔드 아키텍처

```text
apps/backend/
├─ app/
│  ├─ api/v1/routers/
│  ├─ core/
│  ├─ db/
│  ├─ models/
│  ├─ schemas/
│  ├─ repositories/
│  ├─ services/
│  └─ engine/
├─ config/
└─ tests/
```

- 라우터는 HTTP 변환만 담당한다.
- 서비스는 세션 생성, 참여, 제출, 결과 공개 규칙을 담당한다.
- 저장소 계층은 MongoDB 쿼리와 원자적 갱신을 캡슐화한다.
- `engine`은 DB와 HTTP에 의존하지 않는 순수 계산만 담당한다.
- Pydantic 요청·응답 모델을 분리해 대기 응답에 상대 데이터가 실수로 직렬화되지 않게 한다.

## 7. 세션과 보안 모델

### 7.1 참여자 인증

세션 생성자와 초대 참여자에게 각각 256비트 무작위 비밀 토큰을 발급한다. 토큰은 `mrs_participant`라는 `HttpOnly`, `Secure`, `SameSite=Lax` 활성 참여자 쿠키에 저장한다. MongoDB에는 서버 비밀값을 이용한 HMAC-SHA-256 다이제스트만 저장하고 평문 토큰은 로그나 문서에 남기지 않는다.

브라우저는 같은 출처의 `/api`만 호출한다. 개발 환경에서는 Vite 프록시, 배포 환경에서는 Vercel rewrite가 Railway API로 전달한다. 변경 요청은 허용된 `Origin`을 검사한다.

### 7.2 초대 코드

- 표시 형식: `MRS-A7K2M9`
- 내부 값: 혼동하기 쉬운 문자를 제외한 6자리 대문자·숫자
- 유니크 인덱스로 중복을 방지한다.
- 초대 코드는 최초 B 슬롯 참여에만 사용한다.
- 참여 완료 후 모든 접근은 참여자 쿠키로 인증한다.
- 존재하지 않음, 만료, 이미 참여 완료 상태는 공격자가 구분하기 어려운 공통 오류 문구를 사용한다.

### 7.3 세션 문서

```javascript
{
  id: "public-uuid",
  code: "A7K2M9",
  mode: "light",
  questionSetVersion: "light-v1",
  status: "collecting" | "ready",
  createdAt: ISODate,
  expiresAt: ISODate,
  participants: [
    {
      role: "A" | "B",
      tokenHash: "sha256",
      completedAt: ISODate | null,
      input: {
        answers: [number | null, ...],
        guesses: [number | null, ...]
      },
      lastNudgedAt: ISODate | null
    }
  ],
  cachedResult: object | null
}
```

답과 예측은 해당 `questionSetVersion`의 질문 순서에 맞춘 가변 길이 배열이고 값은 `0..3` 또는 `null`이다. 제출 시 배열 길이와 각 값의 범위를 현재 세션 설정과 대조해 검증한다. `expiresAt`에는 `expireAfterSeconds: 0` TTL 인덱스를 적용한다.

## 8. API 계약

```text
POST  /api/v1/sessions
GET   /api/v1/me/session
GET   /api/v1/light/questions?version=...
GET   /api/v1/invitations/:code
POST  /api/v1/invitations/:code/join

GET   /api/v1/sessions/:id/me/input
PATCH /api/v1/sessions/:id/me/input
POST  /api/v1/sessions/:id/me/submit

GET   /api/v1/sessions/:id/status
POST  /api/v1/sessions/:id/nudge
GET   /api/v1/sessions/:id/result
```

세션 생성, 참여, 제출, 알림은 멱등성 키를 받아 네트워크 재시도로 중복 상태가 생기지 않게 한다. 자동 저장 PATCH는 같은 입력을 반복 적용해도 결과가 같은 멱등 연산이다.

### 8.1 공개 게이트

한 명이라도 미제출이면 결과 API는 아래 형태만 반환한다.

```json
{
  "status": "waiting",
  "partnerCompleted": false
}
```

이 응답 모델에는 상대 답, 상대 예측, 유형, 점수, 합산 결과 필드가 정의되지 않는다. 양측 제출 후에만 `status: ready` 응답과 결과 DTO를 반환한다. 입력 조회 API는 인증된 참여자 자신의 데이터만 반환한다.

두 제출이 동시에 도착하는 경우 MongoDB 조건부 업데이트로 각 완료 상태를 기록한다. 양측 완료를 관찰한 요청 하나만 `status`를 `ready`로 전환하고 결과를 계산해 캐시한다. 결과 조회 시 양측 완료인데 캐시가 없는 비정상 상태를 발견하면 동일한 조건부 연산으로 복구한다.

### 8.2 알림 전달 범위

첫 익명 슬라이스에는 이메일, 문자, 푸시 연락처가 없으므로 알림은 인앱 신호로 정의한다. B가 세션에 참여했지만 아직 제출하지 않은 경우 A가 알림을 보내면 서버가 시간을 기록하고 B의 다음 상태 폴링 응답에 중립적인 알림 배지를 포함한다. 상대가 아직 참여하지 않았다면 API는 `NUDGE_TARGET_UNAVAILABLE` 충돌 오류를 반환하고 UI는 초대 링크를 다시 공유하도록 안내한다. 발신 참여자별 최근 발송 시각을 기준으로 연속 24시간에 한 번만 허용한다.

## 9. 3분 결과 계산

### 9.1 질문별 비교

각 질문 `i`에서 다음을 계산한다.

- 생각 일치: `A.answers[i] === B.answers[i]`이며 둘 다 `null`이 아님
- A의 예측 적중: `A.guesses[i] === B.answers[i]`이며 둘 다 `null`이 아님
- B의 예측 적중: `B.guesses[i] === A.answers[i]`이며 둘 다 `null`이 아님
- 서로 맞힘: A와 B의 예측이 모두 적중

공유 적중 점수는 `서로 맞힘`인 질문 수이며 범위는 `0..N`이다. 여기서 `N`은 해당 세션의 질문 설정 길이이며 첫 버전에서는 `N=5`다. 건너뛴 문항은 적중으로 계산하지 않는다. 개인 결과 화면의 질문별 배지는 현재 사용자의 관점에서 자신의 예측 적중 여부를 표시한다.

### 9.2 성향 유형

소득과 부채 규모는 성향의 우열이나 정체성으로 사용하지 않는다. 초기 유형은 소비 방식과 저축 습관의 두 축만 사용한다.

- 계획 축: 안정적인 질문 ID `spending_style`의 답이 `계획대로 쓰는 편` 또는 `필요하면 유연하게`면 `지도`, 나머지는 `나침반`
- 축적 축: 안정적인 질문 ID `saving_ratio`의 답이 `30% 안팎` 또는 `절반 이상`이면 `차곡차곡`, 나머지는 `유연한`

두 축을 조합해 `차곡차곡 지도`, `유연한 지도`, `차곡차곡 나침반`, `유연한 나침반` 네 유형을 만든다. 각 유형 설명은 장점과 대화 포인트를 함께 제시하고 우열 표현을 금지한다. 함께의 기준 답은 `절반형`, `비율형`, `공동형`, `탐색형` 보조 태그로만 사용한다. 규칙과 카피는 `config/light_types.json`에 두고 코드에서 분리한다.

### 9.3 결과 카피

- 전체 질문 수의 80% 이상: `서로를 꽤 잘 알고 있어요`
- 전체 질문 수의 40% 이상: `닮은 부분과 다른 부분이 섞여 있어요`
- 그 외: `아직 서로 모르는 부분이 많아요`

분기 기준은 `high = ceil(N * 0.8)`, `middle = ceil(N * 0.4)`로 계산해 질문 수가 바뀌어도 기본 카피의 의미를 유지한다.

생각이 다른 질문은 `오늘 이야기해보면 좋은 주제`로 노출한다. 공유 카드에는 두 유형, 중립적 태그라인, 적중 점수만 전달한다.

## 10. 오류 처리와 개인정보 보호

오류 응답은 다음 공통 봉투를 사용한다.

```json
{
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "이 세션은 만료되었어요.",
    "fieldErrors": {}
  }
}
```

| 상태 | 의미 |
| --- | --- |
| 401 | 참여자 토큰 누락 또는 불일치 |
| 404 | 사용할 수 없는 초대 코드 |
| 409 | 제출 이후 수정, B 슬롯 충돌 등 상태 충돌 |
| 410 | 만료된 세션 |
| 422 | 입력 스키마 검증 실패 |
| 429 | 초대 코드 또는 알림 제한 초과 |
| 503 | 일시적 저장소 장애 |

- 자동 저장 실패 시 로컬 입력을 유지하고 재시도 상태를 표시한다.
- 상태 조회는 지수 백오프로 재시도한다.
- `expiresAt`이 지난 순간 API가 모든 접근을 즉시 410으로 막고, TTL 인덱스가 문서를 물리 삭제한다.
- 쿠키, 요청 본문, 답변, 결과를 애플리케이션 로그와 분석 이벤트에서 제외한다.
- 응답에는 `Cache-Control: no-store`를 적용한다.
- 초대 참여 시도는 IP와 코드 조합으로 제한한다.
- 알림은 발신 참여자별 24시간 1회로 제한한다.
- 초대 코드 제한 카운터는 별도 `rate_limits` 컬렉션에 저장하고 짧은 TTL 인덱스로 자동 정리한다. 프로세스 메모리 기반 제한은 사용하지 않는다.
- CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` 등 보안 헤더를 적용한다.

## 11. 에셋과 디자인 시스템

사용자가 제공한 다음 원본 에셋을 구현 단계에서 `apps/frontend/public/images`로 복사한다.

- `미리살림_사람.png`: 랜딩 히어로
- `미리살림_3분_아이콘.png`: 3분 모드 카드

기본 배경은 `#FCFCFB`, 3분 강조색은 `#43A77B`, 예측 보조색은 `#8A6FD1`을 사용한다. 카드에는 그림자 대신 1px 보더와 배경 대비를 사용한다. 원본 명세의 라운드, 모션, 반응형 기준과 한국어 카피를 유지한다.

## 12. 테스트 전략

### 12.1 백엔드

- `engine` 순수 함수 단위 테스트
- 세션 생성, 참여, 자동 저장, 제출, 결과 캐시 API 통합 테스트
- 실제 MongoDB 컨테이너를 사용한 원자적 갱신과 인덱스 테스트
- 만료 시각 접근 차단과 TTL 인덱스 정의 검사
- 24시간 알림 제한과 초대 코드 속도 제한 테스트

### 12.2 프론트엔드

- Vitest와 Testing Library로 폼, 대기, 오류, 제출 후 읽기 전용 상태 검사
- MSW로 waiting/ready/expired/rate-limited API 상태 재현
- 접근성 이름, 키보드 조작, `aria-pressed`, 포커스 표시 검사
- 데스크톱과 모바일 핵심 화면 스냅숏 검사

### 12.3 E2E와 보안 회귀

Playwright의 독립 브라우저 컨텍스트 A와 B로 다음을 검증한다.

1. A가 세션을 만들고 B가 초대 링크로 참여한다.
2. A만 제출했을 때 모든 응답에 B의 입력이 없다.
3. B 제출 후 양쪽 결과가 3초 이내 열린다.
4. 잘못된 참여자 쿠키로 타인 입력에 접근할 수 없다.
5. 결과 공유 PNG에 금액 문자열이나 금액 DTO가 없다.
6. 만료 세션과 알림 제한이 서버에서 거부된다.

## 13. CI와 배포

GitHub Actions 파이프라인은 다음을 실행한다.

```text
frontend: ESLint/FSD 경계 → TypeScript → Vitest → build
backend: Ruff → mypy → pytest
e2e: MongoDB 컨테이너 → FastAPI → Vite → Playwright
```

배포 순서는 다음과 같다.

1. MongoDB Atlas 프로젝트, 클러스터, 최소 권한 DB 사용자, TTL·유니크 인덱스 생성
2. Railway 프로젝트와 FastAPI Docker 배포, `/health` 검사 설정
3. Vercel 프로젝트와 프론트엔드 배포, `/api` rewrite와 보안 헤더 설정
4. GitHub Actions 연결과 프로덕션 스모크 테스트

비밀값은 플랫폼 환경 변수에만 저장하고 저장소에는 값이 없는 `.env.example`만 둔다. 최소 환경 변수는 `MONGODB_URI`, `MONGODB_DATABASE`, `PARTICIPANT_TOKEN_PEPPER`, `ALLOWED_ORIGINS`, `SESSION_TTL_DAYS`, 프론트엔드의 API 경로 설정이다.

## 14. 완료 기준

- 두 익명 브라우저가 초대 코드로 하나의 세션에 안전하게 결합된다.
- 각 사용자는 제출 전 자신의 입력만 저장·조회할 수 있다.
- 공개 게이트, 제출 불변성, TTL, 알림 제한이 클라이언트가 아닌 서버에서 강제된다.
- 승인된 모든 화면이 모바일과 데스크톱에서 동작한다.
- 주요 접근성 요구와 보안 헤더가 자동 테스트로 보호된다.
- 모든 CI 검사가 통과한다.
- Vercel, Railway, MongoDB Atlas 프로덕션 환경에서 전체 흐름이 동작한다.
