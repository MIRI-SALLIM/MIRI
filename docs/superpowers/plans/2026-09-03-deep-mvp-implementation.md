# Deep MVP Implementation Plan

**2026-09-03 실행 현황:** A/B 및 C1~C4 로컬 구현, C5 계약/검증 기반 준비. 실Mongo CI·카카오/프론트 E2E·배포 gate는 미완료. [최신 인계](../../handoffs/2026-09-03-deep-mvp-c-progress.md)를 먼저 확인한다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완성 단계의 Light를 유지하면서 카카오 로그인, 정확한 재무 계산, 양측 동시 공개, 템플릿 대화와 합의 기록으로 Deep 첫 출시를 완결한다.

**Architecture:** 기존 FastAPI 앱에 독립 auth/deep 모듈을 추가한다. 계정 인증과 익명 Light 참여자 인증을 분리하고, 순수 계산 엔진은 HTTP·DB·LLM에 의존하지 않는다. 기능 플래그를 끈 상태로 통합한 뒤 시험 환경 검증과 승인 후 활성화한다.

**Tech Stack:** Python 3.11, FastAPI, Pydantic 2, PyMongo Async, MongoDB, HTTPX, pytest/AnyIO, Ruff, mypy. 기존 Vercel 프록시·Railway 배포 구조 유지.

**Spec:** `docs/superpowers/specs/2026-09-03-mirisallim-deep-mode-design-draft.md` 및 본 문서의 실행 범위. 2026-09-03 사용자가 순차 구현 시작을 요청했다. 로컬 구현·검증을 진행하며 운영 배포·외부 앱 설정은 별도 승인 대상이다.

## 실행 기록 (2026-09-03)

- 작업공간: 기존 격리 worktree, 기준 HEAD `83f0719`, detached HEAD. 운영 체크아웃/브랜치에는 변경하지 않는다. 커밋은 작업 브랜치 통합 결정까지 보류한다.
- Light 기준선: 로컬 Python 3.12.10에서 42 passed / 6 skipped. DB 테스트는 운영 URI 차단으로 skip.
- A: 계정 설정·Mongo 저장소·카카오 REST 교환·로그인/로그아웃 API 로컬 구현. 실제 카카오·Mongo 동시성·프록시 로그/쿠키·Python 3.11 CI 시험은 별도.
- B: 10문항·입력 모델·결정적 계산·주제 선정 로컬 구현. HTTP 공개 연결은 C에서 수행한다.
- C1~C5: 미구현. Deep 활성화와 배포는 아직 금지. 다음 단계와 세부 계약은 [A/B 중간 인계](../../handoffs/2026-09-03-deep-mvp-ab-progress.md)를 읽는다.

## Global Constraints

- 라이트의 기존 익명 참여는 유지한다.
- 딥은 카카오 로그인 필수.
- 초대 코드는 로그인 대체 수단이 아니다.
- 두 사람의 입력과 동일 공동 계획 확인·공개 동의 후에만 결과를 공개한다.
- 정책 매칭·AI 해설·고정 16개 유형 해설·숫자형 Say-Do 판정은 이번 출시에서 제외한다.
- 딥 입력에 guesses/partnerPredictions를 추가하지 않는다.
- 잔액=원, 월 흐름=원/월, 연 흐름=원/년, 비율=소수로 분리한다.
- 저소득·큰 부채·음수 잉여자금 자체는 422 사유가 아니다.
- source와 계산 버전은 서버가 지정한다.
- 초안 30일·결과 90일·부채 30건 상한은 설계 초안의 제안값으로 계획에 사용한다. 출시 전에 사용자 확인을 받아 환경 설정으로 확정한다.
- 이 계획을 실행해도 자동으로 프로덕션을 배포하거나 유료 자원을 생성할 권한이 생기지 않는다.

## 1. 실행 순서: 세 개의 독립 검증 단위

| 순서 | 계획 파일 | 산출물 | 작업 |
|---|---|---|---|
| A | [카카오 계정 인증](2026-09-03-deep-mvp-a-auth.md) | 별도 로그인 세션·인증 의존성·로그아웃 | A1~A3 |
| B | [입력 계약과 계산 엔진](2026-09-03-deep-mvp-b-engine.md) | 10문항·재무 DTO·현금흐름·목표·대화 주제 | B1~B4 |
| C | [공동 공개·대화·출시 검증](2026-09-03-deep-mvp-c-couple-release.md) | 초대·자동저장·동시 공개·템플릿·합의·프론트 계약 | C1~C5 |

B는 실제 카카오 앱 등록 없이 진행 가능하다. C는 A의 `require_account`와 B의 모델·분석 함수를 사용한다. 자동 병렬 에이전트 실행을 요구하지 않는다. 기본 제안은 같은 작업에서 순차 진행하며, 에이전트 위임은 별도 선택이다.

## 2. 범위와 제외 범위

포함: 카카오 로그인, 각자 입력/자동저장, 5영역 10문항, 공동 계획, 양측 제출·동의, 현재/계획 월 예산, 사용자 입력 조건의 주거 시나리오, 12개월 현금흐름, 목표 부족액, 최대3개 대화 카드, 합의/보류, 만료·철회·내부 계정 삭제, OpenAPI·프론트 테스트 fixture.

제외: 금융상품 추천·정책 자격 판정, LLM API, 금융기관/마이데이터 연동, 상대 예측, 궁합·순자산 등수, 민감 재무 PDF·공개 링크, 푸시/카카오 메시지, 자동 장기 재진단. 카카오 로그인은 카카오톡 메시지 권한을 요구하는 기능이 아니다.

라이트 성공 응답·질문·계산·쿠키를 변경하지 않는다. 예외는 기존의 미완성 `mode=deep` 우회 경로: 현황을 확인하고 신규 전용 API를 안내하는 명시적 오류로 막는다. 기존 질문 조회는 인증된 deep-v1 호환 조회와 deep-v2 조회를 구분하며 세션 신규 생성은 v2만 허용한다.

## 3. 디렉터리와 변경 경계

신규: `apps/backend/auth/`, `apps/backend/deep/`, 해당 unit/integration 테스트, deep 전용 config.

기존 수정: `apps/backend/main.py`의 라우터 등록·의존성 연결·OpenAPI security, `schemas.py`의 legacy mode 제한, `tests/conftest.py`의 새 저장소 격리, `.github/workflows/backend.yml`의 새 모듈 타입검사·CI 전용 Mongo, 값 없는 `.env.example`, `export_openapi.py`가 생성하는 두 스냅샷.

`services/light_result.py`, `services/calculator.py`, Light config·테스트의 기대값은 변경하지 않는다. Light가 망가졌다고 기존 테스트를 새로운 Deep 동작에 맞춰 약화하지 않는다.

## 4. 공통 오류·보안·버전

- API 오류 봉투는 기존 `ErrorResponse`를 유지한다. 비멤버404, 미인증401, 버전/제출 충돌409, 만료410, 잘못된 구조422, 속도제한429, 저장소 장애503.
- 모든 Deep 개인 데이터 접근은 account + membership + active round + expiresAt을 확인한다. Light cookie만으로는 계정 인증이 성립하지 않는다.
- 변경 요청은 `PUBLIC_APP_ORIGIN`과 개발 허용 출처를 정확히 검사한다. credentialed CORS는 CSRF 방어의 대체가 아니다. OAuth callback은 Origin 요구 대신 browser-bound state를 검사한다.
- 레코드의 개인정보를 로그·exception message에 포함하지 않는다. OAuth query code·state도 접근 로그에서 제거한다.
- `questionVersion=deep-v2`, `ruleVersion=deep-rules-v1`, `copyVersion=deep-copy-ko-v1`, `consentVersion=deep-sharing-v1`를 세션 생성 시 고정한다.
- `DEEP_MODE_ENABLED=false`를 기본으로 한다. false에서 Light는 정상 동작하며 카카오 비밀값 누락이 Light 시작을 막지 않는다. 라우터는 항상 등록해 OpenAPI를 결정적으로 생성하되 실행 시 플래그를 검사한다.

## 5. 테스트 실행 준비

계획 작성 중에는 테스트를 실행하지 않았다. 실행자는 먼저 현재 작업 브랜치·사용자 변경을 확인하고 아래 기준선을 기록한다. 과거 42 passed 기록을 이번 실행 결과로 대체하지 않는다.

로컬은 `apps/backend` 작업 디렉터리에서 기존 `.venv/Scripts/python.exe`를 사용한다. 기본 unit/API 테스트는 `.env`의 운영 URI를 읽지 않도록 아래 pytest wrapper를 구현한 뒤 실행한다.

```python
# scripts/test_local.py — 구현 시 추가할 테스트 전용 진입점
import os
import sys
import pytest

os.environ['ENVIRONMENT'] = 'test'
os.environ['MONGODB_URI'] = ''
os.environ['DEEP_TEST_MONGODB_URI'] = ''
raise SystemExit(pytest.main(sys.argv[1:] or ['-q']))
```

이는 현재 `load_dotenv()`의 기본 override=False를 전제로 한다. 해당 전제가 바뀌면 테스트에서 운영 URI가 차단되는지를 먼저 고친다. 외부 Atlas 주소로 테스트 DB를 생성하지 않는다.

```powershell
.\.venv\Scripts\python.exe scripts/test_local.py -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m mypy main.py schemas.py services auth deep tests scripts
```

Mongo 동시성 검증은 CI service container에 한정하며 별도의 C5 조건을 따른다. 로컬 Docker 설치는 요구하지 않는다.

## 6. 설계의 15개 검증 사례 연결

| 설계 사례 | 구현 작업 | 자동 테스트 파일 |
|---|---|---|
| 1 채점 방향 | B1·B4 | `tests/unit/test_deep_questions.py`, `test_deep_values.py` |
| 2 단위 | B2·B3 | `tests/unit/test_deep_models.py`, `test_deep_cashflow.py` |
| 3 기준 현금흐름 | B3 | `tests/unit/test_deep_cashflow.py` |
| 4 상여/합가 중복 | B3 | `tests/unit/test_deep_cashflow.py` |
| 5 주거·대출 중복 | B3 | `tests/unit/test_deep_housing.py` |
| 6 동일답·동률 | B4 | `tests/unit/test_deep_values.py` |
| 7 누락·공개거부 | B2·C3 | `tests/unit/test_deep_models.py`, `tests/integration/test_deep_privacy.py` |
| 8 경계 숫자·목표 | B3 | `tests/unit/test_deep_debt.py`, `test_deep_goals.py` |
| 9 상대정보 차단 | A3·C1~C3 | `tests/integration/test_deep_privacy.py` |
| 10 경쟁 요청 | C2·C5 | `tests/integration/test_deep_mongo.py` |
| 11 철회·캐시 | C3·C4 | `tests/integration/test_deep_lifecycle.py` |
| 12 외부 기능 없는 결과 | C3 | `tests/unit/test_deep_report.py` |
| 13 합의 재확인 | C4 | `tests/unit/test_deep_agreements.py` |
| 14 만료·저장·로그 | A3·C4·C5 | `tests/integration/test_deep_lifecycle.py`, 프론트 E2E 체크리스트 |
| 15 Light·계약 회귀 | C5 | 기존 Light 테스트 전체 + `tests/test_deep_openapi.py` |

## 7. 외부 준비와 실행 승인

실제 카카오 로그인 시험에만 필요한 준비: 카카오 Developers 앱 등록 권한, REST API 키·Client Secret, 프론트의 확정된 테스트/운영 origin과 등록 callback. 키를 채팅·커밋에 붙이지 않고 환경 변수에 저장한다. 준비가 늦어져도 A의 mock 테스트와 B는 진행할 수 있다.

카카오 REST 인증은 인가코드→서버 토큰 교환→사용자 정보 확인 흐름이며, redirect_uri 일치와 Client Secret 설정을 확인해야 한다. [카카오 공식 REST API 문서](https://developers.kakao.com/docs/ko/kakaologin/rest-api)를 2026-09-03 확인했다. 이 문서의 앱 세션·보관기간·CSRF·저장 설계는 미리살림의 구현 결정이다.

실행 전 검토 대상: MVP 범위, 보관기간 제안값, 새 로그인 앱 등록의 담당자, 실제 작업 기준 브랜치. 완료 후에는 코드·테스트·프론트 계약을 인계하고 별도로 배포 승인을 받는다.
