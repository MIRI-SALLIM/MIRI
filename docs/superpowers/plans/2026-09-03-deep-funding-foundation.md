# Deep Funding Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보증금·연결 대출·재원 확정 상태·날짜별 납부를 반영하는 새 재원 엔진과 인증된 본인 입력 미리보기를 만든다.

**Architecture:** 기존 DeepInput/v2 보고서를 수정하지 않는 별도 funding 모델·순수 엔진을 만든다. 기존 인증·Origin·오류 비공개·요청 제한을 재사용하는 stateless POST API로 검증한다. 이번 묶음은 공동 저장/새 세션 버전 이전의 기반이며, 공동 분담·조건·최종 v3 결과 연결은 후속 묶음이다.

**Tech Stack:** 기존 Python/FastAPI/Pydantic/pytest. 새 의존성 없음.

**Spec:** ../specs/2026-09-03-deep-question-pipeline-final-design.md (승인: 2026-09-03 사용자 “구현해줘”; 먼저 재원 연결 구현).

## Global Constraints

- 기존 `deep-v2` 입력·리포트·공개 동의·0.85 산식을 소급 변경하지 않는다.
- 현금·보증금은 본인 몫의 총 재원과 상환 후 순재원을 구분한다. 상환 이벤트 ID별 한 번만 차감한다.
- 미정·비공개·누락은 0이 아니다. 예상 재원은 기본안에 포함하지 않는다.
- API는 본인이 보내온 입력만 계산한다. 세션 ID나 타인 입력을 읽지 않고 저장·공동 공개하지 않는다.
- 공개 API는 로그인·기존 Deep 활성화·신뢰 Origin·요청 제한을 적용한다. 본문/검증 오류의 민감값을 반사하지 않는다.
- 코드 수정은 이 작업공간에 한정하며 push·배포·운영 DB 작업은 하지 않는다.

## Task 1: 재원 입력과 날짜별 계산

**Files:** Create `apps/backend/deep/funding_models.py`, `apps/backend/deep/engine/funding.py`, `apps/backend/tests/unit/test_deep_funding.py`.

**Interfaces:** `FundingPreviewRequest` → `calculate_funding(body: FundingPreviewRequest) -> FundingPreviewResponse`.

`FundingPreviewRequest`는 asOf(기준일), sourcesStatus/debtsStatus/settlementsStatus(known/unknown/withheld), sources/debts/settlements/deadlines를 갖는다. source는 id, kind, grossAmount(기존 Amount), availableOn, certainty(available/confirmed/expected/unknown), housing/goal/reserve 배정액이다. 동일 실물 재원을 여러 source로 중복 등록하지 않는 입력 계약이다. debt는 id/balance, settlement는 id/debtId/amount/dueOn/parts(sourceId/amountWon), deadline은 id/dueOn/amount다.

source 최대100, debt30, settlement60, deadline120. 금액은 기존 Money의 안전 정수 한도. 중복 ID·없는 참조·배정 초과·채무잔액 초과 상환·분할 상환합 불일치·JS 합산 안전한도 초과를 거부한다. available은 asOf 이하의 날짜가 필요하다. 확인된 예정 입금이 기준일을 지났는데 미입금이면 기본 재원에서 제외하고 재확인을 요구한다. 날짜 미정은 계산 불확실성을 보존한다.

금액을 실제 계산할 때는 모든 돈을 공동비로 쓰지 않는다. 각 재원에서 집 계획에 진입하는 금액은 다음과 같다.

```python
source_funding_at_date = min(gross_amount, housing_allocation + allocated_settlements_due_by_date)
net_source = gross_amount - allocated_settlements
available_at_date = sum(eligible_source_funding) - sum(settlements_due)
gap = max(0, housing_costs_due - available_at_date)
```

상환 날짜도 타임라인에 포함한다. 부족액은 누적 시점별 값이므로 행끼리 합산하지 않는다. 미정 상환 금액/날짜는 정확한 부족액 계산을 막는다. 알려진 재원만 있는 경우 결과에 부분 입력과 “입력상 확보 재원 기준”을 표시한다. 예상까지 포함한 비교값은 가정임을 명시한다.

- [x] RED: 다음 행동 테스트를 먼저 작성하고 실행한다.

```python
from tests.unit.test_deep_funding import calculate, funding_input

def test_deposit_settlement_is_counted_once():
    report = calculate(funding_input())
    assert report.timeline[-1].availableForHousingWon == 20_000_000
    assert report.timeline[-1].fundingGapWon == 10_000_000
```

추가 사례: 늦은 반환·계약금 공백 유지·상환이 반환보다 먼저 도래·상환 초과액 보존·미배정 자산 제외·예상 재원 별도·미정 금액/날짜·부분 공개·분할 상환·과다 배정·동일 채무 다중 이벤트·합산 안전 정수·기존 v2 회귀.

- [x] GREEN: 위 모델 검증과 이벤트 기반 엔진을 구현한다. 순재원·각 날짜 현금흐름·불확실 사유·직접적인 문구/다음 질문을 typed response로 반환한다. 미래 월 상환액·대출 승인 판단은 하지 않는다.
- [x] Verify: `.venv/Scripts/python.exe -m pytest tests/unit/test_deep_funding.py -q` (cwd apps/backend).

## Task 2: 본인 미리보기 API·계약·검증

**Files:** Modify `apps/backend/deep/router.py`; Create `apps/backend/tests/integration/test_deep_funding_preview.py`; regenerate backend/frontend OpenAPI with existing `export_openapi.py`; write handoff and update PROJECT_CONTEXT.

**Interfaces:** `POST /api/v1/deep/funding/preview` consumes FundingPreviewRequest, returns FundingPreviewResponse, `ruleVersion=deep-funding-v1`, `audience=private_input_preview`. 명칭은 v3 세션 생성 계약을 뜻하지 않는다.

- [x] RED: deep_context를 이용해 실제 endpoint로 수치·상태·개인용 표기를 검증한다. 인증 제거401, Origin 오류403, 잘못된 연결422, 제한429, 민감값이 없는 에러 응답을 확인한다.

```python
response = client.post('/api/v1/deep/funding/preview', json=payload,
                       headers={'Origin': 'http://testserver'})
assert response.status_code == 200
assert response.json()['audience'] == 'private_input_preview'
```

- [x] GREEN: 기존 router/DeepRoute 안에 라우트를 추가하고 `limit_mutation(..., 'funding-preview')`를 사용한다. DB에서 개인·상대 재무 데이터를 읽거나 입력을 저장하지 않는다.
- [x] Verify: focused tests, full pytest, Ruff, mypy, OpenAPI generation/check. 로컬 Mongo/HTTPS skip은 실제 통과로 보고하지 않는다.
- [x] Review: 별도 코드 리뷰 스킬로 계산·타임라인·개인 미리보기 경계를 검토하고 중요한 문제를 수정한다.
- [x] Handoff: 완료 묶음과 후속 공동 저장/v3 공개·질문 카탈로그 연결 범위를 명확하게 기록한다. 커밋/원격 변경은 별도 요청 전 보류한다.

## Plan review

Task 1 모델과 엔진은 상호 의존하므로 같은 TDD 묶음으로 구현한다. Task 2는 Task 1의 typed 응답만 사용한다. 이번 범위는 제품 설계 §5의 재원 기반이며 §6 이후 공동 분담·전체 v3 질문 전환을 완료했다고 주장하지 않는다. 기존 제출/계획 잠금을 우회하는 공동 리포트 API를 새로 만들지 않는다.

완료 검증: 신규43개, 전체352 passed/16 skipped/11 warnings, Ruff 통과, mypy107개 통과. 엔진·API 리뷰의 중요한 지적을 실패 테스트로 확인하고 수정했으며 재리뷰에서 미해결 Important/Critical 없음. 상세 변경과 다음 범위는 [인계](../../handoffs/2026-09-03-deep-funding-progress.md)에 기록했다.
