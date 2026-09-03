from decimal import Decimal
from typing import Any

from deep.config import load_rules
from deep.engine.common import Evidence, month_at, total, won
from deep.engine.debt import current_payment, debt_schedule
from deep.schemas import DeepInput, SharedPlan


def monthly_surplus(
    income: int, fixed: int, variable: int, housing: int, existing_debt: int, new_debt: int, cohabiting: bool,
) -> int:
    multiplier = Decimal(1) if cohabiting else Decimal(load_rules("deep-rules-v1")["cohabitationMultiplier"])
    return income - fixed - housing - existing_debt - new_debt - won(Decimal(variable) * multiplier)


def calculate_cashflow(a: DeepInput, b: DeepInput, plan: SharedPlan) -> dict[str, Any]:
    evidence = Evidence()
    incomes: list[int | None] = []
    fixed: list[int | None] = []
    variable: list[int | None] = []
    current_housing: list[int | None] = []
    all_debts: list[int | None] = []
    kept_debts: list[int | None] = []
    bonuses: list[int | None] = []
    untimed: list[int | None] = []
    for label, data in (("a", a), ("b", b)):
        incomes.append(evidence.amount(data.income.monthlyNetIncome, label + ".income.monthlyNetIncome"))
        fixed.extend(evidence.amount(value, f"{label}.fixedExpenses.{key}") for key, value in data.fixedExpenses.items())
        variable.extend(evidence.amount(value, f"{label}.variableExpenses.{key}") for key, value in data.variableExpenses.items())
        current_housing.append(evidence.amount(data.housingCost, label + ".housingCost"))
        if data.debtsStatus != "known":
            evidence.missing.append(label + ".debtsStatus")
            all_debts.append(None)
            kept_debts.append(None)
        else:
            for loan in data.debts:
                payment = current_payment(loan, f"{label}.debts.{loan.id}", evidence)
                all_debts.append(payment)
                if loan.disposition == "keep":
                    kept_debts.append(payment)
        if data.income.bonusIncludedInMonthlyIncome:
            bonuses.append(0)
            untimed.append(0)
        else:
            bonus = evidence.amount(data.income.annualNetBonus, label + ".income.annualNetBonus")
            bonuses.append(bonus)
            untimed.append(bonus if data.income.bonusMonth is None else 0)
    income, fixed_sum, variable_sum = total(incomes), total(fixed), total(variable)
    current_housing_sum, current_debt, existing_debt = total(current_housing), total(all_debts), total(kept_debts)
    housing = current_housing_sum if plan.housingType == "keep" else evidence.amount(plan.monthlyHousingCost, "plan.monthlyHousingCost")
    new_debt = 0 if plan.newHousingLoan is None else current_payment(plan.newHousingLoan, "plan.newHousingLoan", evidence)
    current = None
    if all(value is not None for value in (income, fixed_sum, variable_sum, current_housing_sum, current_debt)):
        current = income - fixed_sum - variable_sum - current_housing_sum - current_debt  # type: ignore[operator]
    cohabiting = a.livingTogether
    if cohabiting is None or b.livingTogether is None or cohabiting != b.livingTogether:
        evidence.missing.append("livingTogether.confirmation")
        cohabiting = None
    scenario_variable = None
    if cohabiting is not None and variable_sum is not None:
        multiplier = Decimal(1) if cohabiting else Decimal(load_rules("deep-rules-v1")["cohabitationMultiplier"])
        scenario_variable = won(Decimal(variable_sum) * multiplier)
        if not cohabiting:
            evidence.assumptions.append("합가 후 비주거 변동비에 추정 계수 0.85 적용")
    scenario = None
    if all(value is not None for value in (income, fixed_sum, scenario_variable, housing, existing_debt, new_debt)):
        scenario = income - fixed_sum - scenario_variable - housing - existing_debt - new_debt  # type: ignore[operator]
    annual_bonus = total(bonuses)
    annualized = won(Decimal(income) + Decimal(annual_bonus) / 12) if income is not None and annual_bonus is not None else None
    result = {"monthlyIncomeWon": income, "annualizedMonthlyIncomeWon": annualized,
            "annualBonusWon": annual_bonus, "unallocatedAnnualBonusWon": total(untimed), "fixedExpensesWon": fixed_sum,
            "currentVariableExpensesWon": variable_sum, "scenarioVariableExpensesWon": scenario_variable,
            "scenarioHousingCostWon": housing, "existingDebtPaymentWon": existing_debt, "newDebtPaymentWon": new_debt,
            "currentMonthlySurplusWon": current, "scenarioMonthlySurplusWon": scenario}
    return evidence.block(result, ["currentMonthlySurplusWon", "scenarioMonthlySurplusWon", "annualizedMonthlyIncomeWon"])


def project_12_months(a: DeepInput, b: DeepInput, plan: SharedPlan) -> list[dict[str, Any]]:
    cashflow = calculate_cashflow(a, b, plan)
    base = cashflow["data"]
    loans = [(f"{label}.debts.{loan.id}", loan) for label, data in (("a", a), ("b", b))
             for loan in data.debts if loan.disposition == "keep"]
    if plan.newHousingLoan:
        loans.append(("plan.newHousingLoan", plan.newHousingLoan))
    schedules = [(path, loan, debt_schedule(loan)) for path, loan in loans]
    rows = []
    cumulative: int | None = 0
    for index in range(12):
        evidence = Evidence()
        evidence.missing.extend(cashflow["missingFields"])
        evidence.assumptions.extend(cashflow["assumptions"])
        month = month_at(plan.startMonth, index)
        payments: list[int | None] = []
        if a.debtsStatus != "known" or b.debtsStatus != "known":
            payments.append(None)
        for path, loan, schedule in schedules:
            if loan.monthlyPayment.status == "withheld":
                payments.append(None)
            elif schedule is not None:
                payments.append(schedule[index]["totalWon"] if index < len(schedule) else 0)
                evidence.assumptions.append(f"{path}: 계획 시작월의 잔액·남은 기간으로 계약 조건 고정 추정")
            else:
                payments.append(current_payment(loan, path, evidence))
                evidence.assumptions.append(f"{path}: 상환 일정 미확인, 알려진 월 납입액 지속 가정; 미래 잔액은 계산하지 않음")
        debt_payment = total(payments)
        scheduled_bonuses: list[int | None] = []
        for data in (a, b):
            if not data.income.bonusIncludedInMonthlyIncome and data.income.bonusMonth == int(month[-2:]):
                scheduled_bonuses.append(data.income.annualNetBonus.value)
        bonus = total(scheduled_bonuses)
        surplus = None
        if base["scenarioMonthlySurplusWon"] is not None and debt_payment is not None and bonus is not None:
            surplus = base["scenarioMonthlySurplusWon"] + base["existingDebtPaymentWon"] + base["newDebtPaymentWon"] - debt_payment + bonus
        cumulative = cumulative + surplus if cumulative is not None and surplus is not None else None
        rows.append({"month": month, "bonusWon": bonus, "debtPaymentWon": debt_payment,
                     "surplusWon": surplus, "cumulativeSurplusWon": cumulative,
                     "missingFields": list(dict.fromkeys(evidence.missing)),
                     "assumptions": list(dict.fromkeys(evidence.assumptions))})
    return rows
