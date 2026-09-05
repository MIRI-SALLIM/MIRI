# 우리 돈의 기준회의 A단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 호출 없이 최소 근거 패킷·월 분담안 비교·생성 응답 참조 검사를 테스트 가능한 순수 함수로 제공한다.

**Architecture:** 기존 v3 리포트와 API는 변경하지 않고 deep/meeting 아래에 독립 계산/검증 모듈을 추가한다.
서버가 권한을 확인한 ready 결과를 받아 허용 목록으로 투영한다. 이 함수 자체는 인증·동의 저장소가 아니다.

**Tech Stack:** Python, 기존 Pydantic/FastAPI 타입, pytest, Ruff, mypy. 새 의존성·외부 서비스 없음.

**Spec:** [제품 설계](../specs/2026-09-04-deep-money-meeting-design.md), 특히 3~4절의 A단계.

## Global Constraints

- 기존 Light/v2/v3 동작과 AI 없이 끝까지 사용할 수 있는 템플릿 경로를 유지한다.
- 모르는 값은 0원이 아니다. 답변 차이로 성격·의도·관계의 좋고 나쁨을 판정하지 않는다.
- 금액은 엄격한 정수이고 절댓값이 2**53-1 이하여야 한다. bool/float/string을 금액으로 변환하지 않는다.
- 실제 저장된 계획·합의는 변경하지 않는다.
- 현재 단계는 실데이터를 외부로 전송하지 않는다.

## 범위 및 작업공간

2026-09-04 사용자 요청에 따라 앞서 승인한 채팅 설계를 문서화하고 A단계부터 인라인 실행한다.
기존 격리 worktree를 사용하며 로컬 codex/deep-money-meeting은 develop a62efe9에서 시작한다.
원격 푸시·배포·유료 호출은 이 실행에 포함하지 않는다. B~D단계는 이 계획의 완료 주장에 포함하지 않는다.
단계 내 기능들이 순차적으로 의존하므로 별도 구현 에이전트를 만들지 않는다.

## 파일 및 인터페이스

| 파일 | 역할 |
| --- | --- |
| apps/backend/deep/meeting/__init__.py | 패키지 경계, 부작용 없음 |
| apps/backend/deep/meeting/models.py | 권한·패킷·비교 입력/결과·생성 응답의 내부 타입 |
| apps/backend/deep/meeting/brief.py | ready v3 결과에서 분담 관련 허용 필드만 추출 |
| apps/backend/deep/meeting/comparison.py | 같은 항목/시작월의 예산·분담안 비교 |
| apps/backend/deep/meeting/explanation.py | AI 응답 형식·쟁점/근거 참조 검사, 모델 호출 없음 |
| apps/backend/tests/meeting_factory.py | 실제 v3 엔진으로 합성 결과 구성 |
| apps/backend/tests/unit/test_meeting_brief.py | 공개/AI 동의 및 투영·산술 일관성 회귀 테스트 |
| apps/backend/tests/unit/test_meeting_comparison.py | 금액·미정·범위·월·안전 정수 비교 테스트 |
| apps/backend/tests/unit/test_meeting_explanation.py | 출력 제한·쟁점/근거 위조 차단 테스트 |

### Task 1: 안전한 분담 근거 패킷

**Consumes:** 기존 build_v3_report, ReadyResultV3, DeepError.
**Produces:** `build_brief(result: dict[str, Any], permissions: MeetingPermissions) -> MeetingBrief`.
MeetingPermissions는 financeA/financeB/aiA/aiB의 StrictBool(default false)이다.
MeetingBrief는 sourceRound, planVersion, startMonth, commonScope, sourceHasAssumptions,
agreementStatus, facts, issues, basis=submitted_intentions_not_affordability를 가진다.
Fact는 id/valueWon, Issue는 id/factIds만 가진다. 각 ID의 허용 목록은 models.py에 Literal로 둔다.

- [x] 합성 factory를 만들고 기존 엔진이 2,000,000원 예산·1,600,000원 분담을 생성하도록 한다.
- [x] 다음 행동 테스트와 권한·미정·주입 데이터 사례를 먼저 작성하고 실패를 확인한다.

```python
def test_gap_and_expectations_remain_separate():
    brief = build_brief(ready_result(), granted())
    facts = {row.id: row.valueWon for row in brief.facts}
    assert facts['contribution_gap'] == 400_000
    assert facts['expectation_a'] == 400_000
    assert facts['expectation_b'] == 400_000
```

- [x] 권한 → ready/schema/version → planning 공개 상태 → 허용 필드 투영 순서로 구현한다.
  planning의 저장된 합계/공백/초과/기대 차이가 원자료와 맞는지 검증하며 자유 문구는 읽어 복사하지 않는다.

```python
if not (permissions.aiA and permissions.aiB):
    raise DeepError('MEETING_AI_CONSENT_REQUIRED')
if not (permissions.financeA and permissions.financeB):
    raise DeepError('MEETING_FINANCE_NOT_SHARED')
```

- [x] `apps/backend`에서 `.venv/Scripts/python.exe scripts/test_local.py tests/unit/test_meeting_brief.py -q` 실행.
  가짜 결과가 아니라 실제 계산 엔진의 결과를 사용하는 테스트, 단일 필드 위조 시 실패하는 테스트를 포함한다.

### Task 2: AI 없는 제한된 월 분담안 비교

**Consumes:** `BudgetOption(commonScope, startMonth, budgetWon, aWon, bWon)`.
**Produces:** `compare_budgets(baseline: BudgetOption, proposal: BudgetOption) -> BudgetComparison`.
결과는 status, reason, baselineGapWon, proposalGapWon, proposalExcessWon, budgetChangeWon,
aChangeWon, bChangeWon, 고정 basis를 가진다. 입력이 None이면 관련 출력만 None이다.

- [x] 다음 예시와 미정·순서·범위/월 불일치·0원·overflow 사례를 먼저 작성하고 실패를 확인한다.

```python
def test_budget_and_contribution_change_does_not_claim_affordability():
    result = compare_budgets(option(2_000_000, 800_000, 800_000),
                             option(1_800_000, 1_000_000, 800_000))
    assert result.baselineGapWon == 400_000
    assert result.proposalGapWon == 0
    assert result.budgetChangeWon == -200_000
    assert result.basis == 'calculation_only_not_affordability_or_agreement'
```

- [x] 같은 scope/month만 계산하고 unknown을 전파한다. 음수 부족액 대신 excess를 따로 반환한다.

```python
def gap(budget, a, b):
    if budget is None or a is None or b is None:
        return None
    return max(0, budget - a - b)
```

- [x] `.venv/Scripts/python.exe scripts/test_local.py tests/unit/test_meeting_comparison.py -q` 실행.

### Task 3: 구조화 출력과 근거 참조 검사

**Consumes:** MeetingBrief, `ExplanationDraft(cards: list[ExplanationCard])`.
**Produces:** `validate_grounding(draft: ExplanationDraft, brief: MeetingBrief) -> ExplanationDraft`.
ExplanationCard는 issueId/factIds/explanation/question이며 추가 필드는 거부한다.
실제 모델 연결·의미적 안전성 검사는 이 함수의 완료 범위가 아니다.

- [x] 정상 카드, 알려지지 않은 근거, 다른 쟁점의 근거, 중복 쟁점/근거, 빈/과도한 문장,
  숫자 문자, 카드 수 초과, 실제 쟁점 없는 경우를 테스트하고 실패를 확인한다.

```python
def test_cross_issue_citation_is_rejected():
    draft = explanation(issue='contribution_gap', facts=['expectation_a'])
    with pytest.raises(DeepError, match='MEETING_GROUNDING_INVALID'):
        validate_grounding(draft, build_brief(ready_result(), granted()))
```

- [x] Pydantic 구조 검사와 쟁점별 factIds 부분집합 검사를 구현한다. 문자열 필드에서 Unicode 숫자 문자를
  거부하되 이를 모든 숫자/의미 오류를 방지하는 장치로 설명하지 않는다.
- [x] `.venv/Scripts/python.exe scripts/test_local.py tests/unit/test_meeting_explanation.py -q` 실행.

### Task 4: 교차 검증과 인계

- [x] `scripts/test_local.py`로 새 세 파일과 기존 test_deep_v3_analysis.py/test_deep_openapi.py를 함께 실행한다.
- [x] `.venv/Scripts/python.exe -m ruff check deep/meeting tests/meeting_factory.py tests/unit/test_meeting_*.py`.
- [x] `.venv/Scripts/python.exe -m mypy deep/meeting`와 `git diff --check`를 실행한다.
- [x] 설계의 A단계 요구사항별로 테스트를 매핑하고 diff에서 기존 API·비밀파일·의존성 변경이 없는지 확인한다.
- [x] handoff에 실제 결과와 B~D단계 미구현 경계를 적고 PROJECT_CONTEXT에서 연결한다.

## 설계 자체 검토

- 전체 제품의 B~D 요구는 제품 설계 5~7절에서 보존하되 A단계 완료와 분리했다.
- 권한은 서버가 도출해야 한다는 조건을 명시했다. 순수 함수에 bool을 넘기는 것만으로 운영 동의가 생기지 않는다.
- 파생 금액과 기대 차이를 합산하지 않으며 본인 상한을 지급 능력으로 판단하지 않는다.
- 원본 관찰 문구/자유서술은 투영하지 않고 생성 텍스트의 의미 검증은 별도 출시 게이트로 남긴다.
- 아직 API/모델 호출이 없으므로 OpenAPI와 생성 타입을 변경할 이유가 없다.
