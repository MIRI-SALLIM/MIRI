# Deep MVP 연동·출시 점검

2026-09-03: C1~C4 로컬 구현 및 C5 실제 Mongo 검증까지 진행했다. **운영 배포, 실제 카카오/브라우저 검증, 원격 CI는 미완료다. `DEEP_MODE_ENABLED=false`를 유지한다.**

## 프론트 전달 계약

- 생성 명세: `apps/backend/openapi.json`, 동일 사본 `apps/frontend/openapi.json`.
- 합성 예시: `apps/backend/tests/fixtures/deep_contract_examples.json`. 실제 사용자·인증정보가 아니다. 상태별 샘플이며 실제 응답의 ID·revision·planVersion·round와 사용자 계획 날짜를 사용한다.
- 제공 결과: 월 예산·12개월 추정, 주거 초기자금 부족액, 목표 계획, 최대3개 템플릿 대화 카드, 합의·보류. 정책/AI 호출·궁합 점수는 제외한다.

프론트는 자신의 origin의 `/api/*`를 Railway로 전달하는 **same-origin 프록시**를 제공한다. 브라우저는 상대 경로 `/api/v1/...`를 호출한다. cross-site 쿠키에 기대는 구성이 아니다.

`PUBLIC_APP_ORIGIN`은 최종 HTTPS 프론트 origin(경로·끝 슬래시 없음)이다. 카카오 등록 callback은 정확히 `PUBLIC_APP_ORIGIN/api/v1/auth/kakao/callback`이어야 한다. 프록시는 `Origin`, `Cookie`, `Set-Cookie`, redirect를 올바르게 전달해야 한다.

로그인 버튼은 `GET /api/v1/auth/kakao/start?returnTo=/deep`로 브라우저를 이동한다. 로그인 확인은 `GET /api/v1/auth/me`, 로그아웃은 `POST /api/v1/auth/logout`이다. 계정 `mrs_account`는 HttpOnly 쿠키이며 Light `mrs_participant`와 독립이다. `X-Test-User`는 테스트 fixture 전용으로 실제 인증 수단이 아니다.

비밀키·Atlas URI·토큰을 프론트 JS에 넣지 않는다. 입력·결과는 localStorage/서비스워커/분석 도구에 저장하지 않으며 쿠키·OAuth query·초대 코드·본문을 콘솔에 기록하지 않는다. 초대 화면은 `no-referrer`를 적용한다.

## API 흐름

아래 `S=/api/v1/deep/sessions/{session_id}`. 모두 계정 로그인이 필요하며 초대 코드는 인증을 대체하지 않는다.

| 단계 | API | 처리 |
|---|---|---|
| 질문 | `GET /api/v1/deep/questions` | 기본 deep-v2 10문항; v1은 로그인 호환 조회8문항 |
| 생성 | `POST /api/v1/deep/sessions`, `{}` | Idempotency-Key 필수; 응답 ID·role·round·초대 코드 사용 |
| 참여 | `POST /api/v1/deep/invitations/{code}/join`, `{}` | 로그인 후 참여; Idempotency-Key 필수; 자기 초대/3번째 계정 불가 |
| 초안 | `GET/PATCH S/me/input` | PATCH expectedRevision + **전체 input 교체**, 부분 병합 아님 |
| 공동 계획 | `GET/PATCH S/plan`, `POST S/plan/confirm` | 전체 교체/버전 확인; 수정하면 양측 확인 초기화 |
| 제출 | `POST S/me/submit` | revision·planVersion·consentVersion·shareFinance·shareValues 명시 |
| 진행/결과 | `GET S/status`, `GET S/result` | result 첫 호출이 공개 수행; status만 폴링하면 ready로 전환되지 않음 |
| 합의 | `GET/POST S/agreements` | 생성 expectedRound·text·선택 reviewOn |
| 합의 변경 | `PATCH S/agreements/{id}`, `POST .../{id}/confirm`, `POST .../{id}/defer` | expectedVersion 필수; 편집/보류 시 버전 증가·양측 확인 초기화 |
| 재작성 | `GET/POST S/rounds` | GET round/myRequested/partnerRequested; POST expectedRound; 양측 요청 후 다음 회차 |
| 철회 | `POST S/withdraw`, `{}` | 먼저 접근 종료, 이후 공동 자료 정리; 실패 시 동일 요청 재시도 |
| 내부 계정 삭제 | `DELETE /api/v1/auth/account` | 최근10분 내 앱 로그인; 카카오 계정 자체 삭제가 아님 |

양측 제출·같은 계획 확인·동의 전에는 상대 답안/금액/메모/항목별 진행도를 제공하지 않는다. 제출 후 자신의 초안과 계획은 잠긴다. 재무/가치관 동의는 각각 양측 true여야 계산한다. 거부 영역은 `unavailable / sharing_not_authorized`이며 다른 동의 영역은 제공한다. 자유 메모는 결과에 포함하지 않는다.

결과 전체는 waiting/ready이고 ready의 블록은 available/partial/unavailable이다. `missingFields`, `assumptions`, `reason`, `warnings`를 함께 표시한다. 미입력을0으로 대체하지 않는다. 음수 잉여자금·부족액·0소득 비율 미산출·과거 시작월 경고를 정상 처리한다.

오류: 401 로그인, 403 Origin 점검, 404 비멤버/초대 무효/기능 비활성, 409 최신 본인 입력·계획·회차·합의 재조회, 410 만료/종료 후 민감 화면 비우기, 422 fieldErrors 표시, 429 요청 축소, 503 제한된 재시도. 409를 받았다고 오래된 입력을 새 버전에 자동 덮어쓰지 않는다.

## 검증 실행

`apps/backend`에서 운영 URI를 비우는 wrapper로 실행한다.

```powershell
.\.venv\Scripts\python.exe scripts/test_local.py -q --tb=short
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m mypy main.py schemas.py services auth deep tests scripts
```

실Mongo 검사는 `backend.yml`의 `deep-mongo` job에서 전용 mongo:7로 경합6종을 각각5회 반복한다: 입력/제출, 계획/제출, 양측 제출·보고서 발행, 보고서/철회, 합의 편집/확인, 초대 참여.

신규 시험은 DEEP_TEST_MONGODB_URI만 사용한다. loopback 또는 CI의 mongodb 호스트만 허용하며 credentials·SRV·다중호스트·DB 경로·query를 거부한다. 생성한 정확한 `mirisalim_deep_test_<uuid>` DB만 정리한다. REQUIRE_DEEP_MONGO_TESTS=1이면 누락/접속 실패는 fail이다. **운영 Atlas URI를 기존 Mongo 테스트에 전달하지 않는다.**

2026-09-03 임시 MongoDB7.0.39를 127.0.0.1:27017에서만 실행해 `test_deep_mongo.py`, `test_mongo_concurrency.py`, `test_result_engine.py`를 검사했다. **15 passed / 0 skipped**이며 기존 미실행 실DB12개와 순수 계산3개를 포함한다. Deep 경합6종은 각5회 반복됐다. 테스트 종료 후 프로세스를 종료했다. Docker/Windows 서비스 설치·운영 Atlas 접속은 하지 않았다. CI는 Python3.11, 로컬은3.12.10이므로 원격 CI 검증은 별도로 남는다.

런타임은 [MongoDB 공식 배포 목록](https://www.mongodb.com/try/download/community-edition/releases/archive)의 Windows ZIP이며 SHA256 `b6c91df89e73934d5f11872d8d4eaf8856d00fa237c442308e4bfb07570d7874`를 공식 checksum과 비교했다. 재현 시에는 독립 Mongo를 먼저 준비하고 ENVIRONMENT=test, MONGODB_URI와 DEEP_TEST_MONGODB_URI를 모두 `mongodb://127.0.0.1:27017`, REQUIRE_DEEP_MONGO_TESTS=1, DEEP_MODE_ENABLED=false로 명시한 **해당 테스트 프로세스에서만** 실행한다. 기본 `test_local.py`는 URI를 비우므로 실제 DB 검증용 명령이 아니다.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/integration/test_deep_mongo.py tests/integration/test_mongo_concurrency.py tests/integration/test_result_engine.py -q --tb=short
```

## 출시 gate — 미완료

- [x] 운영과 분리된 실제 Mongo에서 기존 미실행 DB 테스트12개 통과. 원격 CI/운영 Atlas 시험을 대신하지 않음.
- [ ] 사용자와 통합 브랜치·커밋·푸시 여부 결정. 현재는 미수행.
- [ ] 원격 quality/deep-mongo/container 성공. skip은 실DB 통과가 아님.
- [ ] 실제 Atlas 버전과 Mongo7 차이 및 unique/TTL 인덱스 권한 확인.
- [ ] 카카오 앱·동의 화면·REST API 키·Client Secret·프론트 origin·callback 확정. 비밀값은 Railway 설정으로만 전달.
- [ ] 독립 AUTH_SESSION_PEPPER 난수, Origin/CORS, 프록시 쿠키/redirect 검증.
- [ ] 초안30일/공개90일 보관 제안 및 자산100·부채30·기간1200개월 상한 확정. TTL 물리 삭제와 API 논리 만료를 구별.
- [ ] 합의 목록은 현재 페이지 분할 없이 반환되므로 공개 규모에 맞는 상한/페이지네이션 확정.
- [ ] 프론트/플랫폼 로그의 OAuth query·초대 코드·본문·헤더 비노출 및 프록시 IP 신뢰 범위 확인.
- [ ] legacy mode=deep 문서 유무를 읽기 전용 조사. 임의 변환/삭제 금지; 구형 API 접근은 차단됨.
- [ ] 실제 두 계정 E2E: Light → 카카오 로그인 → 초대 → 입력/계획 확인 → 한쪽 제출 waiting → 양측 같은 결과 → 합의 편집/재확인 → 재작성 → 철회 후 양쪽 차단.
- [ ] 재무/가치관 opt-out 각각 시험, 네트워크·콘솔·storage·서비스워커·분석 도구의 비노출 확인.
- [ ] 삭제 실패 재시도 및 운영 정리 절차 검증.
- [ ] 별도 승인 후 시험 배포·운영 활성화. 이 문서만으로 플래그를 켜지 않음.

### 현재 연동 준비 상태

이 worktree에는 실제 `.env`가 없고 현재 실행 환경의 PUBLIC_APP_ORIGIN/KAKAO_REST_API_KEY/KAKAO_CLIENT_SECRET/AUTH_SESSION_PEPPER는 미설정이다. Railway의 실제 변수 상태를 조회한 결과는 아니다. 카카오 앱 준비 여부와 확정 프론트 URL을 사용자에게 확인해야 한다. 비밀값을 채팅에 요청하지 않는다.

이 checkout의 `apps/frontend/src/app/App.tsx`는 기초 UI 데모이고 `vite.config.ts`에 `/api` 프록시가 없다. Kakao/Deep API 호출도 확인되지 않았다. 별도로 작업 중인 프론트 저장소/배포본의 상태는 미확인이다. 프론트 담당자의 최신 코드/URL로 연동 시험해야 하며 여기의 데모를 완성된 프론트로 간주하지 않는다.

## 삭제 장애·롤백

철회는 먼저 closed로 만들고 공동 보고서/합의를 삭제한다. 정리 실패 시 closed를 되돌리지 않고 같은 사용자/세션 요청으로 재시도한다.

계정 삭제는 account_deletions 표식을 먼저 저장해 양측 Deep 접근을 차단한다. 상대의 독립 계정/다른 세션은 유지한다. 연결 세션 종료·요청자 입력/동의·공동 자료 제거 → 계정/로그인 세션 삭제 → 완료 표식 순서다. 완료 표식만7일 뒤 TTL 대상이며 미완료 표식은 자동 해제하지 않는다.

인증이 유효하면 동일 DELETE를 재시도한다. 계정 제거 후 정리/완료 기록이 실패하면 사용자 재시도는401일 수 있다. 운영자는 **미완료 표식의 정확한 내부 userId**를 확인하고 해당 대상만 `delete_account_data` → `AuthRepository.delete_user` → `complete_account_deletion` 순서로 재실행하는 관리 절차를 마련해야 한다. 표식만 삭제하거나 broad delete하지 않는다. 자동 worker는 이번 범위에 없다.

문제 발생 시 DEEP_MODE_ENABLED=false로 신규 접근을 중단하고 Light·저장 자료는 보존한다. 비활성 상태에서는 계정 삭제 API도 닫히므로 삭제 요청을 별도로 접수하고 제한된 운영 절차로 처리한다.
