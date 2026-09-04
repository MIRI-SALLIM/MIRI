# 미리살림 Railway 백엔드 배포 설계

- 작성일: 2026-09-02
- 상태: 사용자 대화 승인 후 문서 검토 대기
- 기준 커밋: `fix/gate1-openapi-contract` (`43ca562`)
- 작업 브랜치: `codex/deploy-railway`

## 1. 목적

현재 FastAPI 백엔드를 Railway의 상시 실행 서비스로 배포하고 MongoDB Atlas와 연결한다. 프론트엔드는 Vercel에 별도로 배포하며, 브라우저는 Vercel의 same-origin `/api` rewrite를 통해 Railway API를 호출한다.

이번 작업의 성공 조건은 다음과 같다.

1. Railway가 `apps/backend`만 독립적으로 빌드한다.
2. 컨테이너가 Railway의 `PORT`에서 FastAPI를 실행한다.
3. `/health`가 배포 전환용 HTTP 200을 반환한다.
4. production에서 필수 비밀값이나 Vercel Origin이 빠지면 애플리케이션이 fail-closed 한다.
5. MongoDB Atlas를 사용할 수 없을 때 production 세션 API가 인메모리 저장소로 폴백하지 않는다.
6. Vercel rewrite를 통한 쿠키 기반 A/B 세션 흐름이 유지된다.
7. 저장소와 배포 로그에 비밀값이 기록되지 않는다.

## 2. 범위와 제외 범위

### 포함

- Railway용 재현 가능한 Docker 이미지
- production 환경변수 검증과 자동 테스트
- 백엔드 CI의 Ruff, mypy, pytest, Docker build 검사
- Railway 대시보드 설정과 Atlas/Vercel 연동 운영 문서
- 배포 후 health 및 핵심 세션 API 스모크 검사
- 초기 Trial 사용량 확인과 비용 제한 설정

### 제외

- Vercel 프론트엔드 배포 자체
- 프론트엔드 기능 및 OpenAPI 계약 변경
- MongoDB Atlas 유료 티어 전환
- Railway 내부 MongoDB로의 이전
- 다중 리전, 수평 확장, 별도 워커, Redis
- 기존 B1-B6 API의 도메인 동작 리팩터링

## 3. 배포 아키텍처

```text
브라우저
  │ https://<vercel-domain>/api/v1/*
  ▼
Vercel frontend + /api rewrite
  │ HTTPS proxy
  ▼
Railway persistent FastAPI service
  │ mongodb+srv TLS
  ▼
MongoDB Atlas M0
```

브라우저가 Railway 도메인을 직접 호출하지 않도록 한다. Vercel이 `/api/:path*`를 Railway의 `/api/:path*`로 rewrite하면 참여자 쿠키는 프론트엔드 출처의 same-site 쿠키로 동작한다. 기존 `HttpOnly`, production `Secure`, `SameSite=Lax`, `Path=/` 정책을 유지하고 `SameSite=None`으로 완화하지 않는다.

Railway 서비스의 Serverless/App Sleeping은 끈다. 미리살림의 초대 및 세션 복구 첫 요청에서 콜드 스타트와 502 가능성을 허용하지 않는다. Trial 이후 월 $1 Free 크레딧으로 상시 실행이 어려우면 Hobby 월 $5로 전환한다.

## 4. Railway 빌드 방식

신규 서비스에서 deprecated된 `railway.json`과 `railway.toml`은 만들지 않는다. 프로젝트 상태를 관리하는 `.railway/railway.ts`는 Railway 프로젝트가 생성되고 CLI로 pull한 뒤 도입할 수 있으므로 최초 배포의 필수조건으로 두지 않는다.

최초 배포는 다음 두 계층으로 구성한다.

1. 저장소의 `apps/backend/Dockerfile`이 Python 버전, 의존성 설치, 비루트 실행 사용자와 Uvicorn 시작 명령을 고정한다.
2. Railway 대시보드가 GitHub source branch, root directory, healthcheck, region, Serverless와 secrets를 관리한다.

Docker 이미지는 `python:3.11-slim`을 사용한다. 컨테이너 시작 명령은 다음과 같다.

```text
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```

`apps/backend/.dockerignore`는 `.venv`, 캐시, 테스트 결과, `.env`, Git 메타데이터가 이미지에 들어가지 않게 한다.

## 5. Railway 서비스 설정

| 설정 | 값 |
| --- | --- |
| Source repository | `hotpringles/MIRI` |
| Initial source branch | `codex/deploy-railway` |
| Root Directory | `/apps/backend` |
| Builder | Dockerfile 자동 감지 |
| Healthcheck Path | `/health` |
| Healthcheck Timeout | 300초 |
| Public Networking | Railway domain 생성 |
| Region | 한국 사용자와 Atlas 위치에 가장 가까운 아시아 리전 |
| Serverless | OFF |
| Restart Policy | Free/Trial은 `On Failure`, 유료 전환 후 `Always` 검토 |
| Replicas | 1 |

통합 검증 후 변경을 `develop`과 릴리스 브랜치에 반영한다. Railway production source branch는 팀 릴리스 브랜치 정책이 확정될 때 `codex/deploy-railway`에서 승인된 릴리스 브랜치로 변경한다.

## 6. 환경변수와 비밀값

Railway Variables에 다음 값을 저장한다.

| 변수 | 정책 |
| --- | --- |
| `ENVIRONMENT` | 정확히 `production` |
| `MONGODB_URI` | Atlas의 `mongodb+srv://` 연결 문자열, 저장소 기록 금지 |
| `MONGODB_DB_NAME` | `mirisalim` |
| `PARTICIPANT_TOKEN_PEPPER` | 개발 기본값과 다르고 최소 32자 이상인 난수 |
| `ALLOWED_ORIGINS` | 실제 Vercel production Origin을 정확히 1개 이상 지정 |
| `SESSION_TTL_DAYS` | `7` |

Railway가 주입하는 `PORT`를 별도 고정하지 않는다. `.env.example`에는 예시와 설명만 두고 실제 URI, 비밀번호, pepper, 배포 URL을 커밋하지 않는다.

production 시작 시 다음 조건을 검사한다.

- `MONGODB_URI`가 비어 있지 않다.
- `ALLOWED_ORIGINS`가 비어 있지 않고 각 항목이 `https://` Origin이다.
- `PARTICIPANT_TOKEN_PEPPER`가 개발 기본값과 다르고 최소 32자다.
- `SESSION_TTL_DAYS`가 양의 정수다.

하나라도 실패하면 명확한 변수 이름을 포함한 설정 오류로 시작을 중단하되 값 자체는 출력하지 않는다.

## 7. Health와 readiness

Railway의 `/health`는 새 컨테이너가 HTTP 요청을 받을 수 있는지 확인하는 배포 전환 신호로 사용한다. 현재 응답의 `status`는 `ok`를 유지한다. Atlas 연결 상태는 응답의 `database` 필드와 배포 후 스모크 검사에서 별도로 확인한다.

Railway healthcheck는 연속 모니터링이 아니므로 운영 문서에 다음 수동 검사를 둔다.

1. `GET /health`가 200이고 `database=connected`인지 확인한다.
2. `GET /api/v1/light/questions?version=light-v1`가 200인지 확인한다.
3. `POST /api/v1/sessions`가 201이고 `mrs_participant` 쿠키를 발급하는지 확인한다.
4. Vercel URL을 통해 같은 세 가지 요청을 확인한다.

스모크 스크립트는 비밀값이나 응답 쿠키 값을 출력하지 않는다.

## 8. Atlas 연결

기존 MongoDB Atlas M0를 사용한다. 세션은 7일 TTL로 자동 삭제되므로 초기 저장량은 무료 512MB 범위 안에 머무는 것을 전제로 한다.

Atlas에서는 별도 애플리케이션 DB 사용자를 만들고 `mirisalim` 데이터베이스에 필요한 최소 읽기/쓰기 권한만 부여한다. Railway의 outbound 접속을 Atlas Network Access에서 허용한다. 광범위한 IP 허용이 불가피한 플랜이면 강한 비밀번호, 최소 DB 권한, TLS URI를 필수로 유지한다.

## 9. CORS와 쿠키 경계

production CORS allowlist에는 실제 Vercel Origin만 둔다. Railway API 도메인 자체를 browser Origin으로 추가하지 않는다. 로컬 개발 Origin과 레거시 Render Origin은 production에서 자동 포함하지 않는다.

운영 브라우저 경로는 Vercel same-origin rewrite가 전제다. Railway 도메인 직접 호출은 health와 비쿠키 진단에만 사용하고, 참여자 세션 E2E는 Vercel 도메인에서 검증한다.

## 10. CI와 검증

백엔드 CI는 Python 3.11에서 다음을 실행한다.

```text
ruff check apps/backend
mypy apps/backend/main.py apps/backend/schemas.py apps/backend/services apps/backend/tests
pytest apps/backend
docker build apps/backend
```

현재 기준 브랜치에는 Ruff import-order 오류 9건이 있고 pytest는 `28 passed, 6 skipped`, mypy는 성공한다. 배포 변경과 함께 import order만 기계적으로 정리해 CI의 깨끗한 기준선을 만든다. 실제 MongoDB가 필요한 6개 테스트는 Atlas production을 사용하지 않고 별도 테스트 MongoDB가 준비될 때 실행한다.

배포 완료 판정에는 다음이 모두 필요하다.

- 전체 빠른 pytest 통과
- Ruff와 mypy 통과
- Docker 이미지 빌드 성공
- Railway deploy 상태 성공
- Railway `/health` 200과 Atlas connected
- Vercel rewrite를 통한 두 브라우저 A/B 세션 스모크 통과

## 11. 실패와 롤백

- production 설정 누락: 컨테이너 시작 실패, Railway가 이전 정상 배포를 유지한다.
- Atlas 연결 실패: health 본문에 disconnected가 표시되고 세션 API는 503을 반환한다.
- 새 이미지 healthcheck 실패: Railway가 트래픽을 새 배포로 전환하지 않는다.
- API 회귀: Railway에서 직전 성공 배포로 rollback한다.
- 프론트 rewrite 오류: Railway 직접 health를 확인한 뒤 Vercel rewrite와 Origin 설정을 분리 진단한다.

이번 배포에는 DB 마이그레이션이 없고 기존 TTL/unique 인덱스를 그대로 사용하므로 애플리케이션 롤백과 데이터 스키마 롤백을 분리할 필요가 없다.

## 12. 구현 파일 경계

- 생성: `apps/backend/Dockerfile`
- 생성: `apps/backend/.dockerignore`
- 생성: `apps/backend/tests/test_production_settings.py`
- 생성: `apps/backend/scripts/smoke_deployment.py`
- 생성: `.github/workflows/backend.yml`
- 생성: `docs/operations/backend-railway-deployment.md`
- 수정: `apps/backend/main.py`
- 수정: `apps/backend/.env.example`
- 기계적 수정: Ruff가 지적한 Python import order만 정리

프론트엔드 파일과 OpenAPI 응답 계약은 수정하지 않는다.

## 13. 완료 기준

1. `codex/deploy-railway`가 `fix/gate1-openapi-contract` 위의 배포 변경만 포함한다.
2. 저장소에 실제 비밀값이 없다.
3. production 필수 설정 누락 테스트가 모두 실패-폐쇄 동작을 검증한다.
4. FastAPI 테스트, Ruff, mypy, Docker build가 통과한다.
5. Railway persistent service가 Serverless OFF로 동작한다.
6. Railway URL의 health와 질문 API가 정상이다.
7. Atlas 연결과 TTL/unique 인덱스가 확인된다.
8. Vercel same-origin rewrite를 통해 쿠키 기반 양측 세션 흐름이 정상이다.
9. Trial 사용량에 경고 및 hard limit을 설정하고 7일 뒤 월 비용을 재산정한다.
