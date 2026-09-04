from decimal import Decimal
from typing import Any

from pydantic import Field, ValidationError

from deep.engine.cashflow import calculate_cashflow
from deep.engine.common import month_number, month_start
from deep.engine.funding import calculate_funding
from deep.engine.goals import goal_requirement
from deep.funding_models import (
    FundingDebt,
    FundingPreviewRequest,
    FundingSettlement,
    FundingSource,
)
from deep.schemas import Amount, DeepInput, SharedPlan
from deep.v3_models import DeepInputV3, SharedPlanV3
from deep.v3_safety import safe_block


class JointFundingRequest(FundingPreviewRequest):
    sources: list[FundingSource] = Field(default_factory=list, max_length=201)
    debts: list[FundingDebt] = Field(default_factory=list, max_length=60)
    settlements: list[FundingSettlement] = Field(default_factory=list, max_length=120)


def unavailable(reason: str) -> dict[str, Any]:
    return {"status": "unavailable", "reason": reason, "data": None, "missingFields": [], "assumptions": []}


def joint_funding(a: DeepInputV3, b: DeepInputV3, plan: SharedPlanV3) -> dict[str, Any]:
    if not plan.fundingDeadlines:
        return unavailable("housing_payment_schedule_missing")
    sources: list[dict[str, Any]] = []
    debts: list[dict[str, Any]] = []
    settlements: list[dict[str, Any]] = []
    unknown_cost = (plan.housingType != "keep" and plan.housingPriceWon.value is None) or plan.oneOffCostsWon.value is None
    unknown_sources = any(person.funding.sourcesStatus != "known" for person in (a, b))
    unknown_obligations = any(person.debtsStatus != "known" or person.funding.settlementsStatus != "known" for person in (a, b))
    for role, person in (("A", a), ("B", b)):
        for source in person.funding.sources:
            sources.append({**source.model_dump(mode="json"), "id": f"{role}_{source.id}"})
        debts.extend({"id": f"{role}_{loan.id}", "balance": loan.balance.model_dump()} for loan in person.debts)
        for event in person.funding.settlements:
            settlements.append({**event.model_dump(mode="json"), "id": f"{role}_{event.id}", "debtId": f"{role}_{event.debtId}",
                                "parts": [{"sourceId": f"{role}_{part.sourceId}", "amountWon": part.amountWon} for part in event.parts]})
    if plan.newHousingLoan:
        sources.append({"id": "shared_new_loan", "kind": "newBorrowing", "grossAmount": plan.newHousingLoan.balance.model_dump(),
                        "availableOn": plan.newLoanAvailableOn, "certainty": plan.newLoanCertainty,
                        "housingAllocationWon": plan.newHousingLoan.balance.value or 0})
    try:
        request = JointFundingRequest.model_validate({"asOf": plan.fundingAsOf, "sourcesStatus": "known", "debtsStatus": "known", "settlementsStatus": "known",
                                      "sources": sources, "debts": debts, "settlements": settlements, "deadlines": plan.fundingDeadlines})
        preview = calculate_funding(request).model_dump(mode="json")
    except ValidationError:
        return unavailable("funding_inputs_need_confirmation")
    # Unknown collections may coexist with the other person's known records.
    # The internal engine request contains only those known records; restore coverage explicitly.
    incomplete = bool(preview["missingFields"]) or unknown_sources or unknown_obligations or unknown_cost
    if unknown_obligations:
        for row in preview["timeline"]:
            for key in ("settlementDueWon", "availableForHousingWon", "fundingGapWon", "includingExpectedGapWon"):
                row[key] = None
    if unknown_cost:
        for row in preview["timeline"]:
            for key in ("requiredHousingWon", "fundingGapWon", "includingExpectedGapWon"):
                row[key] = None
    issues = [{key: value for key, value in entry.items() if key != "sourceId"} for entry in preview["issues"]
              if not ((unknown_obligations or unknown_cost) and entry["code"] == "FUNDING_GAP")]
    if incomplete and not any(item["code"] == "INCOMPLETE_FUNDING" for item in issues):
        issues.append({"code": "INCOMPLETE_FUNDING", "message": "일부 재원·상환 정보가 미확정입니다.", "question": "각자의 입력에서 확인 가능한 내용을 보완해 주세요."})
    return {"status": "unavailable" if not preview["timeline"] else "partial" if incomplete else "available",
            "data": {"timeline": preview["timeline"], "fundingBasis": preview["fundingBasis"], "issues": issues},
            "missingFields": ["financialInputs"] if incomplete else [],
            "assumptions": [text for text in preview["assumptions"] if "개인 미리보기" not in text]}


def _base_input(person: DeepInputV3) -> DeepInput:
    return DeepInput.model_validate({key: value for key, value in person.model_dump(mode="json").items() if key in DeepInput.model_fields})


def _cashflow_input(person: DeepInputV3, plan: SharedPlanV3) -> DeepInput:
    base = _base_input(person)
    for debt in base.debts:
        events = [event for event in person.funding.settlements if event.debtId == debt.id]
        if any(event.dueOn is None or event.amount.value is None for event in events):
            debt.monthlyPayment = Amount()
            debt.repaymentType = "unknown"
            continue
        early = [event for event in events if event.dueOn is not None and event.dueOn <= month_start(plan.startMonth)]
        paid = sum(event.amount.value or 0 for event in early)
        if paid and debt.balance.value is not None and paid == debt.balance.value:
            debt.disposition = "settle"
        elif paid:
            debt.monthlyPayment = person.afterSettlementMonthlyPayments.get(debt.id, Amount())
            debt.repaymentType = "unknown"
            debt.annualRate = None
            debt.remainingMonths = None
    return base


def v3_cashflow(a: DeepInputV3, b: DeepInputV3, plan: SharedPlanV3) -> dict[str, Any]:
    base_plan = SharedPlan.model_validate({key: value for key, value in plan.model_dump(mode="json").items() if key in SharedPlan.model_fields})
    result = calculate_cashflow(_cashflow_input(a, plan), _cashflow_input(b, plan), base_plan, variable_multiplier=Decimal(1))
    current = calculate_cashflow(_base_input(a), _base_input(b), base_plan, variable_multiplier=Decimal(1))
    result["data"]["currentMonthlySurplusWon"] = current["data"]["currentMonthlySurplusWon"]
    result["missingFields"] = list(dict.fromkeys(result["missingFields"] + current["missingFields"]))
    if result["missingFields"]:
        result["status"] = "partial"
    uncertain = any(person.funding.settlementsStatus != "known" or any(source.kind == "newBorrowing" for source in person.funding.sources) for person in (a, b))
    if uncertain:
        result["data"]["scenarioMonthlySurplusWon"] = None
        result["status"] = "partial"
        result["missingFields"].append("plannedDebtPayments")
    result["data"]["basis"] = "current_expenses_with_planned_housing_no_automatic_savings"
    result["assumptions"].extend(["비주거 지출은 현재 입력 합계를 유지합니다. 공동비 분담금·개인비 최저액을 추가 지출로 차감하지 않습니다.",
                                   "공동비 목표의 상세 개인/공동 지출 재분류는 반영하지 않은 참고 예산입니다.",
                                   "시작일까지 계획된 상환의 이행을 가정합니다. 초기자금 부족이 해결됐다는 뜻이 아닙니다.",
                                   "미래 월별 상환 변화와 12개월 누적액은 이 참고 예산으로 확정하지 않습니다."])
    return safe_block(result)


def v3_goal(a: DeepInputV3, b: DeepInputV3, plan: SharedPlanV3, cashflow: dict[str, Any]) -> dict[str, Any]:
    if plan.target is None:
        return unavailable("no_target")
    allocated = 0
    incomplete = False
    for person in (a, b):
        if person.funding.sourcesStatus != "known" or person.funding.settlementsStatus != "known" or person.debtsStatus != "known":
            incomplete = True
        if any(event.amount.value is None or event.dueOn is None for event in person.funding.settlements):
            incomplete = True
        for source in person.funding.sources:
            if not source.goalAllocationWon:
                continue
            if (source.grossAmount.value is None or source.certainty not in {"available", "confirmed"} or source.availableOn is None
                    or source.availableOn > month_start(plan.startMonth)
                    or (source.certainty == "confirmed" and source.availableOn < plan.fundingAsOf)):
                incomplete = True
            else:
                allocated += source.goalAllocationWon
    months = month_number(plan.target.targetMonth) - month_number(plan.startMonth)
    required = None if incomplete else goal_requirement(plan.target.amountWon, allocated, months)
    surplus = cashflow["data"]["scenarioMonthlySurplusWon"] if cashflow.get("data") else None
    gap = None if required is None or surplus is None else max(0, required - max(0, surplus))
    return safe_block({"status": "partial" if gap is None else "available", "missingFields": ["goalFundingOrSchedule"] if gap is None else [],
            "data": {"targetWon": plan.target.amountWon, "targetMonth": plan.target.targetMonth, "allocatedWon": None if incomplete else allocated,
                     "requiredMonthlySavingWon": required, "monthlySavingShortfallWon": gap},
            "assumptions": ["시작월부터 목표월 직전까지 같은 금액을 적립하는 참고 계산입니다. 미래 수익률·상여를 가정하지 않습니다.",
                            "목표 적립 여력과 초기 주거자금 문제는 별개입니다."]})
