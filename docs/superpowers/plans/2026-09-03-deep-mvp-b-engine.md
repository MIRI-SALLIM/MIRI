# Deep MVP B — Input and Calculation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 딥 전용 10문항·재무 입력을 정의하고 결정적인 계산·대화 주제 선정을 완성한다.

**Architecture:** Pydantic 경계에서 입력을 검증하고 HTTP/DB에 의존하지 않는 deep/engine 함수에 전달한다. 원본 자기보고, 추정, 비공개·누락을 구분하며 결과가 부족한 영역만 unavailable로 반환한다.

**Tech Stack:** Python 3.11, Pydantic2, Decimal, pytest. 외부 계산/AI 서비스 없음.

**Spec:** `../specs/2026-09-03-mirisallim-deep-mode-design-draft.md`, [통합 실행 계획](2026-09-03-deep-mvp-implementation.md).

**실행 현황(2026-09-03):** B1~B4 라이브러리와 회귀 테스트 구현. API 연결·공동 공개는 C에서 수행한다. 초안의 null 허용, 구조적 입력 상한, 반올림·계획 기준시점의 구체화는 [중간 인계](../../handoffs/2026-09-03-deep-mvp-ab-progress.md)에 기록했다. 커밋은 아직 수행하지 않았다.

## Global Constraints

- 잔액=원, 월 흐름=원/월, 연 흐름=원/년, 비율=소수로 분리한다.
- source와 계산 버전은 서버가 지정한다.
- 딥 입력에 guesses/partnerPredictions를 추가하지 않는다.
- 저소득·큰 부채·음수 잉여자금 자체는 422 사유가 아니다.
- 정책 매칭·AI 해설·고정 16개 유형 해설·숫자형 Say-Do 판정은 이번 출시에서 제외한다.
- Light의 설정 파일·기존 계산식을 변경하지 않는다.

## B1. 버전 있는 10문항과 정책 설정

**Files:** Create `apps/backend/deep/{__init__,config}.py`, `config/deep_questions.v1.json`, `config/deep_questions.v2.json`, `config/deep_rules.v1.json`, `tests/unit/test_deep_questions.py`.

**Interfaces:** `load_questions(version: str) -> dict`, `load_rules(version: str) -> dict`, `normalize_answer(answer: int, reverse: bool) -> int`.

- [ ] 실패 테스트:

```python
from collections import Counter
from deep.config import load_questions, normalize_answer

def test_v2_has_ten_labeled_questions_and_consistent_investment_direction():
    questions = load_questions('deep-v2')['questions']
    by_id = {q['id']: q for q in questions}
    assert set(by_id) == {f'D{i}' for i in range(1, 11)}
    assert Counter(q['area'] for q in questions) == {
        'savings': 2, 'spending': 2, 'investment': 2, 'debt': 2, 'jointManagement': 2,
    }
    assert all(q['left'] and q['right'] for q in questions)
    assert normalize_answer(5, by_id['D5']['reverse']) == 5
    assert normalize_answer(5, by_id['D9']['reverse']) == 5
```

- [ ] `python scripts/test_local.py tests/unit/test_deep_questions.py -q` 실패 확인.
- [ ] v1은 현재 repo 8문항의 내용을 보존한 조회 전용 스냅샷으로 만든다. v2는 같은 ID의 기존 문구와 좌우 라벨을 보존하고 D5 reverse=false, D9·D10은 아래 값을 추가한다. v1 세션 생성은 지원하지 않는다.

```json
[
  {"id":"D9","area":"investment","reverse":false,"text":"여윳돈이 생기면 투자처를 알아본다 ↔ 일단 예적금에 넣어둔다","left":"여유자금의 투자처를 알아봄","right":"일단 예적금에 보관"},
  {"id":"D10","area":"debt","reverse":false,"text":"큰 지출 전에는 대출 한도부터 확인한다 ↔ 가진 돈 안에서 해결한다","left":"큰 지출은 대출 활용도 고려","right":"가진 돈 안에서 해결"}
]
```

  D10 text는 `큰 지출 전에는 대출 한도부터 확인한다 ↔ 가진 돈 안에서 해결한다`. JSON의 버전·ID 중복·5영역·좌우 라벨·range1..5를 시작 시 검증한다. 의미를 임의로 추론하는 text 분할 fallback은 사용하지 않는다.

  rules 필드: `version='deep-rules-v1'`, `cohabitationMultiplier='0.85'`, `areaOrder=['jointManagement','savings','spending','debt','investment']`, `topicLimit=3`, `numericSayDoEnabled=false`, `policyMatchingEnabled=false`, `llmEnabled=false`. 문항 ID와 답변 저장 순서를 분리한다.
- [ ] 1/5 역채점, 미지원 version404 변환, 라벨 누락·ID 중복 실패 테스트 통과.
- [ ] `feat(deep): add versioned ten-question configuration` 커밋.

## B2. 재무 입력·공동 계획·결과 DTO

**Files:** Create `apps/backend/deep/schemas.py`, `validation.py`, `tests/unit/test_deep_models.py`, `tests/deep_factory.py`.

**Interfaces:** Pydantic `Amount`, `IncomeInput`, `DebtInput`, `AssetInput`, `DeepInput`, `SharedPlan`, `SaveDeepInputRequest`, `SubmitDeepInputRequest`, `AnalysisResult`; `validate_submission(input: DeepInput) -> list[dict]`.

모든 입력 모델은 `extra='forbid'`. 저장 값과 API 원본 이름을 아래 camelCase로 통일한다.

| 모델 | 필드와 타입/조건 |
|---|---|
| Amount | value:StrictInt>=0 또는None, status:known/unknown/withheld, precision:exact/estimate. known만 value를 가지고 나머지는None |
| IncomeInput | monthlyNetIncome:Amount, annualNetBonus:Amount, bonusIncludedInMonthlyIncome:bool, bonusMonth:1..12 또는None, referenceMonth:YYYY-MM |
| DebtInput | id:str, type:str, balance:Amount, monthlyPayment:Amount, annualRate:Decimal>=0 또는None, remainingMonths:positive int 또는None, repaymentType:equalPayment/equalPrincipal/bulletMaturity/unknown, disposition:keep/settle |
| AssetInput | id:str, kind:cashSavings/rentalDeposit/investments/subscription/realEstate/other, balance:Amount, availableOn:date 또는None, housingAllocationWon:StrictInt>=0, goalAllocationWon:StrictInt>=0 |
| DeepInput | income:IncomeInput, fixedExpenses:dict[str,Amount], variableExpenses:dict[str,Amount], housingCost:Amount, debts:list[DebtInput] max30, debtsStatus:known/unknown/withheld, assets:list[AssetInput], assetsStatus:known/unknown/withheld, livingTogether:bool, values:dict[D1..D10,int1..5 또는None], skippedQuestionIds:list[str], importantAreas:list[str] max2 unique, contextNotes:dict[str,str] value max300 |
| SharedPlan | startMonth:YYYY-MM, housingType:keep/rent/jeonse/buy, monthlyHousingCost:Amount, housingPriceWon:Amount, oneOffCostsWon:Amount, newHousingLoan:DebtInput 또는None, target:GoalInput 또는None |
| GoalInput | title:str max50, amountWon:StrictInt>0, targetMonth:YYYY-MM |
| SaveDeepInputRequest | expectedRevision:int>=0, input:DeepInput |
| SubmitDeepInputRequest | expectedRevision:int>=0, planVersion:int>=1, consentVersion:deep-sharing-v1, shareFinance:bool, shareValues:bool |

고정 카테고리는 한국어 UI 문구와 별개의 안정적인 키로 표현한다: fixed는 communication/insurance/subscriptions/familySupport/other, variable은 food/transport/shopping/leisure/other. 각자가 실제 부담하는 금액만 입력하며 대출 상환·저축 이체·주거비를 이 dict에 다시 넣지 않는다.

초안에서는 누락 field를 unknown으로 초기화한다. 숫자0으로 초기화하지 않는다. `debts=[] + debtsStatus=known`은 부채 없음의 명시적 확인이고 unknown과 다르다. submit에서는 values의 모든 ID에 답 또는 skipped가 있어야 하며, 중요 주제는 선택 사항이다. 금액을 모르는 상태의 제출은 허용하지만 해당 계산은 unavailable이다. shareFinance=false면 합산 재무도 생성하지 않는다.

테스트의 공통 입력은 다음 함수로 생성한다. 이 테스트 데이터의0은 명시적으로 확인된0이며 제품 초안 기본값과 다르다.

```python
# tests/deep_factory.py
def known(value):
    return {'value':value,'status':'known','precision':'exact'}

def sample_input():
    return {
        'income':{'monthlyNetIncome':known(3000000),'annualNetBonus':known(0),
                  'bonusIncludedInMonthlyIncome':False,'bonusMonth':None,'referenceMonth':'2026-09'},
        'fixedExpenses':{k:known(0) for k in ['communication','insurance','subscriptions','familySupport','other']},
        'variableExpenses':{k:known(0) for k in ['food','transport','shopping','leisure','other']},
        'housingCost':known(0),'debts':[],'debtsStatus':'known',
        'assets':[],'assetsStatus':'known','livingTogether':False,
        'values':{f'D{i}':3 for i in range(1,11)},'skippedQuestionIds':[],
        'importantAreas':[],'contextNotes':{},
    }

def sample_plan():
    return {'startMonth':'2026-10','housingType':'rent',
            'monthlyHousingCost':known(1000000),'housingPriceWon':known(10000000),
            'oneOffCostsWon':known(0),'newHousingLoan':None,'target':None}
```

- [ ] 첫 실패 테스트:

```python
import pytest
from pydantic import ValidationError
from deep.schemas import Amount

def test_zero_and_unknown_are_different():
    assert Amount(value=0, status='known', precision='exact').value == 0
    assert Amount(value=None, status='unknown', precision='exact').value is None
    with pytest.raises(ValidationError):
        Amount(value=0, status='unknown', precision='exact')
    with pytest.raises(ValidationError):
        Amount(value=True, status='known', precision='exact')
```

- [ ] 실패 확인 후 Amount의 핵심 구현:

```python
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

class Amount(BaseModel):
    model_config = ConfigDict(extra='forbid')
    value: Annotated[StrictInt, Field(ge=0)] | None
    status: Literal['known', 'unknown', 'withheld']
    precision: Literal['exact', 'estimate']

    @model_validator(mode='after')
    def consistent_state(self):
        if (self.status == 'known') != (self.value is not None):
            raise ValueError('AMOUNT_STATUS_MISMATCH')
        return self
```

  DeepInput 검증은 id 중복, 알려지지 않은 category/question, guesses·source 주입, negative input, NaN/Infinity rate, 기간0을 거부한다. 각 asset의 housingAllocationWon+goalAllocationWon은 알려진 balance를 넘지 못한다. 공동자산은 두 사람이 자기 지분만 입력한다. 순자산·잉여자금은 계산 결과이므로 음수 허용 타입을 따로 쓴다.

  `AnalysisResult`는 cashflow/housing/goal/values/topics 하위 블록과 warnings를 가진다. 블록마다 status=available/partial/unavailable, missingFields:list[str], assumptions:list[str]를 정의한다. unavailable에는 value를0으로 채우지 않는다.
- [ ] 알려진0·unknown·withheld·중복id·31번째 대출·1/5 허용·0/6 거부·예측 필드 거부 테스트 통과.
- [ ] `feat(deep): define precise financial input contracts` 커밋.

## B3. 현금흐름·주거·대출·12개월·목표 계산

**Files:** Create `apps/backend/deep/engine/{__init__,cashflow,debt,housing,goals}.py`, `tests/unit/test_deep_{cashflow,debt,housing,goals}.py`.

**Interfaces:**

- `monthly_surplus(income:int,fixed:int,variable:int,housing:int,existing_debt:int,new_debt:int,cohabiting:bool) -> int`.
- `payment_schedule(principal:int,annual_rate:Decimal,months:int,repayment_type:str) -> list[dict]`: month, principalWon, interestWon, totalWon. 내부는 Decimal, 출력 금액은 원 단위 정수.
- `calculate_cashflow(a:DeepInput,b:DeepInput,plan:SharedPlan) -> dict`.
- `calculate_housing(a:DeepInput,b:DeepInput,plan:SharedPlan) -> dict`.
- `project_12_months(a:DeepInput,b:DeepInput,plan:SharedPlan) -> list[dict]`.
- `goal_requirement(target:int,allocated:int,months:int) -> int | None`, `calculate_goal(a,b,plan) -> dict`.

- [ ] 실패 테스트:

```python
from decimal import Decimal
from deep.engine.cashflow import monthly_surplus
from deep.engine.debt import payment_schedule
from deep.engine.goals import goal_requirement

def test_documented_surplus_fixture():
    assert monthly_surplus(6000000,600000,1800000,1000000,500000,300000,False) == 2070000
    assert monthly_surplus(6000000,600000,1800000,1000000,500000,300000,True) == 1800000

def test_bullet_debt_includes_maturity_principal():
    rows = payment_schedule(12000000, Decimal('0.12'), 12, 'bulletMaturity')
    assert rows[0]['totalWon'] == 120000
    assert rows[-1]['totalWon'] == 12120000

def test_goal_requirement():
    assert goal_requirement(10000000,4000000,12) == 500000
    assert goal_requirement(10000000,4000000,0) is None
```

- [ ] `python scripts/test_local.py tests/unit/test_deep_cashflow.py tests/unit/test_deep_debt.py tests/unit/test_deep_goals.py -q` 실패 확인.
- [ ] 최소 산식 구현:

```python
from decimal import Decimal, ROUND_HALF_UP

def monthly_surplus(income,fixed,variable,housing,existing_debt,new_debt,cohabiting):
    multiplier = Decimal('1') if cohabiting else Decimal('0.85')
    value = Decimal(income-fixed-housing-existing_debt-new_debt) - Decimal(variable)*multiplier
    return int(value.quantize(Decimal('1'), rounding=ROUND_HALF_UP))

def goal_requirement(target, allocated, months):
    if allocated >= target:
        return 0
    if months <= 0:
        return None
    return (target-allocated+months-1)//months
```

  입력 category 합계는 known 값만으로 완전 계산할 수 있을 때 사용한다. unknown·withheld가 있으면 해당 계산을 건너뛰고 경로를 missingFields에 넣는다. 이미 합가 여부가 두 사람 사이에서 다르면 확인 필요 상태로 만들며 임의 계수를 선택하지 않는다.

  정기 월 소득과 연 상여를 포함한 annualizedMonthlyIncome을 별도로 표시한다. 포함 여부가 true면 상여를 다시 더하지 않는다. 지급월을 모르면 12개월 차트는 정기 소득만 그리며 보너스는 연간 별도 항목으로 표시한다. 미래 금리·투자수익률은 가정하지 않는다.

  대출 schedule: r=annualRate/12, 원리금균등은 r=0이면P/n, 아니면P*r/(1-(1+r)^-n). 원금균등은 매회P/n+해당 회차 잔액*r. 만기일시는 매회 이자, 마지막 회차에P 추가. 마지막 회차 원금 잔액을 보정하고 Decimal 정밀도 계산 후 원으로 출력한다.

  current cashflow는 monthlyPayment가 known이면 그 값을 우선한다. schedule을 추정할 때는 balance/rate/months/repaymentType 모두 필요하다. 부족하면 상환 잔액 예측은 unavailable이며 알려진 월 납입액의 단순 지속 가정만 명시한다. 실제 계약 상환방식을 대출 종류만으로 결정하지 않는다.

  housingType=keep이면 현재 각자의 housingCost와 유지 대출을 사용한다. rent/jeonse/buy이면 새 monthlyHousingCost와 newHousingLoan을 사용하며 기존 주거비를 대체한다. disposition=settle 대출은 월 상환에서 제외하고 초기 조달표에서 잔액을 차감한다. 주거 운영비에는 대출 상환을 넣지 않는다.

  초기 자금표: 필요액=주거가격/보증금+일회성비용, 조달액=시작월까지 사용 가능한 각자의 housingAllocationWon−settle대출 잔액+신규대출금. 월 현금흐름과 초기 자금을 섞지 않는다. availableOn이 없거나 늦으면 확정 조달액으로 포함하지 않고 필요한 확인으로 표시한다.

  목표는 goalAllocationWon 합계와 남은 달 수로 필요 적립액을 구한다. 미래 계획은 plan.startMonth부터, 이미 지난 startMonth는 제출 시 경고하고 사용자가 날짜를 수정하도록 한다. 목표월이 지난 상태는 unavailable, 이미 목표금액 확보는0, 여력 부족은 부족액을 그대로 표시한다.
- [ ] 단위·상여 중복·housing/double debt·0금리·0소득·음수 순자산·목표지난날·만기원금·보증금 반환 지연·자산 중복 배정 테스트 통과.
- [ ] `feat(deep): calculate household cashflow and scenarios` 커밋.

## B4. 영역 차이·우선순위·분석 조합

**Files:** Create `apps/backend/deep/engine/values.py`, `topics.py`, `analysis.py`, `tests/unit/test_deep_values.py`, `test_deep_analysis.py`.

**Interfaces:**

- `value_gaps(a:dict[str,int|None],b:dict[str,int|None],questions:list[dict]) -> dict[str,dict]`: 각 영역의 gap, status, comparedQuestionIds.
- `select_topics(gaps:dict,important_a:list[str],important_b:list[str],limit:int=3) -> list[str]`.
- `analyze_deep(a:DeepInput,b:DeepInput,plan:SharedPlan) -> AnalysisResult`: B3 블록+가치관+최대3주제. 공개 권한 검사는 C3에서 호출 전에 한다.

- [ ] 실패 테스트:

```python
from deep.config import load_questions
from deep.engine.values import value_gaps
from deep.engine.topics import select_topics

def test_equal_answers_do_not_create_conflict_topics():
    answers = {f'D{i}': 3 for i in range(1,11)}
    gaps = value_gaps(answers,answers,load_questions('deep-v2')['questions'])
    assert select_topics(gaps,[],[]) == []

def test_tie_uses_explicit_importance_then_fixed_order():
    gaps = {k:{'gap':0.5,'status':'complete'} for k in ['savings','spending','investment','debt','jointManagement']}
    assert select_topics(gaps,['debt'],['debt']) == ['debt','jointManagement','savings']
```

- [ ] 실패 확인 후 core 정렬을 구현한다.

```python
ORDER = ['jointManagement','savings','spending','debt','investment']

def select_topics(gaps, important_a, important_b, limit=3):
    eligible = [area for area in ORDER
                if gaps[area]['status']=='complete' and gaps[area]['gap']>0]
    return sorted(eligible,key=lambda area:(
        -gaps[area]['gap'],
        -(int(area in important_a)+int(area in important_b)), ORDER.index(area),
    ))[:limit]
```

  value_gaps는 양측 답이 있는 각 질문 abs(a-b)/4의 영역 평균을 구한다. 2개 complete,1개 partial,0개 unavailable이며 unavailable gap은None. 역채점이 절댓값 차이를 바꾸지 않는 것을 테스트한다. D4를 소비 결함으로 해석하지 않는다.

  analyze_deep는 각 하위 블록의 결측을 분리하여 처리한다. 금융0분모 비율은None+이유, 총자산−총부채는 값이 모두 있을 때만 계산한다. 결과에는 overallCompatibilityScore·numericSayDo·rank 필드를 정의하지 않는다. 모든 계산 결과에 self-reported/estimated 근거와 고정된 ruleVersion을 기록한다.
- [ ] 질문 순서 변경, 한 문항 skipped, 동률, 중요 주제0/1/2개, 차이 있는 영역1개만인 경우, 반대 방향 대칭성, 동일 입력 재현성 테스트 통과.
- [ ] `feat(deep): select grounded conversation topics` 커밋.

**B 완료 gate:** A의 실서비스 로그인 설정 없이도 config·모델·계산 테스트가 모두 통과해야 한다. 수치 검증은 외부 통계를 주장하는 것이 아니라 명시된 입력·산식의 일관성을 확인하는 것이다.
