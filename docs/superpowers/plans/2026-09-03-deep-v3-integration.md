# Deep v3 Stored Inputs and Joint Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. The storage/model/report interfaces are tightly coupled; execute inline with independent code review.

**Goal:** 새 입력 저장 → 공동 분담 질문 → 양측 동의 후 공동 리포트와 구조화된 기준 확인을 연결한다.

**Architecture:** `/api/v1/deep/v3`의 명시적 opt-in 경로를 추가하고 기존 Mongo repository의 revision·round·publication stamp를 재사용한다. v2 경로/질문/응답은 유지하며 서로 다른 버전의 세션 접근을 차단한다. 새 리포트의 제출 당시 분석은 불변이고 현재 합의 상태는 별도로 조회·조합한다.

**Tech Stack:** 기존 FastAPI/Pydantic/PyMongo, pytest. 신규 외부 의존성 없음.

**Spec:** ../specs/2026-09-03-deep-question-pipeline-final-design.md (§5~10), 이전 재원 구현 인계.

## Global Constraints

- `deep-v2/deep-rules-v1/deep-copy-ko-v1/deep-sharing-v1`은 소급 변경하지 않는다. 신버전은 `deep-v3/deep-rules-v2/deep-copy-ko-v2/deep-sharing-v2`다.
- 재무 공개 동의에는 재원·분담 의사·기대·수용 조건을 포함한다. 가치관 동의와 분리하며 혼합 결과는 필요한 양쪽 동의를 모두 요구한다.
- 개인 메모는 공동 결과/질문에 자동 공개하지 않는다. 상대 입력을 사전 질문 분기에 사용하지 않는다.
- 입력·계획 저장은 revision/planVersion 보호, 한쪽 제출 뒤 계획 잠금, 양측 제출·같은 계획·동의 전까지 waiting. 새 라운드도 버전 유지.
- 공동비 분담은 내부 이체이므로 생활비에서 다시 차감하지 않는다. 선호 차이와 미합의는 구분한다.
- 기본 변동비 계수는 새 버전만 1.0. 기존 0.85와 v2 캐시는 유지한다.
- 이번에는 코드/테스트/계약을 변경한다. push·배포·실카카오 설정 변경은 별도 요청 전 하지 않는다.

## Task 1: v3 모델·저장 계약

Files: 새 `deep/v3_models.py`, `deep/versions.py`; 수정 `deep/repository.py`; 테스트 `tests/unit/test_deep_v3_models.py`, `tests/unit/test_deep_v3_repository.py`.

Interfaces:

- `DeepInputV3(DeepInput)`: inputVersion, funding(PersonalFunding: sourcesStatus/sources/settlementsStatus/settlements), contribution(ownMonthly/expectedPartnerMonthly/personalSpendingFloor/personalSavingFloor/discussionState), constraints(종류·범위·필수/선호·금액/대출허용·선택 메모), afterSettlementMonthlyPayments.
- 부채 잔액은 기존 debts에서 재사용. 자산형 source.id는 assets.id에 연결하고 grossAmount는 해당 본인 지분 잔액 이하. 기존 자산 housing/goalAllocation은 v3에서 0으로 두고 funding만 배정 원장으로 사용한다. 지원/차입과 자산 이중 등록을 금지한다.
- `SharedPlanV3(SharedPlan)`: planSchemaVersion, fundingAsOf, fundingDeadlines, commonExpensesStatus/commonExpenses, newLoanAvailableOn/newLoanCertainty. 공동비는 최대20개 고정 카테고리(주거/식비/교통/구독/경조사/기타) 중 선택, 금액은 Amount. 알려진 납부 일정 총액은 알려진 주거가격+일회비용과 일치해야 한다.
- `input_for_version`, `plan_for_version`, `version_fields`는 fail-closed 버전 선택. repository.create의 keyword question_version 기본은 deep-v2. join/new round는 저장된 버전 유지. save/submit/update_plan에서 해당 타입을 검증한다.
- ID는 namespace 합산을 위해 신규 재원/부채 참조는 최대62자. 공동 계산 요청은 기존 FundingPreviewRequest를 상속하고 두 개인의 항목 상한을 합한 요청만 내부적으로 허용한다. 집 납부는 공동안을 한 번만 넣는다.

- [x] RED: v3 생성 후 A/B 초안 타입이 v3, round 이후 그대로, legacy 타입 쓰기 거부, stale revision 거부, old consent 거부를 테스트한다.
- [x] GREEN: 기존 repository의 조건부 갱신을 재사용하고 버전 선택·검증만 삽입한다.
- [x] Verify: model/repository 신규 테스트와 기존 deep models/repository/state 테스트.

```python
doc = await repo.create('a', 'key', 'hash', now, question_version='deep-v3')
assert doc['consentVersion'] == 'deep-sharing-v2'
assert doc['members']['A']['input']['inputVersion'] == 'deep-input-v3'
```

## Task 2: 공동 재원·분담·기준 분석과 질문

Files: 새 `deep/v3_finances.py`, `deep/v3_planning.py`, `deep/v3_questions.py`; 새 질문 config v3; 수정 `deep/config.py`, `deep/engine/cashflow.py`의 선택적 multiplier 인자. 테스트 `tests/unit/test_deep_v3_analysis.py`.

- `joint_funding(a,b,plan) -> CalculationBlock`: A/B ID namespace, canonical debt 참조, 새 공동대출을 공동안에서 한 번 추가. 알려진 반쪽 입력을 보존하며 모르는 상환/부채는 정확한 가용액·gap을 숨긴다. 개인 미리보기 표식·raw source·원본 ID는 공동 결과에 노출하지 않는다.
- `analyze_planning(a,b,plan) -> CalculationBlock`: budget/own contributions/gap/양방향 expectations, 수용 조건 충돌. 각 값은 null과0 구별. 결과는 제출 당시 의사이며 실제 능력·현재 합의와 다르다.
- 월 계산은 multiplier1.0, 기존 월 소득·개인 부담액 기반. 새 부분/전액 상환을 반영할 계약 정보 부족 시 미래 계산을 확정하지 않는다. 신규 개인 차입은 월 조건 정보가 없으면 새 월 예산을 unavailable로 한다. 공동비·개인비 최저액을 기존 생활비에서 다시 차감하지 않는다.
- 가치관10문항은 승인 카피를 적용한다. C1~C6 질문에는 binding/type/선택지를 명시한다. `questions_for_input`은 본인 입력과 공동안만 소비하고 상대 입력은 받지 않는다.
- 모든 이슈 목록 보존, 시작 주제는 최대3개. 금액 공백/미확정/조건 충돌/미합의/가치관 차이를 별개로 표현한다. 이번 단계의 월 계산은 현황 기반 참고이며 상세 개인비/공동비 재분류는 명시적 입력이 없는 한 추정하지 않는다.

- [x] RED: 분담 공백·기대 차이 분리, 자동 절감 제거, 동일 자산 ID 합산과 집 필요액 단일 계산을 테스트. 보증금·연결 상환은 기존 funding 회귀와 신규 부분 상환 사례로 검증.
- [x] GREEN: 순수 계산과 질문 카탈로그 구현.
- [x] Verify: 신규 분석 테스트 + 기존 funding/cashflow/goal 회귀.

## Task 3: v3 API·공동 공개·구조화된 기준

Files: 새 `deep/v3_router.py`, `deep/v3_report.py`; 수정 `deep/report.py`, `deep/repository.py`, `deep/service.py`, `deep/router.py`, `main.py`; 테스트 `tests/integration/test_deep_v3.py`.

- v3 아래 create/join/me/input/plan/confirm/submit/status/result/rounds/withdraw/agreements 경로 제공. 기존 인증·Origin·요청 제한·개인 오류 비공개를 재사용한다. 양쪽 경로에서 session questionVersion을 확인하고 반대 버전 접근404.
- `build_v3_report(snapshot)`는 can_publish 이후, shareFinance와 shareValues 각각 검사. 동의 없는 영역은 data=None/일반 reason만 반환. old consent 제출422.
- 재무 결과: cashflow/housing/goal/planning 블록, issues(제출 당시 계산), value topics. 목표는 시작일까지 확정 사용 가능한 목표 배정액만 반영하며 예상/미정 재원에는 추정 0을 대신 넣지 않는다.
- `DecisionTerms`: topic, scope, owner, startMonth, dueDay, monthlyContributions(A/B), exceptions. 월 분담 주제는 양쪽 금액 필수. 제안문/terms는 처음부터 공동 공개 문서, 비공개 개인 메모를 자동 삽입하지 않는다.
- 기존 합의 문서에 v3만 terms/planVersion/sourceReportId 추가. 수정은 양측 확인 초기화. `ReadyResultV3`는 불변 report와 최신 agreements/operatingStatus를 분리한다. 월 분담 합의가 없으면 notProposed/proposed/deferred, 양측 확인된 동일 계획의 단일 월 분담안만 agreed. 복수 확인안은 conflicting으로 표시한다. 취향의 차이로 합의 상태를 판단하지 않는다.
- 철회/만료/재작성/심사 초기화 시 기존 접근 차단·청소를 재사용한다. 불변 분석의 의향 공백과 현재 확인된 분담안은 출처를 구별한다.

- [x] RED: 두 계정 실제 라우트 흐름·대기 잠금·동의4조합·타세션/다른 버전 차단·재작성·기준 확인/수정/보류·오류 privacy·시나리오 캐시 보존 테스트.
- [x] GREEN: v3 라우트/리포트 연결, 저장소 합의필드 확장.
- [x] Verify: 전체 로컬 pytest 386 passed/17 skipped, Ruff, mypy121, OpenAPI exporter와 frontend/backend snapshots 일치. 실제 Mongo 사례 추가, 환경 없어 skip.
- [x] Review/Handoff: 독립 코드 리뷰, 중요 문제 수정, API 명세/프론트 예제/인계 갱신. 운영 배포는 하지 않는다.

리뷰 보완: DecisionTerms.commonScope + 동일 시작월 비교를 추가했다. 월 적자에는 적용 시작일을 넣어 날짜 우선순위를 지킨다. 철회용 버전 확인은 만료/종료 상태에서도 회원 여부만 확인해 정리 재시도를 보존한다. 상세 결과는 `docs/handoffs/2026-09-03-deep-v3-integration-progress.md` 참고.

## Coverage and boundaries

1→2: DeepInputV3/SharedPlanV3가 순수 분석 입력. 1→3: 동일 타입을 저장·공개 시 다시 검증. 2→3: 순수 함수는 공개 허가된 데이터만 소비. 기존 v2 endpoint/리포트 shape는 unchanged. 스트레스 시나리오·AI·정책·전체 재무질문 UI·독립 what-if 편집은 이 연결 작업의 의존성이 아니다.
