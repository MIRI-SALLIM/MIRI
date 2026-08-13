# 미리살림 Backend V2 B1–B6 통합 설계

**작성일:** 2026-08-14

**상태:** 사용자 승인 완료

**범위:** Backend B1–B6, 공개 API 계약, Light/Deep 경계, Railway 배포 전제

**대체 범위:** `2026-08-06-mirisallim-light-backend.md`의 B1–B6 구현 지침과 현재 `apps/backend` 프로토타입

## 1. 목적

현재 백엔드 프로토타입에서 검증된 HMAC 참여자 토큰, MongoDB 조건부 갱신, TTL 인덱스의 기본 방향은 유지한다. 반면 승인된 익명 Light 제품 흐름과 충돌하는 닉네임, 임의 `mode`, `INV-` 코드, 제출 DTO, 결과 stub, 단일 대형 `main.py` 구조는 교체한다.

Backend V2는 다음 사용자 흐름을 하나의 일관된 계약으로 완성한다.

1. 익명 사용자 A가 로그인과 닉네임 없이 Light 세션을 생성한다.
2. A가 `MRS-XXXXXX` 초대 링크를 공유한다.
3. 익명 사용자 B가 링크로 원자적으로 참여한다.
4. A와 B가 자신의 답과 상대 예측을 자동 저장한다.
5. 제출된 입력은 변경할 수 없다.
6. 한 명이라도 미제출이면 상대 입력과 결과를 공개하지 않는다.
7. 양측 제출 뒤 결과를 한 번 계산해 캐시하고 양쪽에 공개한다.

이번 범위에 회원 계정, 로그인 저장 이력, Kakao OAuth, Deep 실행, 배포 실행은 포함하지 않는다. 다만 이후 기능이 현재 계약을 깨지 않고 추가될 수 있도록 경계를 정의한다.

## 2. 버전 정책

### 2.1 세 종류의 버전을 분리한다

| 구분 | 이번 결정 | 의미 |
| --- | --- | --- |
| 구현 세대 | `Backend V2` | 내부 구조와 구현 계획의 이름 |
| 공개 HTTP API | `/api/v1` | 프론트엔드가 소비하는 URL 계약 |
| 질문·규칙 버전 | `light-v1` | 세션에 고정되는 질문과 결과 규칙 |

`Backend V2`라는 이름은 `/api/v2`를 의미하지 않는다.

### 2.2 이번에는 `/api/v2`를 만들지 않는다

현재 서비스는 운영 중이 아니며, 보존해야 할 배포 클라이언트나 세션 데이터가 없다. 프론트엔드도 생성된 API 클라이언트를 아직 소비하지 않는다. 따라서 잘못된 `/api/v1` 계약을 유지한 채 `/api/v2`를 추가하면 같은 기능의 계약을 두 벌 관리하는 비용만 생긴다.

이번 개편은 공개 경로 `/api/v1`을 올바른 최초 계약으로 다시 고정한다. 기존 프로토타입 응답과의 호환성은 제공하지 않는다.

### 2.3 미래에 실제 `/api/v2`를 만드는 조건

다음 조건을 모두 만족할 때만 `/api/v2`를 도입한다.

1. `/api/v1`을 사용하는 운영 클라이언트가 존재한다.
2. 필드명, 인증 방식, 상태 전이처럼 하위 호환으로 추가할 수 없는 변경이 필요하다.
3. v1과 v2를 동시에 테스트하고 운영할 인력이 확보된다.

그때는 v2를 v1의 개선판으로 배포하면서 일정 기간 두 라우터를 공존시킨다. v1에는 신규 기능을 추가하지 않고 폐기 공지, 마이그레이션 문서, 종료일을 제공한다. 모든 클라이언트 이전 뒤 v1을 제거한다.

### 2.4 질문 버전은 API 버전과 독립적이다

질문 문구, ID, 선택지 또는 결과 규칙이 바뀌면 `light-v2`처럼 질문 버전을 올린다. `/api/v1` 안에서 `GET /api/v1/light/questions?version=light-v2`로 함께 제공할 수 있다.

현재 운영 데이터가 없으므로 기존 `light-v1`의 두 번째 ID를 `saving_ratio`에서 `monthly_savings_amount`로 바로잡는다. 이번 개편 이후에는 이미 시작된 세션이 참조하는 질문 버전 파일을 수정하지 않는다.

## 3. Light와 Deep의 관계

Light와 Deep은 API 버전이 아니라 제품 모드다.

| 항목 | Light | Deep |
| --- | --- | --- |
| 실행 조건 | 로그인 불필요 | 로그인 필수 |
| 익명 참여자 쿠키 | 사용 | 계정 세션과 별도 권한 모델 사용 |
| 이번 B1–B6 | 완전 구현 | 실행 API 미제공 |
| 질문 노출 | `/api/v1/light/questions` | 인증 설계 승인 후 `/api/v1/deep/...` 추가 |
| 저장 기간 | 익명 세션 7일 | 계정 보존 정책을 별도 승인 |

현재 존재하는 익명 `/api/v1/deep/questions`와 임의 `mode` 세션 생성은 Backend V2에서 제거한다. 랜딩의 Deep CTA는 준비 중 상태를 유지한다.

향후 로그인 기능은 다음 순서로 별도 설계한다.

1. 계정 인증과 세션 정책을 승인한다.
2. 로그인한 사용자가 완료된 익명 Light 결과를 명시적으로 계정에 연결하는 기능을 추가한다.
3. 계정 인증이 필수인 Deep 세션 라우터를 `/api/v1/deep` 아래에 추가한다.

KakaoTalk Share는 로그인 기능이 아니다. Backend V2가 만든 초대 URL을 프론트엔드가 Kakao Share SDK에 전달한다. Kakao OAuth나 Kakao Message API는 B1–B6에 넣지 않는다.

## 4. 배포와 CORS 정책

### 4.1 배포 위치

- 프론트엔드: Vercel
- 백엔드: Railway
- 데이터베이스: MongoDB Atlas

백엔드의 최종 배포 대상은 승인 스펙대로 Railway다. Render URL은 배포 대상이나 백엔드 기준 URL로 사용하지 않는다.

### 4.2 Render CORS 기본값의 의미

팀 호환성을 위해 현재 코드의 `https://mirisalim-backend.onrender.com` 값을 개발 기본 allowlist에 보존한다. 이 값은 레거시 팀 호환 Origin일 뿐 Railway 배포 결정을 바꾸지 않는다.

CORS의 Origin은 API가 배포된 주소가 아니라 브라우저 페이지가 열린 출처다. 프로덕션에서는 `ALLOWED_ORIGINS`에 실제 Vercel 프론트엔드와 승인된 사용자 도메인의 정확한 Origin을 명시한다. Railway 또는 Render 백엔드 주소를 추가하는 것만으로 Vercel 브라우저 요청이 허용되지는 않는다.

### 4.3 환경별 정책

| 환경 | 허용 Origin |
| --- | --- |
| test | 테스트 클라이언트 Origin만 사용 |
| development | localhost `3000`, `5173`, 각 `127.0.0.1`, 팀 합의 Render Origin |
| production | 비어 있지 않은 `ALLOWED_ORIGINS`만 사용; 기본값으로 대체하지 않음 |

프로덕션에서 `ALLOWED_ORIGINS` 또는 강한 `PARTICIPANT_TOKEN_PEPPER`가 없으면 애플리케이션 시작을 실패시킨다. 쿠키 인증 변경 요청에는 CORS 미들웨어와 별도로 허용 Origin 검사를 적용한다.

허용 메서드는 `GET`, `POST`, `PATCH`, `OPTIONS`, 허용 요청 헤더는 `Content-Type`, `Idempotency-Key`로 제한한다. 브라우저 쿠키 사용을 위해 `allow_credentials=true`를 유지하며 와일드카드 Origin은 금지한다.

### 4.4 브라우저 호출 경로

브라우저는 같은 출처의 `/api`만 호출한다.

- 개발: Vite `/api` 프록시 → 로컬 FastAPI
- 배포: Vercel `/api` rewrite → Railway FastAPI
- FastAPI 공개 라우트: `/api/v1/...`

프론트 API 클라이언트의 base URL은 빈 문자열인 same-origin으로 두고, OpenAPI 경로 `/api/v1/...`를 그대로 사용한다. 그러면 브라우저 요청은 `/api/v1/...`가 되고 Vite·Vercel의 `/api` 프록시 규칙이 처리한다. `/api` 또는 `/api/v1`을 base URL과 스키마 양쪽에 중복 적용하지 않는다.

## 5. 애플리케이션 구조

```text
apps/backend/
├─ pyproject.toml
├─ app/
│  ├─ main.py
│  ├─ api/
│  │  ├─ dependencies.py
│  │  └─ v1/
│  │     ├─ router.py
│  │     └─ routers/
│  │        ├─ health.py
│  │        ├─ questions.py
│  │        ├─ sessions.py
│  │        └─ invitations.py
│  ├─ core/
│  │  ├─ errors.py
│  │  ├─ security.py
│  │  └─ settings.py
│  ├─ db/
│  │  ├─ mongo.py
│  │  └─ indexes.py
│  ├─ engine/
│  │  └─ light_result.py
│  ├─ models/
│  │  └─ session.py
│  ├─ repositories/
│  │  └─ session_repository.py
│  ├─ schemas/
│  │  ├─ common.py
│  │  ├─ invitations.py
│  │  ├─ questions.py
│  │  ├─ results.py
│  │  └─ sessions.py
│  └─ services/
│     ├─ question_catalog.py
│     ├─ result_service.py
│     └─ session_service.py
├─ config/
│  ├─ light_questions.json
│  └─ light_types.json
├─ scripts/
│  └─ export_openapi.py
└─ tests/
   ├─ api/
   ├─ core/
   ├─ engine/
   ├─ integration/
   └─ security/
```

라우터는 HTTP 변환만 담당한다. 서비스는 도메인 규칙과 상태 전이를 결정하고, 저장소는 MongoDB 쿼리와 원자적 조건부 갱신만 담당한다. 결과 엔진은 FastAPI, MongoDB, 환경 변수에 의존하지 않는 순수 함수다.

루트 `apps/backend/main.py`는 전환 기간 동안 `from app.main import app`만 제공하는 실행 호환 shim으로 남긴다. 신규 도메인 코드는 이 파일에 추가하지 않는다.

## 6. B1: 실행 기반과 설정

### 6.1 런타임

- Python `>=3.11,<3.12`
- FastAPI, Pydantic 2, pydantic-settings
- PyMongo Async API 4.13 이상
- pytest, pytest-asyncio, HTTPX, testcontainers MongoDB
- Ruff, mypy

의존성은 prod와 dev 그룹을 분리하고 잠금 파일로 재현 가능하게 관리한다.

### 6.2 설정

`Settings`는 다음 값을 제공한다.

- `environment`
- `mongodb_uri`
- `mongodb_database`
- `participant_token_pepper`
- `allowed_origins`
- `session_ttl_days=7`
- `participant_cookie_name=mrs_participant`

test 외 환경에서 빈 MongoDB URI를 허용하지 않는다. production에서는 개발 pepper fallback, 빈 Origin, `Secure=false` 쿠키를 허용하지 않는다.

### 6.3 Health

`GET /health`는 Railway 프로세스 생존 확인용이며 정확히 다음 응답을 반환한다.

```json
{"status":"ok"}
```

DB 장애 상세나 연결 문자열을 응답에 노출하지 않는다. MongoDB 준비 상태 점검은 배포 단계의 별도 내부 검사로 다룬다.

## 7. B2: 질문 카탈로그와 OpenAPI

### 7.1 Light 질문 ID

`light-v1`은 다음 순서를 고정한다.

1. `monthly_income`
2. `monthly_savings_amount`
3. `spending_style`
4. `debt_load`
5. `shared_expense`

두 번째 문항은 비율이 아니라 월 저축·투자 가능 금액이다. 문구와 금액 구간은 현재 설정을 유지하되 ID와 설명에서 ratio 의미를 제거한다.

`light_questions.json`은 `currentVersion`과 `versions` 레지스트리를 가진다. 이번에는 `light-v1` 한 세트만 포함하고, 향후 `light-v2`를 추가할 때 기존 `light-v1` 객체를 그대로 보존한다. `light_types.json`도 같은 버전 키를 사용해 질문과 결과 규칙을 함께 고정한다.

### 7.2 카탈로그 검증

애플리케이션 시작 시 다음을 검증한다.

- 버전과 현재 버전이 비어 있지 않다.
- ID가 중복되지 않는다.
- `order`가 1부터 연속된다.
- 각 질문은 정확히 선택지 4개를 가진다.
- 선택지 값이 중복되지 않는다.
- 필요한 결과 축 `spending_style`, `shared_expense`가 존재한다.

알 수 없는 질문 버전은 HTTP 404 `QUESTION_SET_NOT_FOUND`를 반환한다.

### 7.3 질문 카드와 데이터 경계

현재 프론트엔드에는 실제 Light 질문 카드가 없으며 App shell과 공용 UI만 존재한다. 질문 카드는 프론트 F4에서 `LightQuestionCard`로 구현한다.

카드는 계산 로직을 갖지 않는다. 질문 API가 제공하는 다음 공개 데이터만 렌더링한다.

- 질문: `id`, `order`, `category`, `text`, `subText`, `type`
- 선택지: `index` (`0..3`), `label`, `description`

설정 파일의 선택지 `value`, `rep`는 서버 전용이다. 특히 대표 금액 `rep`를 프론트 DTO와 OpenAPI에 포함하지 않는다. 프론트는 선택지 배열의 명시적 `index`만 `answers[i]`, `guesses[i]`에 저장하고 자체 금액 계산이나 성향 계산을 하지 않는다.

한 화면의 질문 카드는 같은 네 선택지를 두 번 사용한다.

1. Green 영역: `내 답`을 `answers[question.order - 1]`에 기록한다.
2. Purple 영역: `상대 예측`을 `guesses[question.order - 1]`에 기록한다.

카드는 질문 개수를 하드코딩하지 않는다. 진행률, 마지막 단계, 저장 배열 길이는 질문 API의 `questions.length`에서 파생한다. 새로고침 복구 시 세션의 `questionSetVersion`으로 같은 질문 세트를 다시 받고 자신의 저장 입력만 hydrate한다.

### 7.4 질문 API

```text
GET /api/v1/light/questions?version=light-v1
```

응답은 질문 렌더링에 필요한 공개 데이터만 포함한다. 질문 수는 항상 응답 배열 길이에서 파생한다.

### 7.5 OpenAPI

FastAPI OpenAPI는 프론트엔드와의 유일한 서버 DTO 계약이다. export 스크립트는 정렬된 키, UTF-8, 들여쓰기 2칸, trailing newline을 사용해 다음 두 파일을 동일하게 생성한다.

- `apps/backend/openapi.json`
- `apps/frontend/openapi.json`

두 번 연속 생성 결과의 바이트와 Git diff가 같아야 한다. 프론트는 이 스냅샷으로 `schema.d.ts`를 생성한다.

## 8. B3: 익명 세션과 참여자 capability

### 8.1 생성 API

```text
POST /api/v1/sessions
Idempotency-Key: UUID
Body: 없음
```

응답:

```json
{
  "sessionId": "public-uuid",
  "code": "MRS-A7K2M9",
  "questionSetVersion": "light-v1",
  "expiresAt": "2026-08-21T00:00:00Z"
}
```

이 API는 Light 세션만 만든다. nickname이나 mode를 받지 않는다. Deep 또는 임의 문자열 모드는 생성할 수 없다.

### 8.2 참여자 토큰

- `secrets.token_urlsafe(32)`로 256비트 무작위 토큰을 생성한다.
- MongoDB에는 `HMAC-SHA-256(pepper, token)`만 저장한다.
- 평문 토큰은 `mrs_participant` HttpOnly 쿠키에만 전달한다.
- production 쿠키는 `Secure`, `SameSite=Lax`, `Path=/`, 7일 `Max-Age`를 사용한다.
- 쿠키, 요청 본문, 답, 예측, 결과는 로그에 기록하지 않는다.

### 8.3 생성 멱등성

멱등 키는 중복 세션 생성을 방지하지만 인증 수단으로 사용하지 않는다.

- 같은 키와 유효한 기존 A 쿠키가 함께 오면 기존 세션을 반환하고 토큰을 회전하지 않는다.
- 같은 키를 다른 브라우저가 쿠키 없이 재사용하면 409 `IDEMPOTENCY_CONFLICT`를 반환한다.
- 동시 생성에서 unique key 충돌이 발생하면 기존 문서를 다시 조회해 위 규칙을 적용한다.
- 멱등 키와 초대 코드는 애플리케이션 로그에서 제거한다.

### 8.4 초대 코드

- 표시 형식: `MRS-A7K2M9`
- 저장 값: `A7K2M9`
- 문자 집합: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- suffix 길이: 6
- unique 인덱스 충돌 시 제한된 횟수만 새 코드를 생성하고 다시 삽입한다.

### 8.5 활성 세션 복구

```text
GET /api/v1/me/session
```

유효한 참여자 쿠키의 세션 ID, 초대 코드, 역할, 질문 버전, 상태, 만료 시각만 반환한다. 초대 코드는 새로고침 뒤 공유 화면을 복구하는 데 사용한다. 참가자 이름과 상대 입력은 존재하지 않는다.

## 9. B4: 입력 저장과 제출 불변성

### 9.1 자신의 입력

```text
GET   /api/v1/sessions/{sessionId}/me/input
PATCH /api/v1/sessions/{sessionId}/me/input
```

PATCH는 완전한 `answers`, `guesses` 배열을 함께 받는다. 두 배열 길이는 세션의 질문 수와 같아야 하고 각 값은 `0..3|null`이다. 생략된 guesses를 null 배열로 덮어쓰는 동작은 허용하지 않는다.

조회와 갱신은 인증된 참여자 한 명만 투영한다. 잘못된 토큰은 세션 존재 여부를 구분하지 못하는 401 응답을 받는다.

### 9.2 제출

```text
POST /api/v1/sessions/{sessionId}/me/submit
Idempotency-Key: UUID
Body: 없음
```

제출은 저장된 입력을 원자적으로 동결한다. answers와 guesses에 null이 남아 있으면 422 `INPUT_INCOMPLETE`를 반환한다.

응답:

```json
{
  "status": "submitted",
  "completedAt": "2026-08-14T12:00:00Z"
}
```

같은 참여자가 다시 제출하면 최초 `completedAt`을 그대로 반환한다. 제출 이후 PATCH는 409 `SESSION_ALREADY_SUBMITTED`를 반환한다. PATCH와 submit이 경합해도 submit 이후 PATCH가 성공할 수 없다.

## 10. B5: 초대, 상태, 인앱 넛지

### 10.1 초대 미리보기

```text
GET /api/v1/invitations/{MRS-code}
```

응답은 다음 필드만 포함한다.

```json
{
  "mode": "light",
  "durationMinutes": 3,
  "expiresAt": "2026-08-21T00:00:00Z"
}
```

없음, 만료, 이미 B가 참여한 코드는 동일한 404 `INVITATION_NOT_FOUND` 본문을 반환한다.

### 10.2 참여

```text
POST /api/v1/invitations/{MRS-code}/join
Idempotency-Key: UUID
Body: 없음
```

MongoDB 단일 조건부 갱신은 다음 조건을 모두 요구한다.

- `status=collecting`
- `expiresAt > now`
- 참여자가 정확히 A 한 명
- B 슬롯 없음
- 세션의 질문 버전과 질문 수가 유효함

성공 시 B capability 쿠키를 발급한다. 같은 브라우저의 A 쿠키로 자기 초대에 참여하는 요청은 B 슬롯과 기존 A 쿠키를 변경하지 않고 409 `ALREADY_PARTICIPATING`을 반환한다. 실제 MongoDB 동시 테스트에서 두 B 요청 중 정확히 하나만 성공해야 한다.

join 멱등 키는 B 중복 추가를 막기 위한 키이며 참여자 인증을 대신하지 않는다. 성공 응답 뒤 B 쿠키를 가진 동일 브라우저의 재요청만 기존 참여 상태를 반환한다. 쿠키가 없는 요청에는 멱등 키만으로 B capability를 재발급하지 않는다.

### 10.3 상태

```text
GET /api/v1/sessions/{sessionId}/status
```

응답:

```json
{
  "status": "collecting",
  "meCompleted": true,
  "partnerJoined": true,
  "partnerCompleted": false,
  "partnerNudgedAt": null,
  "expiresAt": "2026-08-21T00:00:00Z"
}
```

입력 배열이나 결과 데이터는 포함하지 않는다.

### 10.4 넛지

```text
POST /api/v1/sessions/{sessionId}/nudge
Idempotency-Key: UUID
```

상대가 참여했고 미제출일 때만 허용한다. 발신 참여자 기준 rolling 24시간에 한 번 허용하며 MongoDB 단일 조건부 갱신으로 시간을 기록한다. 정확히 24시간 경계는 허용한다. 상대 상태 응답은 중립적인 알림 시각만 제공한다.

넛지는 카카오톡, 문자, 이메일을 전송하지 않는다. 첫 사이클에서는 인앱 폴링 신호만 제공한다.

## 11. B6: 결과 엔진과 동시 공개

### 11.1 공개 게이트

한 명이라도 미제출이면 결과 API 응답은 정확히 두 필드만 가진다.

```json
{
  "status": "waiting",
  "partnerCompleted": false
}
```

waiting DTO에는 result, 상대 답, 상대 예측, 유형, 점수 필드를 정의하지 않는다.

### 11.2 결과 계산

양측 제출 뒤 다음을 계산한다.

- 각 질문의 A 예측 적중과 B 예측 적중
- 두 예측이 모두 맞은 질문 수 `mutualHitCount` (`0..N`)
- 질문 수에 따른 80%, 40% 태그라인
- 각 참여자의 성향 유형
- 금액이 아닌 공개 질문의 비교와 대화 주제

성향 유형은 `spending_style`과 `shared_expense`만 사용한다.

- `spending_style`: saver 또는 spender 축
- `shared_expense`: joint 또는 separate 축
- 조합: `saver_joint`, `saver_separate`, `spender_joint`, `spender_separate`

`monthly_income`, `monthly_savings_amount`, `debt_load`는 성향 분류에 사용하지 않는다. 특히 월 저축액은 금액 문항이며 성격이나 우열을 결정하지 않는다.

### 11.3 금액 정보 제한

결과 DTO의 질문별 비교는 `spending_style`, `shared_expense`만 포함한다. 세 금액 질문의 실제 답 인덱스, 선택지 라벨, 대표 금액은 결과 응답과 공유 DTO에 포함하지 않는다.

`mutualHitCount`는 전체 N개 질문에서 계산한 집계 점수만 제공하며 개별 금액 답을 역산할 수 있는 상세를 제공하지 않는다.

### 11.4 결과 캐시

두 번째 제출을 관찰한 요청 하나만 `status=ready` 전환과 결과 캐시 저장을 수행한다. 캐시는 A/B 기준의 canonical 결과이며, API 서비스가 요청자의 역할에 따라 `my`와 `partner` 관점을 변환한다.

양측 완료인데 캐시가 없는 비정상 상태를 결과 조회가 발견하면 같은 조건부 연산으로 복구한다. 동시 요청에서도 캐시는 하나만 저장된다.

ready 응답은 discriminated union의 `status=ready`, `partnerCompleted=true`, `result`를 반환한다.

## 12. MongoDB 문서와 인덱스

세션 문서의 기준 구조는 다음과 같다.

```javascript
{
  id: "public-uuid",
  code: "A7K2M9",
  mode: "light",
  questionSetVersion: "light-v1",
  questionCount: 5,
  status: "collecting" | "ready",
  createdAt: ISODate,
  expiresAt: ISODate,
  creatorIdempotencyKeyHash: "hmac",
  participants: [
    {
      role: "A" | "B",
      tokenHash: "hmac",
      input: {
        answers: [number | null, ...],
        guesses: [number | null, ...]
      },
      completedAt: ISODate | null,
      lastNudgedAt: ISODate | null
    }
  ],
  cachedResult: object | null
}
```

필수 인덱스:

- unique `id`
- unique `code`
- `participants.tokenHash`
- partial unique `creatorIdempotencyKeyHash`
- TTL `expiresAt`, `expireAfterSeconds=0`

인덱스 정의와 원자적 갱신은 실제 MongoDB 컨테이너에서 검증한다.

## 13. 오류와 보안 경계

모든 오류는 공통 봉투를 사용한다.

```json
{
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "이 세션은 만료되었어요.",
    "fieldErrors": {}
  }
}
```

주요 상태:

- 401: 참여자 capability 누락 또는 불일치
- 404: 질문 버전 또는 사용할 수 없는 초대 코드
- 409: 제출 이후 변경, 자기 참여, 멱등성 충돌
- 410: TTL 삭제 전 만료 세션 접근
- 422: 질문 수, 값 범위, 미완성 제출
- 429: 넛지 제한
- 503: 저장소 장애

모든 API 응답에 `Cache-Control: no-store`를 적용한다. 일반 예외는 stack trace, 데이터베이스 세부, 입력을 응답에 포함하지 않는다.

B7에서 추가할 초대 IP+코드 속도 제한, 별도 `rate_limits` 컬렉션, 전체 보안 헤더, Host 검증, 요청 크기 제한은 이번 B1–B6 완료 조건과 구분하되 프로덕션 배포 전 필수다.

## 14. 테스트 전략과 통합 게이트

### 14.1 빠른 테스트

- Settings 환경별 fail-closed 테스트
- 질문 카탈로그 ID·순서·중복·버전 테스트
- API 오류 봉투와 response model 테스트
- 결과 엔진 순수 단위 테스트
- 인메모리 저장소를 사용한 빠른 요청 흐름 테스트

### 14.2 실제 MongoDB 테스트

- 정확한 unique/TTL 인덱스
- 같은 생성 멱등 키 동시 요청
- 초대 코드 unique 충돌 재시도
- 두 B의 동시 join에서 성공 1건
- PATCH와 submit 경합
- 두 번째 제출과 결과 캐시 경합
- 넛지 24시간 경계와 동시 요청

### 14.3 Gate 기준

- Gate 1: OpenAPI 두 번 생성이 결정적이고 프론트 타입이 생성된다.
- Gate 2: 생성, 자동 저장, 새로고침 복구, 제출 후 409가 통과한다.
- Gate 3: 두 브라우저 참여, 상태 폴링, 넛지 제한이 통과한다.
- Gate 4: 한 명만 제출하면 두 필드 waiting, 양측 제출하면 같은 공유 점수가 열린다.

## 15. 기존 코드 처리

### 유지하여 새 계층으로 이동

- HMAC-SHA-256 참여자 토큰 다이제스트
- `secrets.token_urlsafe(32)` 토큰 생성
- UTC와 7일 TTL 기본 처리
- MongoDB 조건부 join/PATCH/submit/nudge 쿼리의 핵심 패턴
- `calculate_mutual_hit_count`의 양측 동시 적중 정의

### 교체

- 필수 nickname과 참가자 이름 공개
- 임의 문자열 mode와 익명 Deep 생성
- `INV-` + 8자리 초대 코드
- 같은 멱등 키로 creator 토큰을 회전하는 동작
- guesses 생략 시 기존 값을 null로 덮는 동작
- 입력을 다시 받는 submit DTO
- 항상 waiting인 결과 stub
- `main.py`의 라우트·설정·DB·도메인 결합
- 인메모리만 사용하는 integration 테스트

### 제거 또는 후속 범위로 이동

- 익명 `/api/v1/deep/questions`
- 공개 `/api/v1/config/{config_type}`
- 프로토타입 `/api/v1/calculate/light`
- 프로토타입 `/api/v1/validate/input`
- 단일 파일 `test_korean_support.py`

위 네 프로토타입 API는 승인된 익명 2인 Light 세션 계약에 포함되지 않으며 운영 소비자가 없으므로 Backend V2 공개 OpenAPI에서 제거한다. 필요한 계산 로직은 B6 순수 엔진으로 옮긴다.

## 16. 완료 정의

Backend B1–B6은 다음 조건을 모두 만족해야 완료다.

1. Python 3.11에서 전체 pytest가 통과한다.
2. Ruff와 mypy가 통과한다.
3. 실제 MongoDB 통합·경합 테스트가 통과한다.
4. OpenAPI 두 스냅샷이 동일하고 두 번 생성해 diff가 없다.
5. `monthly_savings_amount`가 설정·스키마·테스트·OpenAPI에 일관되게 반영된다.
6. 익명 Deep 또는 임의 mode 세션을 만들 수 없다.
7. 양측 제출 전 응답에 상대 입력이나 결과가 없다.
8. 결과와 공유용 DTO에 금액 답이나 금액 라벨이 없다.
9. 프로덕션 설정은 Railway·Atlas·Vercel Origin 전제를 만족한다.
10. 원격 push와 실제 Railway 배포는 사용자 승인을 별도로 받은 뒤 수행한다.
