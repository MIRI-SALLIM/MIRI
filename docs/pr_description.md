## 📌 PR 개요
미리살림(MIRI) 3분 라이트 모드 백엔드 전체 수직 슬라이스인 **Task 1부터 Task 7까지의 모든 기능 구현 및 실제 MongoDB Atlas 동시성 검증을 완벽하게 완성**하여 `develop` 브랜치에 병합 요청합니다.

---

## 🛠️ Task 1 ~ Task 7 전체 구현 내역 (Full Walkthrough)

### 🔹 Task 1: 서버 인프라 및 헬스체크 기반 구축
- **FastAPI 비동기 백엔드 구축**: Python 3.12 / 가상환경(`.venv`) 격리 및 의존성 관리
- **헬스체크 엔드포인트 (`GET /health`)**: 서버 가동 상태, 버전, UTC 타임스탬프 반환
- **CORS 보안 설정**: 로컬 개발 환경(`http://localhost:3000`), Render, Vercel 프론트엔드 출처 제어

### 🔹 Task 2: 3분 모드 질문 카탈로그 (Question Set Catalog)
- **질문 목록 서빙 (`GET /api/v1/light/questions`)**: 5개 핵심 문항(`monthly_income`, `saving_ratio`, `spending_style`, `debt_load`, `shared_expense`) 제공
- **질문 세트 버전 고정 (`light-v1`)**: 세션 시작 시 질문 버전이 세션에 고정되어 향후 질문 문항 변경 시에도 데이터 무결성 보장

### 🔹 Task 3: 공통 에러 봉투 & OpenAPI 스키마 동기화
- **표준화된 에러 봉투**: `{error: {code, message, fieldErrors}}` 일관된 에러 포맷 적용
- **보안 스키마 (`cookieAuth`)**: 보호된 API에 HttpOnly 쿠키 인증 스펙 명시
- **OpenAPI 자동 동기화**: `export_openapi.py`를 통해 백엔드와 프론트엔드(`apps/frontend/openapi.json`) 100% 동기화

### 🔹 Task 4: 익명 세션 생성 및 안전한 인증 (HMAC Token & TTL)
- **세션 생성 (`POST /api/v1/sessions`)**: 닉네임 없이 즉시 시작하는 완전 익명 세션 발급 및 초대 코드 생성
- **256비트 토큰 암호화**: 참여자별 비밀 토큰을 발급하고, DB에는 서버 페퍼(Pepper) 기반 HMAC-SHA-256 다이제스트만 저장 (평문 토큰 DB 유출 원천 차단)
- **HttpOnly 쿠키 (`mrs_participant`) 발급 & 7일 자동 만료**: MongoDB TTL 인덱스로 7일 후 물리 삭제
- **새로고침 복구 (`GET /api/v1/me/session`)**: 브라우저 재접속 시 활성 세션 상태 자동 복원

### 🔹 Task 5: 입력 자동 저장 및 원자적 제출 잠금 (Atomic Lock)
- **실시간 자동 저장 (`PATCH /api/v1/sessions/{id}/me/input`)**: 질문 풀이 중 독립된 본인 영역(`answers`, `guesses`)만 안전하게 갱신
- **본문 없는 제출 (`POST /api/v1/sessions/{id}/me/submit`)**: 프론트 실시간 저장 후 중복 전송 방지를 위한 Empty Body 제출
- **미완성(null) 제출 방어**: 5개 문항 중 미답변 문항 존재 시 **`422 Unprocessable Content (INPUT_INCOMPLETE)`** 거부
- **제출 후 수정 불변성 (409 Conflict)**: 제출 완료(`completedAt` 발급) 후 `PATCH /input` 시도 시 **`409 SESSION_ALREADY_SUBMITTED`**로 차단
- **실제 MongoDB 실시간 경합(Race Condition) 방어 검증**: `PATCH`와 `submit`이 밀리초 단위로 경합해도 제출 후 데이터 오염 100% 방지

### 🔹 Task 6: 초대 수락(Join), 상태 폴링 및 24시간 롤링 넛지
- **초대 미리보기 (`GET /api/v1/invitations/{code}`)**: 상대방 개인정보 없이 모드와 만료시간만 제공하는 중립적 미리보기
- **원자적 동시 참여 락 (`POST /join`)**: 2명의 게스트가 동시에 동일 초대 코드로 참여 시, MongoDB 조건부 `$push` (`participants.1: {$exists: False}`)로 **정확히 1명만 `200 OK` (B 쿠키 발급), 초과 게스트는 `409 Conflict (SESSION_ALREADY_JOINED)` 차단**
- **3초 상태 폴링 (`GET /api/v1/sessions/{id}/status`)**: 상대방 답변/점수 유출 없이 제출 완료 여부만 제공
- **24시간 롤링 넛지 (`POST /api/v1/sessions/{id}/nudge`)**: 24시간에 1회만 알림 허용, 더블클릭 시 **1건만 `200 OK`, 중복 요청은 `429 NUDGE_RATE_LIMITED` 차단**

### 🔹 Task 7: 순수 결과 계산 엔진, 금액 데이터 격리 및 동시 공개 캐싱
- **4대 성향 판정 (`services/light_result.py`)**:
  - `spending_style` (0,1: Spender / 2,3: Saver) × `shared_expense` (0,1: Separate / 2,3: Joint)
  - `saver_joint` (공동형 알뜰파), `saver_separate` (각자형 알뜰파), `spender_joint` (공동형 소비파), `spender_separate` (각자형 소비파)
- **상호 예측 적중 점수 (`mutualHitCount`)**: 5개 문항 중 양측의 예측이 모두 맞은 개수(`0..5`) 산출 및 맞춤 태그라인/대화 주제 도출
- **금액 데이터 100% 원천 격리 (Security & Privacy)**:
  - 소득(`monthly_income`), 저축액(`saving_ratio`), 부채(`debt_load`)의 실제 값/라벨/대표 금액은 **결과 DTO에서 완전 제외** (상대방에게 금액 노출 차단)
  - 공개 비교 항목은 오직 `spending_style`과 `shared_expense` 2개 문항만 포함
- **MongoDB 원자적 단일 캐싱 (CAS)**:
  - 양측 완료 시 `find_one_and_update` with `cachedResult: None`으로 단 1회만 캐시 기록
  - 요청자의 역할(Creator vs Invitee)에 따라 `myType`/`partnerType`, `myAnswer`/`partnerAnswer`를 대칭 스왑하여 프로젝션
- **철통 결과 게이트 (`GET /api/v1/sessions/{id}/result`)**: 한 명이라도 미제출 시 `{"status": "waiting", "partnerCompleted": false}` 정확히 2개 필드만 반환하여 정보 유출 원천 차단

---

## 🔍 4단계 완결 검증 결과 (Verification Loop)

- [x] **Ruff 린트 검증**: `python -m ruff check .` -> **All checks passed!**
- [x] **Mypy 정적 타입 검증**: `python -m mypy .` -> **Success: no issues found in 22 source files**
- [x] **Pytest 전체 단위/통합/동시성 테스트 (33개)**: `pytest -v` -> **33 passed in 19.03s (100% PASS)**
- [x] **OpenAPI 스키마 동기화**: `python export_openapi.py` -> **[OK] Clean Diff 검증 통과 (Backend/Frontend 100% 일치)**

---

## 📂 주요 변경 파일 목록
- `apps/backend/services/light_result.py` (NEW): 4대 성향 판정, 적중률 계산 및 뷰어 프로젝션 엔진
- `apps/backend/tests/integration/test_mongo_concurrency.py` (NEW): 실제 MongoDB Atlas 멀티 비동기 경합 검증
- `apps/backend/tests/integration/test_result_engine.py` (NEW): 결과 계산 엔진 및 게이트 검증
- `apps/backend/services/session_repository.py`: 세션 생성/참여/제출/캐싱 및 원자적 CAS 쿼리
- `apps/backend/main.py`: 전체 3분 모드 엔드포인트 핸들러 및 인증 의존성
- `apps/backend/schemas.py`: OpenAPI 스키마 및 DTO 모델 정규화
- `apps/frontend/openapi.json` & `apps/backend/openapi.json`: 백엔드/프론트엔드 API 계약 100% 일치 동기화
