# Deep MVP 순차 구현 — A/B 중간 인계

## 현재 범위

2026-09-03 사용자 요청에 따라 기존 `83f0719` 기반 격리 worktree에서 구현을 시작했다. **딥 전체 완성·배포 완료가 아니라 A(인증)와 B(질문·계산)의 로컬 구현 단계**다. 운영 체크아웃과 Railway 설정은 변경하지 않았고, 커밋·푸시하지 않았다.

- A: 카카오 인증코드 교환, 브라우저에 결합된 일회용 state, HMAC 저장 로그인 세션, `start/callback/me/logout` API. Light `mrs_participant`와 계정 `mrs_account`를 분리한다. Mongo 장애 시 인증은503이며 메모리 fallback이 없다.
- B: 기존8문항 deep-v1 스냅샷, D5 방향 수정 및 D9/D10 추가 deep-v2, 엄격한 입력 모델, 현금흐름·대출 상환표·주거 초기자금·12개월 예상·목표·영역별 대화 주제 선정. 외부 AI/정책 서비스 호출은 없다.
- 인증 OpenAPI를 기존 생성기로 양쪽 스냅샷에 반영했다. 기존 Light 계약은 유지했다.
- `DEEP_MODE_ENABLED=false`가 기본이다. 카카오 비밀값이 없는 상태에서 Light 기동을 유지한다. true일 때 인증 설정과 질문·규칙 파일을 시작 시 검사한다.

## 반드시 구별할 미완료 기능

**C1~C5는 아직 구현하지 않았다.** 따라서 현재 기존 `/api/v1/deep/questions`는 종전 공개8문항 API이고, 신규 deep-v2 조회 API·계정 멤버십·자동저장·양측 제출·공동 공개·템플릿 결과·합의·철회·계정 삭제가 연결되지 않았다. 기존 `mode=deep` 우회 차단도 C1에서 처리한다. 현재 상태로 Deep을 사용자에게 오픈하거나 운영 플래그를 켜면 안 된다.

다음 작업은 [C 실행 계획](../superpowers/plans/2026-09-03-deep-mvp-c-couple-release.md)의 **C1 멤버십·개인 초안·공동 계획**이다. A/B를 처음부터 다시 구현하지 않는다.

## 구현하면서 구체화한 계약

- 초안에서 `income.referenceMonth`와 `livingTogether`는 `null` 가능하다. 미확인 합가 여부를 false로 간주하지 않는다. 빠진 지출 항목은 unknown으로 채운다.
- 원화 입력은 JS에서 정밀하게 표현 가능한 정수 범위(0~2^53−1), 계산 기간은 최대1200개월, 자산 최대100건으로 구조적 제한을 둔다. 부채는 계획의 제안값30건이다. 금융 적정성 판정이나 금액 자동 보정이 아니며 범위 초과는 명시적으로 거부한다. 출시 전 상한 정책을 확인한다.
- 연 금리는 유한 Decimal이며 최대14자리/소수10자리로 제한한다. 음수·NaN·Infinity와0개월은 거부한다.
- 표시 예산의 합계를 일치시키기 위해 추정 변동비를 원 단위 반올림한 뒤 잉여자금을 구한다. 0.5원 경계 회귀 테스트가 있다.
- 계획 자금은 시작월1일까지 사용 가능한 명시적 배정액만 확정 자금으로 센다. 중도 반환/지급 자금은 제외하고 확인 필요로 표시한다.
- 월 예산은 직접 입력한 상환액 우선이다. 12개월 표는 계약 조건이 충분하면 **입력 잔액·남은 기간을 계획 시작월 조건으로 보는 추정**이다. 조건 부족 시 알려진 월 납입액 지속 가정만 표시하며 미래 잔액을 만들지 않는다. 실제 계획 시작월 조건과 다르면 입력 수정이 필요하다.
- 목표 필요 적립액은 목표월 직전까지의 개월 수와 목표 전용 배정액으로 구한다. 월 여력 비교는 기준 월 예산이며, 만기 일시금 등 월별 변동은 별도12개월 표와 함께 확인해야 한다.
- HTTPOnly/SameSite=Lax 쿠키 사용상 프론트와 **same-origin `/api` 프록시**가 전제다. 카카오 callback은 `PUBLIC_APP_ORIGIN/api/v1/auth/kakao/callback`과 정확히 일치해야 한다.
- Uvicorn 접근 로그에서 OAuth 경로 query를 제거한다. 프론트/프록시/Railway 로그는 아직 실환경 검증하지 않았다. HTTP 본문·헤더 debug logging을 활성화하지 않는다.

## 재검증 명령

최종 로컬 검증: **199 passed / 6 skipped**, Ruff 통과, mypy64개 파일 통과, `git diff --check` 통과. 생성한 두 OpenAPI 파일이 일치하며 기존 모든 API path 계약은 변경되지 않았음을 비교했다. 새 인증 API만 추가했다.

`apps/backend`에서:

```powershell
.\.venv\Scripts\python.exe scripts/test_local.py -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m mypy main.py schemas.py services auth deep tests scripts
```

로컬 Python3.12.10이다. `scripts/test_local.py`는 테스트 프로세스의 운영 Mongo URI와 Deep 활성화 플래그를 차단한다. 기존 DB 연결 테스트6개는 skip이며 **실제 Mongo 검증 통과를 의미하지 않는다**. Python3.11 CI 설정은 갱신했지만 원격 CI는 아직 실행하지 않았다.

## 외부 시험/출시 준비

카카오 Developers 앱 REST API 키·Client Secret 및 확정 프론트 origin/등록 callback이 필요하다. 비밀값을 채팅이나 Git에 넣지 않는다. mock 테스트 통과를 실제 카카오 로그인 성공으로 표현하지 않는다.

C5에서 CI 전용 Mongo 경쟁 테스트와 두 계정 프론트 E2E를 추가·실행한다. 초안30일/결과90일 보관, 실제 프록시 IP 신뢰, 쿠키 전달, 접근 로그, 기존 legacy deep 문서 유무를 확인하고 별도 승인 후에만 배포한다.
