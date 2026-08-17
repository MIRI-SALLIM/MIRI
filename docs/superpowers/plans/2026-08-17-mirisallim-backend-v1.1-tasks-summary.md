# 🚀 미리살림(MIRI) 백엔드 v1.1 Task별 기능 명세 및 구현 계획 상세

**작성일:** 2026-08-17  
**대상 버전:** Backend v1.1 (3분 라이트 모드 수직 슬라이스)  
**API 기준 경로:** `/api/v1`

---

## 📌 1. 전체 아키텍처 및 핵심 설계 원칙

1. **완전 익명 2인 세션 (Zero-Login / Zero-Nickname)**:
   - 회원가입이나 닉네임 입력 없이 카카오톡 링크 공유로 즉시 시작하는 3분 진단 서비스
   - 256비트 난수 토큰 발급 및 DB 내 HMAC-SHA-256 해시 저장, `mrs_participant` HttpOnly 쿠키 기반 무상태 인증
2. **철저한 금액 데이터 원천 격리 (Zero-Money Exposure)**:
   - 연인 간 상대방 금액(소득, 저축액, 부채) 노출을 차단하고 순수 성향 궁합(`spending_style`, `shared_expense`) 및 대화 주제만 제공
3. **원자적 동시성 및 불변성 잠금 (Race Condition Defense)**:
   - MongoDB 조건부 원자적 연산(CAS: Compare-And-Set)을 활용하여 다중 동시 요청 경합 시 1건만 성공하도록 통제
4. **결정적 단일 API 계약 (Deterministic OpenAPI)**:
   - `export_openapi.py`를 통해 백엔드와 프론트엔드(`apps/frontend/openapi.json`) 간 스키마 100% 동기화 유지

---

## 🛠️ 2. Task별 기능 및 세부 구현 계획

```
[Task 1] 인프라 & 헬스체크 (GET /health)
   │
[Task 2] 질문 카탈로그 (GET /api/v1/light/questions)
   │
[Task 3] 공통 에러 봉투 & OpenAPI 스키마 동기화
   │
[Task 4] 익명 세션 생성 & 인증 (POST /sessions, GET /me/session)
   │
[Task 5] 입력 실시간 저장 & 제출 락 (PATCH /me/input, POST /me/submit)
   │
[Task 6] 초대 참여, 상태 폴링, 24h 넛지 (POST /join, GET /status, POST /nudge)
   │
[Task 7] 순수 결과 엔진 & 동시 공개 게이트 (GET /result)
   │
[Task 8] 실제 MongoDB 동시성 검증 & 레이어드 리팩토링
```

---

### 🔹 Task 1: 서버 인프라, 환경 설정(Settings), 헬스체크 (B1)

#### 1. 기능 및 목표
- FastAPI 비동기 프레임워크 런타임 구축
- Pydantic Settings를 통한 다중 환경(`development`, `test`, `production`) 설정 관리
- 외부 클라우드 인프라(Railway 등) 모니터링용 표준 헬스체크 제공

#### 2. 엔드포인트 및 DTO
- `GET /health`: 서버 Liveness 확인용 엔드포인트
  ```json
  {
    "status": "ok",
    "version": "1.0.0",
    "timestamp": "2026-08-17T08:41:00Z"
  }
  ```

#### 3. 세부 구현 방식
- **보안 설정 (`Settings`)**:
  - `pydantic-settings` 기반 환경변수 주입
  - 프로덕션 환경(`ENVIRONMENT=production`)에서 빈 `ALLOWED_ORIGINS`이거나 개발용 Pepper(`KNOWN_DEV_PEPPER`) 사용 시 서버 기동 즉시 차단(Fail-closed)
- **CORS 및 캐시 헤더**:
  - `allow_credentials=True` 적용 (쿠키 인증 허용)
  - 모든 응답에 `Cache-Control: no-store` 적용하여 브라우저 캐싱 방지

#### 4. 관련 파일
- [apps/backend/main.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/main.py)
- [apps/backend/.env.example](file:///c:/Users/원종민/Desktop/backend/apps/backend/.env.example)

---

### 🔹 Task 2: 버전형 질문 레지스트리 및 공개 질문 DTO (B2)

#### 1. 기능 및 목표
- 3분 모드 5개 핵심 질문 카탈로그 제공
- 클라이언트 DTO와 서버 내부 데이터(`value`, `rep`) 격리

#### 2. 엔드포인트 및 문항 체계
- `GET /api/v1/light/questions?version=light-v1`: 질문 세트 조회
  - **5개 문항 체계**:
    1. `monthly_income`: 월 실수령 소득 구간
    2. `monthly_savings_amount`: 월 저축/투자 가능 금액 (*비율이 아닌 금액*)
    3. `spending_style`: 소비 vs 저축 가치관 (현재 중심 vs 미래 안정)
    4. `debt_load`: 부채 규모 및 부담 정도
    5. `shared_expense`: 결혼 후 돈 관리 방식 (각자 관리 vs 공동 관리)
  - **응답 DTO 스키마**:
    ```json
    {
      "version": "light-v1",
      "title": "3분 미리살림 라이트 진단",
      "description": "5개 문항으로 알아보는 신혼 재무 성향 궁합",
      "questions": [
        {
          "id": "monthly_income",
          "order": 1,
          "category": "소득",
          "text": "현재 월 실수령 소득은 어느 정도인가요?",
          "subText": "상대방에게 구체적 금액은 공개되지 않아요.",
          "type": "single_choice",
          "options": [
            { "index": 0, "label": "250만원 미만", "description": "사회초년생 또는 준비 단계" },
            { "index": 1, "label": "250만 ~ 350만원", "description": "안정적인 소득 형성기" },
            { "index": 2, "label": "350만 ~ 500만원", "description": "성장하는 소득 기반" },
            { "index": 3, "label": "500만원 이상", "description": "탄탄한 고소득 구간" }
          ]
        }
      ]
    }
    ```

#### 3. 세부 구현 방식
- **데이터 경계 분리 (Public vs Server-Only)**:
  - 설정 파일([light_questions.json](file:///c:/Users/원종민/Desktop/backend/apps/backend/config/light_questions.json)) 내의 `value`(순서값) 및 `rep`(금액 대표값, 예: 2000000)을 클라이언트 DTO에서 완전히 제거
  - 프론트엔드에는 `index (0..3)`, `label`, `description`만 노출하여 클라이언트가 자체 금액 연산을 하지 못하도록 차단
- **버전 고정 메커니즘**:
  - 세션 생성 시 질문 세트 버전(`light-v1`)이 세션 문서에 기록되어 향후 질문 문항이 변경되어도 기존 세션의 데이터 일관성 보장

#### 4. 관련 파일
- [apps/backend/config/light_questions.json](file:///c:/Users/원종민/Desktop/backend/apps/backend/config/light_questions.json)
- [apps/backend/config/light_types.json](file:///c:/Users/원종민/Desktop/backend/apps/backend/config/light_types.json)
- [apps/backend/schemas.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/schemas.py)

---

### 🔹 Task 3: 공통 에러 봉투 & 결정적 OpenAPI 스키마 동기화 (B2)

#### 1. 기능 및 목표
- 표준화된 에러 응답 포맷 일원화
- 백엔드와 프론트엔드 간 OpenAPI 스키마 100% 동기화 유지

#### 2. 에러 봉투 및 보안 스킴
- **공통 에러 응답 봉투 (`ErrorResponse`)**:
  ```json
  {
    "error": {
      "code": "INPUT_INCOMPLETE",
      "message": "모든 문항에 답변과 예측을 입력해주세요.",
      "fieldErrors": {}
    }
  }
  ```
- **보안 스킴 (`cookieAuth`)**: 보호된 세션 API 엔드포인트에 `mrs_participant` 쿠키 요구 스펙 명시

#### 3. 세부 구현 방식
- **결정적 Export 스크립트 (`export_openapi.py`)**:
  - `json.dumps(..., ensure_ascii=False, indent=2, sort_keys=True) + "\n"` 방식을 적용하여 키 정렬 및 포맷 일관성 확보
  - `apps/backend/openapi.json`과 `apps/frontend/openapi.json` 두 경로에 동시에 동일한 내용 기록
  - 생성 후 `git diff`에서 불필요한 공백/순서 차이가 발생하지 않는 Clean Diff 보장

#### 4. 관련 파일
- [apps/backend/export_openapi.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/export_openapi.py)
- [apps/backend/openapi.json](file:///c:/Users/원종민/Desktop/backend/apps/backend/openapi.json)
- [apps/frontend/openapi.json](file:///c:/Users/원종민/Desktop/backend/apps/frontend/openapi.json)

---

### 🔹 Task 4: 익명 세션 생성 및 안전한 인증 (B3)

#### 1. 기능 및 목표
- 닉네임 없는 익명 세션 발급 및 초대 코드 생성
- 256비트 토큰 기반 암호화 인증 및 7일 자동 만료(TTL)

#### 2. 엔드포인트 및 응답 스키마
- `POST /api/v1/sessions`: 세션 생성
  - **헤더**: `Idempotency-Key: <UUID>` (중복 생성 방지)
  - **본문**: 없음 (Empty Body)
  - **응답 (`201 Created`)**:
    ```json
    {
      "sessionId": "4f183787-8051-4045-8027-2c9748b6c891",
      "code": "MRS-A7K2M9",
      "questionSetVersion": "light-v1",
      "expiresAt": "2026-08-24T08:41:00Z"
    }
    ```
  - **Set-Cookie**: `mrs_participant=<session_id>:<token>; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`
- `GET /api/v1/me/session`: 새로고침 복구
  - 쿠키를 검증하여 세션 ID, 초대 코드, 역할(`creator` vs `invitee`), 만료 시각 복원

#### 3. 세부 구현 방식
- **256비트 토큰 암호화 (Capability Token)**:
  - `secrets.token_urlsafe(32)`로 생성된 난수 토큰을 클라이언트에 쿠키로 지급
  - MongoDB에는 `HMAC-SHA-256(pepper, token)` 다이제스트만 저장하여 DB 유출 시에도 인증 토큰 탈취 원천 방지
- **초대 코드 발급 알고리즘**:
  - 혼동 문자(`I`, `O`, `0`, `1` 등)를 배제한 문자셋(`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)에서 6자리 추출 (`MRS-XXXXXX`)
  - Unique 충돌 시 최대 5회 재시도 처리
- **7일 자동 만료 (TTL Index)**:
  - MongoDB `expiresAt` 필드에 TTL 인덱스(`expireAfterSeconds: 0`)를 적용하여 7일 후 물리 삭제

#### 4. 관련 파일
- [apps/backend/services/session_repository.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/services/session_repository.py)
- [apps/backend/tests/integration/test_session_create.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/tests/integration/test_session_create.py)

---

### 🔹 Task 5: 입력 자동 저장 및 원자적 제출 잠금 (B4)

#### 1. 기능 및 목표
- 참여자별 실시간 답변/예측 배열 분리 저장
- Empty Body 제출 및 제출 완료 후 수정 불변성(409) 보장

#### 2. 엔드포인트 및 스키마
- `GET /api/v1/sessions/{id}/me/input`: 본인 입력 조회
- `PATCH /api/v1/sessions/{id}/me/input`: 실시간 자동 저장
  - **요청 Body**:
    ```json
    {
      "answers": [0, 1, 2, 3, null],
      "guesses": [1, 2, 3, 0, null]
    }
    ```
- `POST /api/v1/sessions/{id}/me/submit`: 입력 제출 (본문 없음)
  - **응답 (`200 OK`)**:
    ```json
    {
      "status": "submitted",
      "completedAt": "2026-08-17T08:45:00Z"
    }
    ```

#### 3. 세부 구현 방식
- **참여자별 독립 저장 (Positional `$set`)**:
  - MongoDB의 `participants.$elemMatch.tokenHash` 조건과 `participants.$.input` 연산자를 활용하여 본인의 `answers`, `guesses` 영역만 갱신 (상대방 영역 침범 차단)
- **미완성(null) 제출 방어**:
  - `answers`나 `guesses`에 `null`이 포함된 상태로 `submit` 호출 시 **`422 Unprocessable Content (INPUT_INCOMPLETE)`** 반환
- **제출 후 수정 불변성 락 (409 Conflict)**:
  - `submit` 시 MongoDB 조건문 `participants.completedAt: null`을 만족할 때만 현재 시각 기록
  - 제출 완료 후 `PATCH /input` 시도 시 **`409 SESSION_ALREADY_SUBMITTED`**로 차단
- **실시간 경합(Race Condition) 방어**:
  - `PATCH`와 `submit`이 밀리초 단위로 경합해도, 이미 제출된 세션의 데이터를 `PATCH`가 덮어쓰지 못하도록 조건부 원자적 업데이트 보장

#### 4. 관련 파일
- [apps/backend/tests/integration/test_light_input.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/tests/integration/test_light_input.py)
- [apps/backend/tests/integration/test_submit.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/tests/integration/test_submit.py)

---

### 🔹 Task 6: 초대 수락(Join), 상태 폴링, 24시간 롤링 넛지 (B5)

#### 1. 기능 및 목표
- 2인 참여 원자적 동시성 락 제어
- 3초 주기 상태 폴링 및 발신자 기준 24시간 롤링 넛지

#### 2. 엔드포인트 및 스키마
- `GET /api/v1/invitations/{code}`: 초대 미리보기 (`mode`, `durationMinutes`, `expiresAt`만 제공)
- `POST /api/v1/invitations/{code}/join`: 초대 참여 (게스트 B 쿠키 발급)
- `GET /api/v1/sessions/{id}/status`: 세션 진행 상태 폴링
  - **응답**:
    ```json
    {
      "status": "collecting",
      "meCompleted": true,
      "partnerJoined": true,
      "partnerCompleted": false,
      "partnerNudgedAt": null,
      "expiresAt": "2026-08-24T08:41:00Z"
    }
    ```
- `POST /api/v1/sessions/{id}/nudge`: 24시간 인앱 넛지 발송

#### 3. 세부 구현 방식
- **동시 참여 락 (Conditional `$push`)**:
  - 동일한 초대 코드로 2명 이상의 게스트가 동시 `POST /join` 시, MongoDB 조건부 갱신(`participants.1: {$exists: False}`)을 통해 **정확히 1명만 `200 OK` (B 쿠키 발급), 초과 인원은 `409 SESSION_ALREADY_JOINED`**로 차단
- **자기 초대 참여 방지**:
  - 본인(A)의 쿠키를 보유한 상태로 본인 초대 링크 참여 시 `409 ALREADY_PARTICIPATING` 반환
- **24시간 롤링 넛지 (CAS 429 Defense)**:
  - 발신자 기준 `lastNudgedAt == null` 또는 `lastNudgedAt <= now - 24h`일 때만 원자적 시간 갱신
  - 더블클릭 등 동시 호출 시 **1건만 `200 OK`, 중복 요청은 `429 NUDGE_RATE_LIMITED`** 차단

#### 4. 관련 파일
- [apps/backend/tests/integration/test_invitation.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/tests/integration/test_invitation.py)
- [apps/backend/tests/integration/test_status_and_nudge.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/tests/integration/test_status_and_nudge.py)

---

### 🔹 Task 7: 순수 결과 계산 엔진, 금액 데이터 격리, 동시 공개 게이트 (B6)

#### 1. 기능 및 목표
- 4대 성향 판정 및 상호 예측 적중률 계산
- 금액 정보 완전 격리, MongoDB 원자적 단일 캐싱 및 뷰어 프로젝션

#### 2. 엔드포인트 및 결과 스키마
- `GET /api/v1/sessions/{id}/result`: 최종 진단 결과 조회
  - **한 명이라도 미제출 시 (Waiting Gate)**:
    ```json
    {
      "status": "waiting",
      "partnerCompleted": false
    }
    ```
  - **양측 모두 제출 완료 시 (Ready Result)**:
    ```json
    {
      "status": "ready",
      "partnerCompleted": true,
      "result": {
        "questionCount": 5,
        "mutualHitCount": 4,
        "tagline": "서로의 재무 가치관을 80% 이상 정확히 꿰뚫고 있어요!",
        "myType": {
          "typeCode": "saver_joint",
          "typeName": "함께 모으는 든든한 동반자형",
          "typeDescription": "두 분 모두 미래를 위한 저축을 중시하며...",
          "recommendation": "공동의 저축 목표를 구체적인 금액과 기간으로 설정해보세요."
        },
        "partnerType": { ... },
        "discussionTopics": [
          "매월 공용 생활비 통장에 각자 얼마씩 입금할지 규칙 정하기",
          "비상금 통장은 공동으로 둘지, 각자 관리할지 결정하기"
        ],
        "questions": [
          {
            "questionId": "spending_style",
            "questionText": "현재의 소비와 미래의 저축 중 어느 쪽에 더 가치를 두시나요?",
            "myAnswer": 3,
            "partnerAnswer": 2,
            "myGuess": 2,
            "isHit": true,
            "isMatch": false,
            "myAnswerLabel": "미래 안정과 저축 우선",
            "partnerAnswerLabel": "저축에 조금 더 비중"
          },
          {
            "questionId": "shared_expense",
            ...
          }
        ]
      }
    }
    ```

#### 3. 세부 구현 방식
- **4대 성향 판정 매트릭스**:
  - `spending_style` (0,1: Spender / 2,3: Saver) × `shared_expense` (0,1: Separate / 2,3: Joint)
  - 4개 결과 유형:
    1. `saver_joint` (함께 모으는 든든한 동반자형)
    2. `saver_separate` (각자 꼼꼼 미래설계형)
    3. `spender_joint` (함께 즐기는 욜로동반형)
    4. `spender_separate` (각자 즐기는 독립형)
- **상호 예측 적중수 (`mutualHitCount`)**:
  - 5개 전체 문항에 대해 `내 예측 == 상대 답` AND `상대 예측 == 내 답`이 모두 일치하는 질문 개수(`0..5`) 집계
- **금액 데이터 100% 원천 격리 (Zero-Money Exposure)**:
  - `monthly_income`(소득), `monthly_savings_amount`(저축액), `debt_load`(부채)의 실제 값/라벨/대표 금액은 결과 응답 DTO에서 **완전 제외**
  - 공개 문항 비교 리스트(`questions`)에는 오직 성향 문항 2개(`spending_style`, `shared_expense`)만 포함
- **원자적 단일 캐싱 (Atomic CAS Cache)**:
  - 양측 완료 확인 후 최초 조회 시 `cachedResult: None` 조건으로 단 1회만 계산 결과를 MongoDB에 캐싱
- **뷰어 프로젝션 (Viewer Projection)**:
  - 캐시된 기준(Canonical) 결과로부터 요청자의 역할(Creator vs Invitee)에 따라 `myType`/`partnerType`, `myAnswer`/`partnerAnswer`, `myGuess`/`partnerGuess`를 대칭 스왑하여 안전하게 렌더링

#### 4. 관련 파일
- [apps/backend/services/light_result.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/services/light_result.py)
- [apps/backend/tests/integration/test_result_engine.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/tests/integration/test_result_engine.py)

---

### 🔹 Task 8: 실제 MongoDB 동시성 검증 & 아키텍처 정리 (B6+)

#### 1. 기능 및 목표
- 실제 MongoDB Atlas 비동기 동시 경합(Race Condition) 5종 검증
- 레거시 불필요 경로 제거 및 계층화 아키텍처 구조 정립

#### 2. 검증된 5대 실시간 동시성 시나리오
1. **동시 세션 생성 경합**: 동일한 `Idempotency-Key`로 동시 생성 시 정확히 1개 문서만 생성 및 동일 세션 반환
2. **동시 초대 참여(Join) 경합**: 동일 링크에 다수 게스트 동시 참여 시 정확히 1명만 `200 OK`, 나머지는 `409` 차단
3. **PATCH vs Submit 경합**: 저장과 제출이 밀리초 단위로 충돌해도 제출 완료 후 데이터 덮어쓰기 원천 방어
4. **동시 Result 조회 캐싱 경합**: 양측이 동시에 결과 조회 시 최초 1회만 캐시 기록 (DB 쓰기 경합 방어)
5. **동시 Nudge 연타 경합**: 넛지 버튼 동시 클릭 시 1건만 `200 OK`, 중복 요청은 `429` 차단

#### 3. 관련 파일
- [apps/backend/tests/integration/test_mongo_concurrency.py](file:///c:/Users/원종민/Desktop/backend/apps/backend/tests/integration/test_mongo_concurrency.py)

---

## 📊 3. 비기능적 요구사항 및 보안 방어 매핑 요약표

| 영역 | 비즈니스 / 보안 정책 | 구현 메커니즘 | 방어 상태 코드 |
| :--- | :--- | :--- | :---: |
| **인증/인가** | 닉네임 없는 256비트 난수 토큰 | `mrs_participant` HttpOnly 쿠키 + HMAC-SHA-256 | `401 Unauthorized` |
| **세션 수명** | 7일간 유효한 익명 세션 | MongoDB TTL Index (`expiresAt: 0`) | `410 Gone` |
| **동시 참여** | 1개 세션에 정확히 2인만 허용 | MongoDB 조건부 `$push` (`participants.1: {$exists: False}`) | `409 Conflict` |
| **자기 참여** | 본인 초대 링크 참여 차단 | 쿠키 내 Token Hash와 Creator Token 대조 | `409 Conflict` |
| **입력 완성도** | 5문항 답변/예측 필수 입력 | Submit 시 배열 내 `null` 존재 여부 검사 | `422 Unprocessable` |
| **제출 불변성** | 제출 완료 후 수정 금지 | `completedAt` 조건부 `$set` 락 | `409 Conflict` |
| **결과 게이트** | 양측 제출 전 결과 노출 차단 | `partnerCompleted` 검사 후 2개 필드만 반환 | `status: "waiting"` |
| **금액 격리** | 소득/저축액/부채 노출 차단 | 결과 DTO에서 금액 문항 원천 제외 (성향 2개만 노출) | 필드 미포함 |
| **알림 빈도** | 발신자 기준 24시간 1회 제한 | `lastNudgedAt <= now - 24h` CAS 쿼리 | `429 Too Many Requests` |
