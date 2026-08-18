# 🚀 미리살림(MIRI) 백엔드 개발 이어가기 인수인계 프롬프트 (v1.1)

---

## 1. 프로젝트 비즈니스 기획 및 배포 인프라 정책

- **라이트 모드 (3분 모드)**:
  - **공유 방식**: 카카오톡 등 링크 공유 기반
  - **사용자 경험**:
    - **비로그인 체험**: 가입/로그인 장벽 없이 3분 만에 즉시 진단 수행 (7일 TTL 익명 세션, HttpOnly 쿠키 `mrs_participant` 인증)
    - **로그인 시 영구 저장**: 결과 화면에서 *"결과 평생 보관하기 / 15분 모드 이어가기"* 소셜 로그인 유도로 계정에 결과 영구 귀속
  - **금액 프라이버시**: 연인 간 상대방 금액(소득, 저축액, 부채) 노출을 원천 배제하고 순수 성향 궁합 및 대화 주제만 제공
- **딥 모드 (15분 모드)**: 정밀 자산 리포트 및 로그인 기반
- **배포 인프라 및 환경**:
  - **백엔드 배포 위치**: Railway
  - **백엔드 CORS 기본값**: Render, 로컬 `http://localhost:3000`
  - **데이터베이스**: MongoDB Atlas (PyMongo Async API 활용, 7일 TTL 자동 인덱스)
  - **프론트엔드**: Vercel (React 18 + Vite + TypeScript, FSD 아키텍처)
  - **API 계약**: `export_openapi.py`를 통한 `apps/frontend/openapi.json` 결정적 100% 동기화

---

## 2. 현재까지 완료 및 검증된 작업 현황 (Task 1 ~ Task 6)

현재 백엔드 코드베이스는 **총 28개의 단위/통합/실제 MongoDB Atlas 동시성 테스트를 100% 통과**한 상태입니다.

| 태스크 | 구현 내용 | 검증 완료 사항 |
| :--- | :--- | :--- |
| **Task 1: 서버 인프라** | `FastAPI`, `GET /health`, CORS 설정 | 헬스체크 및 의존성 정상 |
| **Task 2: 질문 카탈로그** | `GET /api/v1/light/questions` 5개 문항 서빙 | 5개 문항 및 에러 봉투 검증 |
| **Task 3: 에러 봉투 & 스키마** | `{error: {code, message}}`, `cookieAuth` | OpenAPI 스펙 동기화 완비 |
| **Task 4: 세션 생성 & 인증** | `POST /sessions`, `GET /me/session` 복구 | 256비트 토큰 HMAC-SHA-256 다이제스트, 7일 TTL, 쿠키 인증 |
| **Task 5: 입력 저장 & 제출 잠금** | `PATCH /me/input` 자동저장, `POST /me/submit` (Empty Body) | • 미완성(null) 제출 시 `422 INPUT_INCOMPLETE` 차단<br>• 제출 성공 시 `SubmitResponse(status="submitted", completedAt=...)` 발급<br>• 제출 완료 후 `PATCH /input` 시 `409 SESSION_ALREADY_SUBMITTED` 잠금<br>• **실제 MongoDB Atlas 실시간 경합(Race Condition) 시 데이터 오염 방지 100% 검증** |
| **Task 6: 초대/상태/24h 넛지** | `GET /invitations/{code}`, `POST /join`, `GET /status`, `POST /nudge` | • **동일 초대 링크에 2명 동시 join 시 정확히 1명만 200 성공, 1명은 409 차단 (MongoDB 조건부 `$push`)**<br>• **24시간 넛지 더블클릭 시 1건만 200 성공, 1건은 429 NUDGE_RATE_LIMITED 차단**<br>• 24시간 정확한 경계(`<= now - 24h`) 허용 |

---

## 3. 다음에 즉시 착수해야 할 작업: Task 7 (결과 계산 엔진 & 동시 공개 게이트)

현재 `GET /api/v1/sessions/{session_id}/result`는 임시로 `ResultWaitingResponse(status="waiting")`만 반환하는 **스텁(Stub) 상태**입니다. 아래 3단계를 순서대로 완성해야 합니다.

### ① 순수 결과 계산 엔진 구현 (`services/calculator.py` 또는 `engine/light_result.py`)
- **4대 성향 판정**:
  - `spending_style` (0, 1: Saver / 2, 3: Spender)
  - `shared_expense` (0, 1: Joint / 2, 3: Separate)
  - 결과 유형: `saver_joint` (공동형 알뜰파), `saver_separate` (각자형 알뜰파), `spender_joint` (공동형 소비파), `spender_separate` (각자형 소비파)
- **상호 적중 점수 계산 (`mutualHitCount`)**:
  - 5개 문항에 대해 `내 예측 == 상대 답` AND `상대 예측 == 내 답`이 모두 일치하는 개수 (`0..5`)
- **태그라인 및 대화 주제 도출**:
  - `mutualHitCount` 점수 및 성향 궁합에 따른 카피 태그라인과 대화 추천 주제 도출
- **금액 데이터 원천 격리 (Security & Privacy)**:
  - `monthly_income`, `monthly_savings_amount`/`saving_ratio`, `debt_load`의 실제 값, 라벨, 대표 금액은 결과 DTO에서 **완전 제외**
  - 공개 문항 비교는 오직 `spending_style`, `shared_expense` 2개 문항만 포함

### ② 세션 저장소 MongoDB 캐싱 & 엔드포인트 연동 (`main.py` & `session_repository.py`)
- **양측 제출 여부 확인**: 두 참여자 모두 `completedAt`이 non-null인지 검사
  - 한 명이라도 미제출: `ResultWaitingResponse(status="waiting", partnerCompleted=bool)` 정확히 2개 필드만 반환
  - 양측 모두 제출 완료:
    1. DB에 `cachedResult`가 이미 존재하는지 확인
    2. 없으면 최초 1회 계산 후 MongoDB에 원자적 Compare-And-Set(`cachedResult: None`)으로 `$set` 저장
    3. 요청자의 역할(`creator` vs `invitee`)에 맞추어 `myType`/`partnerType`, `myAnswer`/`partnerAnswer`를 뷰어 관점으로 매핑하여 `ResultReadyResponse` 반환

### ③ 동시성 및 게이트 검증 테스트 작성
- 한 명 미제출 시 어떠한 결과 데이터도 유출되지 않는지 검증
- 양측 동시 `GET /result` 폴링 시 단 1건의 캐시만 기록되는지 실제 MongoDB 동시성 검증

---

## 4. 필수 개발 및 검증 명령어 (Verification Loop)

코드 수정 후 반드시 아래 4단계 검증을 모두 실행하여 100% 통과(Exit Code 0)를 유지해야 합니다:

```bash
# 1. Ruff 린트 검증
python -m ruff check .

# 2. Mypy 정적 타입 검증
python -m mypy .

# 3. Pytest 전체 테스트 스위트 (28개 테스트 + 신규 테스트)
pytest -v

# 4. 백엔드/프론트엔드 OpenAPI 스펙 동기화 (Clean Diff 확인)
python export_openapi.py
```
