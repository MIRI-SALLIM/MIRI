# 심사용 로그인 A/B 및 초기화

## 상태와 경계

백엔드 연결용 기능이다. 프론트 로그인 화면/초기화 버튼, 실제 비밀번호 설정, Railway 배포 및 브라우저 검증은 별도다. 일반 회원가입 또는 운영자 로그인 기능이 아니며, 카카오 키 없이도 심사용 인증을 사용할 수 있다. AI/정책 기능은 이번 변경에 포함하지 않는다.

로그인 이름은 `judge-a`, `judge-b`다. 공유하는 것은 자격증명 두 개뿐이고 실제 데이터는 **체험방별 독립 사용자**에게 저장한다. 각 방은 생성 후 24시간 만료하며 조회/재로그인/재작성으로 연장되지 않는다.

## 운영 설정

2026-09-03 후속 작업에서 **실제 사용 후보인 난수 비밀번호 두 개를 로컬에 준비**했다. `apps/backend/.reviewer-credentials.local/accounts.json`은 사용자명/비밀번호, 같은 폴더 `railway.env`는 비밀번호 해시 두 개와 신규 `AUTH_SESSION_PEPPER`다. 값은 채팅/로그에 출력하지 않았다. 폴더는 Git 제외이며 생성 계정과 본인 Windows 계정에 파일 접근 권한을 부여했다. 암호화된 비밀번호 관리자를 대체하지 않으므로 비밀번호는 관리자에 옮기고, 이 worktree를 삭제하기 전에 별도로 안전하게 보관한다.

이 파일이 있다고 운영 계정이 활성화된 것은 아니다. **Railway에는 아직 적용하지 않았다.** 기존 운영 `AUTH_SESSION_PEPPER`가 이미 있다면 무심코 새 값으로 교체하지 않는다(기존 로그인에 영향). 계정 비밀번호만 전달하고 `railway.env`/pepper는 프론트 또는 심사위원에게 전달하지 않는다.

비밀 폴더는 Git 제외 외에 `apps/backend/.dockerignore`의 `**/*.local`로 Docker 빌드에서도 제외한다. Git 제외만으로 로컬 Docker 빌드 전송을 막을 수 있다고 가정하지 않는다([Docker 빌드 컨텍스트 안내](https://docs.docker.com/build/concepts/context/#dockerignore-files)). CI는 실제 비밀번호 대신 합성 `.local` 파일·폴더를 만들고 완성 이미지에 없는지 검사한다.

다른 환경에서 새 묶음을 준비할 때는 `python scripts/provision_reviewers.py .reviewer-credentials.local`을 사용한다. 기존 폴더를 덮어쓰지 않으며, 비밀번호를 stdout에 출력하지 않는다. Windows에서는 실행 계정의 ACL을 적용하므로 Codex의 별도 실행 계정으로 생성한 경우 실제 사용자의 읽기 권한도 확인해야 한다. 이미 생성한 묶음은 재생성할 필요가 없다.

1. 로컬 `apps/backend`에서 다음을 각각 실행한다. 입력은 화면에 표시되지 않으며 터미널에는 해시만 출력된다. 비밀번호는 안전한 비밀번호 관리자에서 서로 다른 난수로 만들고 보관한다. 예제/테스트의 비밀번호는 사용하지 않는다.

   ```powershell
   .\.venv\Scripts\python.exe scripts/reviewer_password.py a
   .\.venv\Scripts\python.exe scripts/reviewer_password.py b
   ```

2. 출력된 변수명과 해시를 Railway Variables에 각각 넣는다. `$`를 포함하는 전체 해시가 값이다. 쉘 명령에 평문 비밀번호를 넣거나 Git/채팅에 붙이지 않는다.
3. 다음 설정을 사용한다. 아직 배포 승인이 없는 상태에서 임의로 운영 Deep를 켜지 않는다.

   ```dotenv
   DEEP_MODE_ENABLED=true
   KAKAO_LOGIN_ENABLED=false
   REVIEWER_LOGIN_ENABLED=true
   ```

4. `PUBLIC_APP_ORIGIN`은 실제 프론트 HTTPS origin, `AUTH_SESSION_PEPPER`는 독립 난수 32자 이상, Mongo/기존 Light 설정은 기존 배포 가이드대로 필요하다. 로컬 API 시험은 `http://localhost:3000` 등 시험 Origin으로 가능하나, 실제 서비스에는 프론트 same-origin `/api` 프록시가 필요하다.
5. 비밀번호 해시는 PBKDF2-HMAC-SHA256 600,000회/salt 16 bytes다. [OWASP 비밀번호 저장 안내](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)의 PBKDF2 비용을 참고했으며, 특정 인증/규정 준수 인증을 주장하지 않는다. 이 구현은 표준 라이브러리를 사용한다.

`REVIEWER_LOGIN_ENABLED=false`로 끄거나 두 해시 중 하나를 변경하면 기존 심사용 인증도 거부된다. 전체 Deep를 유지하려면 카카오 등 하나의 로그인 제공자는 정상 설정되어야 한다. 모든 로그인을 끄려면 Deep도 끈다.

## 프론트 연결 계약

모든 mutation에는 정확한 `Origin`이 필요하다. 브라우저는 같은 출처 `/api`로 호출하고 HttpOnly `mrs_account` 쿠키로 인증한다. 기존 Light 쿠키는 유지한다. 비밀번호와 방 코드를 URL/query/localStorage/분석 로그에 기록하지 않는다.

| API | 요청 | 결과 |
|---|---|---|
| POST `/api/v1/auth/reviewer/login` | username, password, roomCode(선택) | userId, role, roomCode, expiresAt, demo=true + 로그인 쿠키 |
| GET `/api/v1/auth/reviewer/context` | 로그인 쿠키 | 동일한 체험방 정보 복구 |
| POST `/api/v1/auth/reviewer/reset` | `{"confirm":true}` + 로그인 쿠키 | 이전 방 닫기 + 새 방 정보/로그인 쿠키 |
| POST `/api/v1/auth/logout` | 로그인 쿠키 | 해당 브라우저 로그아웃; 방 자체는 유지 |

1. 일반 창에서 A 로그인: `{"username":"judge-a","password":"<심사용 비밀번호>"}`. roomCode는 생략한다.
2. 응답의 체험방 코드를 복사하고 시크릿 창에서 B 로그인: `{"username":"judge-b","password":"<B 비밀번호>","roomCode":"<A의 방 코드>"}`.
3. A가 기존 Deep 세션 생성 API를 호출하고 초대 코드를 B에 전달한다. **체험방 코드(인증 묶음)와 Deep 초대 코드(진단 참여)는 서로 다르다.** 방 코드는 자동 합류 기능이 아니다.
4. 초대/입력/계획 확인/제출/동의/결과/합의는 기존 Deep API를 그대로 사용한다. 프론트는 진단의 id를 별도로 유지해야 한다. 같은 방으로 재로그인하면 사용자 신원만 복원되며 마지막 진단 목록 API는 이번 범위에 없다.
5. 로그인 폼은 ‘새 체험’과 ‘기존 체험방에 참여’를 구분한다. 로그아웃 후 복귀하려면 같은 방 코드를 입력한다. 코드 없이 로그인하면 새 방이다. 방 코드만으로 상대역 전환을 허용하지 말고 B 자격증명도 입력받는다.

비밀번호 오류/잘못된 방 코드/만료 코드는 모두 401 `REVIEWER_LOGIN_FAILED`. 로그인 IP당 10분 20회, 전체 10분 200회, 초기화 IP당 10분 10회 상한. 실제 프록시 IP 신뢰 설정을 검증하지 않고 X-Forwarded-For를 신뢰하면 안 된다. 심사 접근에 영향을 주는 잘못된 공용 IP 판별은 배포 전에 점검한다.

## 편리한 초기화 UX

버튼: **처음부터 다시 체험**

확인 문구: “현재 체험방의 A·B 진행을 종료하고 새로 시작합니다. 상대역도 새 체험방 코드로 다시 로그인해야 합니다. 다른 심사위원의 체험에는 영향을 주지 않습니다.”

- 취소하면 요청하지 않는다. 확인 후 reset을 한 번 호출하며 버튼을 잠근다.
- 성공 시 이전 Deep id/화면 상태를 비우고 새 roomCode를 보여준다. 새 방의 입력은 비어 있다. 샘플 자동 입력/결과 미리보기는 별도 기능이며 이번 변경에는 없다.
- 이전 양쪽 로그인/초대/보고서는 더 이상 접근할 수 없다. 다른 심사방과 실제 카카오 사용자 데이터는 건드리지 않는다.
- 동시에 초기화하면 하나만 성공한다. 다른 요청은 401 또는 409다. 재로그인 안내를 보여준다.
- 닫기 후 Mongo 장애로 새 방 생성이 실패하면 503이다. 이전 방은 닫힌 상태를 유지한다. 로그인 화면에서 방 코드를 비우고 새 체험을 시작한다.
- 자동 초기화 타이머로 진행 중인 체험을 덮어쓰지 않는다. 24시간 만료 시 새 체험을 안내한다.
- 초기화는 물리 삭제가 아니라 접근을 닫고 새 방으로 바꾸는 동작이다. 이전 금융 입력/보고서/합의는 방의 원래 만료 시각과 Mongo TTL 정리 주기에 따라 제거된다. 운영 감사용 rate-limit/삭제 표식은 별도 만료 정책이다.

심사 화면에 “가상 데이터로 체험하세요. 실제 개인정보·계좌정보를 입력하지 마세요”를 표시한다. 계정 정보는 제출용 비공개 안내 경로로 전달하고 공개 README에는 비밀번호를 넣지 않는다. 심사용 계정 제공 방식의 공식 허용 여부는 대회 게시판 확인 대상이다.

## 검증

로컬(Atlas 접속 차단): `python scripts/test_local.py -q`.
실Mongo: 기존 `DEEP_TEST_MONGODB_URI` 안전 제한 하에 `tests/integration/test_reviewer_mongo.py` 실행. CI 전용 Mongo job에도 추가되어 있다. 로컬 Mongo가 없으면 skip이며 실DB 경합 통과로 보고하지 않는다. 2026-09-03 후속 검증에서는 임시 Mongo7.0.39로 기존 DB12개와 reviewer DB1개를 포함한 대상 17개 테스트가 모두 통과했다. 임시 프로세스/ZIP/데이터는 종료·정리했다. 원격 CI/컨테이너/브라우저 검증과는 별개다.

배포 전: reviewer-only 설정, HTTPS 쿠키, 실제 두 브라우저 로그인/초대/답변/동의/결과/합의/초기화, 다른 심사방 영향 없음, 실패 응답 비밀값 비노출, 해시 회전/기능 OFF 검증이 필요하다.
