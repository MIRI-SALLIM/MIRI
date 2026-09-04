# 심사용 로그인 및 독립 체험방 인계

## 범위

사용자가 카카오 설정을 보류하고 심사 계정 2개와 편리한 초기화 방식을 맡겨 구현하도록 요청했다. [설계](../superpowers/specs/2026-09-03-reviewer-login-design.md), [계획](../superpowers/plans/2026-09-03-reviewer-login.md), [프론트/운영 연결 안내](../operations/reviewer-login.md)를 참조한다. 기존 [Deep C 인계](2026-09-03-deep-mvp-c-progress.md)의 출시 미완료 gate는 계속 유효하다.

## 구현

- 계정 이름 judge-a/judge-b, 공유 credential 2개와 체험방별 독립 사용자 A/B를 분리했다. 코드 없는 로그인은 새 방, 같은 방 코드 로그인은 신원 복원이다. 회원가입/관리자 권한은 없다.
- POST `/api/v1/auth/reviewer/login`, GET `/context`, POST `/reset`. 기존 me/logout/HttpOnly 계정 쿠키 재사용. 카카오 키 없이 reviewer-only 설정 가능, 기본은 reviewer OFF/Kakao ON.
- 초기화는 현재 방을 원자적으로 닫고 새 방을 만드는 방식이다. 이전 양쪽 인증 무효, 다른 심사방/실제 사용자 자료 영향 없음. 실패 시 닫힌 방을 되살리지 않고 새 로그인으로 복구한다.
- Deep 저장소에 방 경계/만료 검사, 일반계정과 reviewer 간 초대 차단, 24시간 TTL 상한을 만들었다. 재작성과 보고서 발행도 상한을 연장하지 않는다. 예약된 reviewer: 사용자 ID는 TTL로 사용자 행이 사라져도 일반계정으로 오인하지 않는다.
- PBKDF2-HMAC-SHA256 600,000회, threadpool 검증, Mongo rate limits, 해시 변경/기능 OFF 시 세션 거부. 로그인 비밀번호와 방 코드는 body/인증 context로만 전달하고 auth URL query를 Uvicorn 로그에서 가린다.
- `scripts/reviewer_password.py`는 사용자가 로컬에서 비밀번호를 입력해 해시만 출력하는 도구다. 후속 작업에서 `scripts/provision_reviewers.py`를 추가해 난수 A/B 비밀번호와 해시/pepper를 `.reviewer-credentials.local`에 준비했다. **로컬 준비만 완료했고 Railway에는 적용하지 않았다.** 값은 로그/채팅/Git에 출력하지 않았다. 테스트 비밀번호는 합성값으로 운영에서 사용하면 안 된다.
- OpenAPI를 기존 생성기로 양쪽 동기화했고, 실Mongo reviewer race 테스트를 CI에 연결했다. 프론트 UI는 변경하지 않았다.

## 리뷰와 검증 경계

읽기 전용 별도 리뷰에서 재작성 expiresAt이 기존 30일로 연장되는 문제를 지적했다. 실제 실패 테스트를 만든 뒤 reviewerExpiresAt 상한으로 수정했다. 직접 확인한 삭제된 reviewer ID 오인 및 auth query 비밀값 로그 문제도 재현 테스트 후 수정했다. 추가 blocking finding은 보고되지 않았다.

후속 최종 로컬 검증: **295 passed / 13 skipped / 11 warnings**, Ruff 통과, mypy 100개 파일 통과. 기본 wrapper는 DB13개를 skip하지만, 별도 임시 Mongo7.0.39에서 Deep/reviewer/legacy DB 테스트 대상 **17 passed / 0 skipped**로 해당13개를 모두 검사했다. reviewer room CAS 경합은 5회 반복했다. 원격 CI/컨테이너/실브라우저 검증은 아니다. 이전 OpenAPI 계약은 이번 helper 추가에서 변경하지 않았다.

공식 ZIP SHA256 `b6c91df89e73934d5f11872d8d4eaf8856d00fa237c442308e4bfb07570d7874` 확인, localhost27017 한정/WT cache0.25GB/Windows 서비스 설치 없음. 시험 프로세스 PID2696과 임시 폴더 `C:/Users/원종민/AppData/Local/Temp/mirisalim-reviewer-mongo-53076c4126564bf792f786d01148d77d`는 종료·삭제했다. 운영 Atlas 접속 없음.

## 남은 작업

1. 준비된 `.reviewer-credentials.local` 파일을 안전하게 보관하고 해시를 서버 환경에 설정. 기존 운영 pepper가 있으면 임의 교체하지 않는다. 일반 회원가입/카카오 마스터 계정 공유 금지. 비밀 파일은 현재 Codex worktree에 있으므로 worktree를 폐기하기 전에 사용자 비밀번호 관리자로 옮겨야 한다.
2. 프론트 Origin/프록시 및 로그인/방 코드 전달/초기화 확인 화면 구현. 체험방 코드와 기존 Deep 초대 코드는 별개이며 자동 합류 기능은 없다. 진단 id 복구는 프론트에서 유지한다.
3. 로컬 및 전용 Mongo 원격 CI/컨테이너 검증은 아래 후속 기록까지 완료. HTTPS 두 브라우저 전체 흐름, 프록시 IP/rate-limit 검증은 남아 있다.
4. 통합/배포 승인 후 Railway에 반영. 2026-09-03 사용자 요청으로 83f0719 기반 격리 worktree에 `fix/gate2-openapi-contract` 브랜치를 생성하고 현재 Deep/심사용 로그인 작업을 커밋 및 원격 브랜치로 보존한다. 처음 요청한 로컬 `fix2` 이름을 후속 요청에 따라 기존 원격 `fix/gate1-openapi-contract` 형식에 맞췄다. 기존 fix1 브랜치 병합/배포는 이번 요청에서 진행하지 않는다. 카카오 Developers/Railway/Atlas 설정 변경 없음.
5. AI 해설은 사용자가 후속 범위로 고려하기로 했으나 이번 작업에서는 구현/외부 호출하지 않았다. 정책 매칭도 여전히 보류.

## 원격 CI 및 빌드 비밀 파일 제외 후속

`7e5a0f7`의 [원격 CI](https://github.com/MIRI-SALLIM/MIRI/actions/runs/33732423572)는 quality/deep-mongo/container 모두 성공했다. Python3.11에서 295 passed/13 skipped, 별도 실제 Mongo job 17 passed/0 skipped, Ruff 및 mypy 100개 파일 통과를 확인했다. 위의 로컬 검증 당시 미완료였던 원격 CI gate를 닫는 증거이며 브라우저 E2E/운영 배포를 대신하지 않는다.

후속 점검에서 `.gitignore`와 달리 `.dockerignore`에 `.local` 제외 규칙이 없어 로컬 빌드 시 자격증명 폴더가 `COPY . .`에 포함될 수 있음을 발견했다. 실제 비밀번호가 아닌 합성 파일만 CI checkout에 만들어 `88c833b`에서 `Local-only files entered image` 실패를 재현했다. `2cd3cd5`에서 `**/*.local`을 추가한 뒤 [컨테이너 회귀 검사](https://github.com/MIRI-SALLIM/MIRI/actions/runs/33732934150)는 통과했다. 루트 파일·루트 자격증명 폴더·중첩 폴더를 검사하고 앱/심사 로그인 코드가 정상 포함됨도 함께 확인한다. 실제 비밀번호 접근/전송 및 로컬 Docker 설치는 없었다.

같은 수정본 `2cd3cd5`의 quality/deep-mongo도 모두 성공했다. GitHub runner의 기존 checkout/setup-python 액션 Node20→24 전환 경고는 남아 있으나 작업 실패는 없다. 후속 문서만 수정하는 커밋은 이 검증된 코드·설정을 변경하지 않는다.
