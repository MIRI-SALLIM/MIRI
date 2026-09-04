from typing import Any

from deep.engine.common import Evidence, total
from deep.v3_models import DeepInputV3, SharedPlanV3
from deep.v3_safety import safe_block


def issue(code: str, category: str, observation: str, question: str, amount: int | None = None) -> dict[str, Any]:
    return {"code": code, "category": category, "observation": observation, "question": question, "amountWon": amount}


def analyze_planning(a: DeepInputV3, b: DeepInputV3, plan: SharedPlanV3) -> dict[str, Any]:
    evidence = Evidence()
    budget = total([evidence.amount(value, f"commonExpenses.{key}") for key, value in plan.commonExpenses.items()]) if plan.commonExpensesStatus == "known" else None
    if budget is None:
        evidence.missing.append("commonExpenses")
    own = {role: evidence.amount(data.contribution.ownMonthly, f"{role}.ownMonthly") for role, data in (("A", a), ("B", b))}
    offered = total(list(own.values()))
    gap = None if budget is None or offered is None else max(0, budget - offered)
    excess = None if budget is None or offered is None else max(0, offered - budget)
    issues = []
    if gap:
        issues.append(issue("CONTRIBUTION_GAP", "fundingGap", f"입력 당시 공동비 {budget:,}원에 제시한 분담액은 합계 {offered:,}원입니다. {gap:,}원의 분담이 비어 있습니다.", "각자의 분담액과 공동비 예산 중 무엇을 조정할까요?", gap))
    if gap is None:
        issues.append(issue("CONTRIBUTION_UNKNOWN", "uncertain", "공동비 범위나 분담액이 미정이라 분담 공백을 계산할 수 없습니다.", "공동비에 포함할 항목과 각자 제시할 금액을 정할까요?"))
    differences = []
    for role, partner, data in (("A", "B", a), ("B", "A", b)):
        expected, actual = data.contribution.expectedPartnerMonthly.value, own[partner]
        if expected is not None and actual is not None:
            difference = expected - actual
            differences.append({"expectingRole": role, "contributingRole": partner, "expectedWon": expected, "offeredWon": actual, "differenceWon": difference})
            if difference:
                issues.append(issue("EXPECTATION_DIFFERENCE", "difference", f"입력 당시 {role}가 기대한 {partner}의 분담액과 {partner}의 제안은 {abs(difference):,}원 다릅니다.", "같은 공동비 범위를 생각했나요? 금액과 포함 항목을 확인해 주세요.", abs(difference)))
        for constraint in data.constraints:
            if constraint.kind == "housingCost" and constraint.scope == "household":
                limit, actual_cost = constraint.amount.value, plan.monthlyHousingCost.value
                if plan.housingType == "keep":
                    actual_cost = total([a.housingCost.value, b.housingCost.value])
                if limit is not None and actual_cost is not None and actual_cost > limit:
                    excess_cost = actual_cost - limit
                    issues.append(issue("CONDITION_EXCEEDED", "condition", f"공동 주거비가 {role}의 {'필수 조건' if constraint.strength == 'required' else '선호 기준'}보다 {excess_cost:,}원 높습니다.", "주거 계획과 기준 중 조정 가능한 것은 무엇인가요?", excess_cost))
            elif constraint.kind == "borrowing" and constraint.allowBorrowing is False:
                has_borrowing = any(source.kind == "newBorrowing" for source in data.funding.sources)
                if constraint.scope == "household":
                    has_borrowing = bool(plan.newHousingLoan) or any(source.kind == "newBorrowing" for person in (a, b) for source in person.funding.sources)
                if has_borrowing:
                    issues.append(issue("BORROWING_CONDITION", "condition", f"입력한 차입 계획과 {role}의 대출 사용 조건이 다릅니다.", "차입 계획과 조건 중 어느 쪽을 다시 검토할까요?"))
            else:
                issues.append(issue("CONDITION_NEEDS_DISCUSSION", "uncertain", f"{role}가 추가로 확인할 생활 조건을 입력했습니다.", "적용 범위와 조정 가능한 조건을 함께 확인해 주세요."))
    if excess:
        issues.append(issue("EXCESS_CONTRIBUTIONS", "uncertain", f"입력한 분담 합계가 공동비보다 {excess:,}원 많습니다.", "남는 분담금을 어디에 사용할까요?", excess))
    evidence.assumptions.append("분담금은 내부 이체이며 생활비에서 다시 차감하지 않습니다. 제안 금액은 지급 능력이나 상호 합의가 아닙니다.")
    return safe_block(evidence.block({"basis": "submitted_intentions_not_agreement", "commonBudgetWon": budget,
                           "startMonth": plan.startMonth,
                           "commonScope": sorted(plan.commonExpenses), "ownContributionsWon": own,
                           "offeredTotalWon": offered, "contributionGapWon": gap, "excessContributionsWon": excess,
                           "expectationDifferences": differences, "issues": issues}, ["contributionGapWon"]))
