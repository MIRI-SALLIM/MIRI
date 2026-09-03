from typing import Any

from deep.engine.cashflow import calculate_cashflow
from deep.engine.common import Evidence, month_number
from deep.engine.housing import allocated_assets
from deep.schemas import DeepInput, SharedPlan


def goal_requirement(target: int, allocated: int, months: int) -> int | None:
    if allocated >= target:
        return 0
    if months <= 0:
        return None
    return (target - allocated + months - 1) // months


def calculate_goal(a: DeepInput, b: DeepInput, plan: SharedPlan) -> dict[str, Any]:
    evidence = Evidence()
    target = plan.target
    if target is None:
        return {"status": "unavailable", "missingFields": ["plan.target"], "assumptions": [], "data": None}
    assets, complete = allocated_assets(a, b, plan, "goalAllocationWon", evidence)
    months = month_number(target.targetMonth) - month_number(plan.startMonth)
    required = goal_requirement(target.amountWon, assets, months) if complete else None
    if required is None and months <= 0:
        evidence.missing.append("plan.target.targetMonth")
    cashflow = calculate_cashflow(a, b, plan)
    surplus = cashflow["data"]["scenarioMonthlySurplusWon"]
    shortfall = max(0, required - max(0, surplus)) if required is not None and surplus is not None else None
    if surplus is None:
        evidence.missing.extend(cashflow["missingFields"])
    evidence.assumptions.extend(cashflow["assumptions"])
    evidence.assumptions.append("계획 시작월부터 목표월 직전까지 동일 금액 적립; 수익률과 미래 상여는 가정하지 않음")
    data = {"title": target.title, "targetWon": target.amountWon, "targetMonth": target.targetMonth,
            "allocatedWon": assets if complete else None, "months": months,
            "requiredMonthlySavingWon": required, "monthlySavingShortfallWon": shortfall}
    return evidence.block(data, ["requiredMonthlySavingWon", "monthlySavingShortfallWon"])
