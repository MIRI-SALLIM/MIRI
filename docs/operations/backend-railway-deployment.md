# 미리살림 백엔드 Railway 배포 런북

이 문서는 Railway 계정이 전혀 없는 상태에서 `MIRI-SALLIM/MIRI`의 FastAPI 백엔드를 Railway에 배포하고 MongoDB Atlas 및 Vercel과 연결하는 절차다.

## 0. 소유자 작업과 비밀값 경계

- Railway 가입, 서비스 약관 동의, GitHub OAuth 승인, 결제수단 등록은 계정 소유자가 직접 수행한다.
- 실제 secret은 Railway 또는 Atlas 대시보드에만 입력한다. 채팅, 화면 캡처, Git commit, 이 문서에는 복사하지 않는다.
- Hobby 전환이나 결제수단 등록 화면이 나오면 배포를 멈추고 계정 소유자가 비용을 승인한 뒤 진행한다.
- Railway CLI 로그인은 최초 배포에 필요하지 않다. 초기 배포는 대시보드와 GitHub 연동만 사용한다.

## 1. 배포 전 저장소 확인

배포 대상으로 다음 값을 사용한다.

| 항목 | 값 |
| --- | --- |
| GitHub repository | `MIRI-SALLIM/MIRI` |
| Source branch | `fix/gate2-openapi-contract` |
| Root Directory | `/apps/backend` |
| Builder | 저장소의 `Dockerfile` 자동 감지 |
| Runtime | Python 3.11 / Uvicorn |

GitHub의 `Backend CI`가 성공한 commit만 배포한다. CI는 Ruff, mypy, pytest와 Docker build를 실행한다.

## 2. Railway 가입과 GitHub 연결

1. [Railway 로그인](https://railway.com/login)을 연다.
2. GitHub 계정으로 가입하고 Railway 약관을 직접 확인해 동의한다.
3. Railway가 표시하는 Trial verification 결과가 `Full Trial`인지 `Limited Trial`인지 확인한다.
4. [Railway 새 프로젝트](https://railway.com/new)에서 `Deploy from GitHub repo`를 선택한다.
5. GitHub 앱 권한을 요청하면 가능하면 `Only select repositories`를 선택하고 `MIRI-SALLIM/MIRI`만 허용한다.
6. 저장소를 선택한 뒤 즉시 배포하는 대신 `Add Variables`를 선택한다.

신규 Trial은 계정 검증 결과에 따라 네트워크 기능이 제한될 수 있다. Limited Trial에서도 코드 배포는 가능하지만 outbound network 제한으로 Atlas 연결이 실패할 수 있다. 이 경우 먼저 `/health` 결과와 Railway 로그로 제한 여부를 확인하며, 사용자 승인 없이 Hobby로 전환하지 않는다. 세부 제한은 [Railway Free Trial 공식 문서](https://docs.railway.com/pricing/free-trial)를 기준으로 확인한다.

## 3. MongoDB Atlas 준비

기존 Atlas M0 cluster가 있으면 그대로 사용한다. 없다면 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) 계정과 무료 M0 cluster를 계정 소유자가 만든다.

1. 애플리케이션 전용 database user를 만든다.
2. 이 사용자에게 `mirisalim` database의 read/write 권한만 부여한다.
3. 강한 임의 비밀번호를 만들고 password manager에 저장한다.
4. Atlas `Network Access`에서 Railway 서비스의 접속을 허용한다.
5. 고정 outbound IP를 사용할 수 없어 `0.0.0.0/0` 허용이 불가피하면 최소 DB 권한, 강한 전용 비밀번호, TLS `mongodb+srv` URI를 반드시 함께 사용한다.
6. Atlas `Connect` → `Drivers`에서 Python connection string을 복사하고 사용자명과 비밀번호를 Atlas 또는 Railway 입력 화면에서만 완성한다.

URI 비밀번호에 `@`, `:`, `/`, `%` 같은 예약 문자가 있으면 percent encoding된 값을 사용한다. 연결 문자열을 `.env.example`이나 GitHub에 저장하지 않는다.

## 4. Railway 서비스 설정

Railway project canvas에서 생성된 service를 열고 다음을 설정한다.

| 설정 | 값 |
| --- | --- |
| Source repository | `MIRI-SALLIM/MIRI` |
| Source branch | `fix/gate2-openapi-contract` |
| Root Directory | `/apps/backend` |
| Healthcheck Path | `/health` |
| Healthcheck Timeout | `300` seconds |
| Serverless | `OFF` |
| Replicas | `1` |
| Restart Policy | `On Failure` |
| Region | 선택 가능한 아시아 리전 중 사용자와 Atlas에 가장 가까운 곳 |

Serverless를 켜면 유휴 상태에서 service가 sleep할 수 있으므로 이 서비스에서는 OFF로 유지한다. Railway가 주입하는 `PORT`는 직접 생성하거나 고정하지 않는다.

## 5. Railway Variables 입력

Variables 탭에 다음 6개 값을 입력한다.

| 변수 | 입력값 |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `MONGODB_URI` | Atlas Drivers 화면에서 받은 실제 TLS connection string |
| `MONGODB_DB_NAME` | `mirisalim` |
| `PARTICIPANT_TOKEN_PEPPER` | 아래 명령으로 새로 만든 32자 이상의 난수 |
| `ALLOWED_ORIGINS` | 실제 Vercel production Origin, 예: `https://서비스명.vercel.app` |
| `SESSION_TTL_DAYS` | `7` |

pepper는 개발 기본값을 재사용하지 않는다. 로컬 터미널에서 다음 명령을 한 번 실행하고 출력값을 Railway Variables에 직접 붙여넣은 뒤 터미널을 닫는다.

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Vercel 도메인이 아직 없다면 production 도메인이 정해진 뒤 `ALLOWED_ORIGINS`를 입력한다. 쉼표로 여러 HTTPS Origin을 넣을 수 있지만 preview domain 전체를 wildcard로 허용하지 않는다.

필수값이 누락되거나 잘못되면 애플리케이션은 시작을 중단하며 오류에는 변수 이름만 표시되고 값은 표시되지 않는다.

## 6. 최초 배포와 Railway 도메인

1. Variables 저장 후 `Deploy`를 선택한다.
2. build log에서 `apps/backend/Dockerfile`이 사용되는지 확인한다.
3. deploy log에서 Uvicorn이 Railway `PORT`의 `0.0.0.0`에서 시작하는지 확인한다.
4. service `Settings` → `Networking`에서 Railway public domain을 생성한다.
5. 생성된 `https://...up.railway.app` 주소를 기록한다. 이 URL은 secret이 아니다.
6. deployment가 healthcheck를 통과했는지 확인한다.

production 설정 오류가 나면 로그에 표시된 변수 이름만 보고 Variables를 수정한다. 로그나 채팅에 실제 변수 값을 붙여넣지 않는다.

## 7. Railway URL 스모크 검사

저장소 루트에서 실행한다.

```powershell
apps\backend\.venv\Scripts\python.exe apps\backend\scripts\smoke_deployment.py https://서비스명.up.railway.app
```

정상 출력은 다음 네 줄이다.

```text
health: PASS
database: PASS
questions: PASS
session: PASS
```

스크립트는 다음을 확인한다.

- `GET /health`: HTTP 200, `status=ok`, `database=connected`
- `GET /api/v1/light/questions?version=light-v1`: HTTP 200, 5개 문항
- `POST /api/v1/sessions`: HTTP 201, `mrs_participant` 쿠키 발급

스모크 세션은 TTL에 의해 7일 후 삭제된다. 스크립트는 응답 본문이나 쿠키 값을 출력하지 않는다.

`database connection check failed`이면 다음 순서로 확인한다.

1. `MONGODB_URI`의 사용자명, percent-encoded 비밀번호, cluster hostname을 Atlas 화면에서 확인한다.
2. Atlas database user 권한과 Network Access를 확인한다.
3. Railway 계정이 Limited Trial인지 확인한다.
4. Limited Trial outbound 제한이 원인이면 배포를 멈추고 Full verification 가능 여부 또는 Hobby 전환을 계정 소유자에게 결정받는다.

## 8. Vercel 연결 handoff

프론트 담당자에게 Railway public URL만 전달한다. secret은 전달하지 않는다.

Vercel production은 브라우저의 `/api/v1/:path*` 요청을 Railway의 `/api/v1/:path*`로 same-origin rewrite해야 한다. 참여자 쿠키는 기존 정책을 유지한다.

- `HttpOnly`
- production `Secure`
- `SameSite=Lax`
- `Path=/`

Railway `/health`는 Railway URL에서 직접 확인한다. Vercel에서는 질문 조회, 세션 생성, 새로고침 복구, 서로 다른 두 브라우저의 초대 참여 흐름을 확인한다.

Vercel production domain이 바뀌면 Railway `ALLOWED_ORIGINS`도 정확한 새 HTTPS Origin으로 수정하고 재배포한다.

## 9. 비용 통제

2026-09 기준 Railway 신규 계정은 최대 30일 동안 사용할 수 있는 일회성 `$5` Trial credit을 받을 수 있고, 이후 Free plan은 월 `$1` credit을 제공한다. 실제 계정 화면의 Trial 상태와 잔액을 최종 기준으로 삼고 [Railway 요금제 문서](https://docs.railway.com/pricing/plans)에서 변경 여부를 확인한다.

1. Railway workspace의 `Usage`에서 현재 credit, 시간당 사용량, 월 예상치를 확인한다.
2. 결제수단을 등록하지 않은 상태에서는 Free/Trial로 유지한다.
3. 상시 실행 비용이 Free credit을 넘을 것으로 예상되면 먼저 사용자에게 월 예상치를 보고한다.
4. Hobby 전환은 사용자가 명시적으로 승인한 후에만 한다.
5. 유료 전환 후 compute usage alert와 hard limit을 설정한다. 현재 compute hard limit의 최소 유료 한도는 `$10` 또는 즉시 차단을 의미하는 `$0`이므로, 사용자 승인 없이 `$10` 한도를 적용하지 않는다. 설정 당시 값은 [Railway Cost Control 문서](https://docs.railway.com/pricing/cost-control)를 다시 확인한다.
6. 첫 배포 24시간 후와 7일 후 Usage를 다시 확인해 실측 월 비용을 계산한다.

콜드 스타트를 피하기 위해 Serverless는 OFF로 유지한다. 비용을 줄이기 위해 Serverless를 켜는 변경은 사용자 경험과 비용을 다시 비교한 뒤 별도로 결정한다.

## 10. 실패와 롤백

- 새 deployment의 `/health`가 실패하면 Railway가 이전 정상 deployment를 유지하는지 확인한다.
- API 회귀가 있으면 `Deployments`에서 직전 성공 deployment를 선택하고 `Rollback`한다.
- rollback 직후 `/health`와 스모크 스크립트를 다시 실행한다.
- Railway 직접 health는 정상인데 Vercel만 실패하면 Railway를 rollback하지 않고 Vercel rewrite와 Origin을 분리 진단한다.
- Atlas 장애에서는 production 세션 API가 503을 반환하며 인메모리 저장소로 폴백하지 않는다.

## 11. 완료 체크리스트

- [ ] `Backend CI`의 quality 및 container job 성공
- [ ] Railway 계정 가입 및 GitHub OAuth 완료
- [ ] Full Trial 또는 Limited Trial 상태 확인
- [ ] Atlas application user 및 Network Access 설정
- [ ] Railway 6개 Variables 입력
- [ ] Root Directory `/apps/backend`
- [ ] Healthcheck `/health`, timeout 300초
- [ ] Serverless OFF, replica 1
- [ ] Railway public domain 생성
- [ ] Railway URL 스모크 네 항목 PASS
- [ ] Vercel same-origin rewrite를 통한 두 브라우저 흐름 PASS
- [ ] Usage 잔액 및 월 예상치 확인
- [ ] 첫 성공 deployment ID 기록
