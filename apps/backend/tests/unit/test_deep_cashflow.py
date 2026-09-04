import importlib

from deep.schemas import DeepInput, SharedPlan
from tests.deep_factory import debt, known, sample_input, sample_plan


def engine():
    return importlib.import_module("deep.engine.cashflow")


def pair(a=None, b=None, plan=None):
    return DeepInput.model_validate(a or sample_input()), DeepInput.model_validate(b or sample_input()), SharedPlan.model_validate(plan or sample_plan())


def test_documented_surplus_fixture_and_negative_surplus():
    calculate = engine().monthly_surplus
    assert calculate(6000000, 600000, 1800000, 1000000, 500000, 300000, False) == 2070000
    assert calculate(6000000, 600000, 1800000, 1000000, 500000, 300000, True) == 1800000
    assert calculate(0, 100000, 0, 0, 0, 0, True) == -100000


def test_current_actual_payment_wins_and_scenario_replaces_housing_and_settled_debt():
    a = sample_input()
    a["housingCost"] = known(700000)
    a["debts"] = [debt(monthlyPayment=known(500000), disposition="settle"),
                  debt(id="kept", monthlyPayment=known(100000))]
    plan = {**sample_plan(), "newHousingLoan": debt(monthlyPayment=known(300000))}
    data = engine().calculate_cashflow(*pair(a=a, plan=plan))["data"]
    assert data["currentMonthlySurplusWon"] == 4700000
    assert data["scenarioMonthlySurplusWon"] == 4600000
    assert data["existingDebtPaymentWon"] == 100000
    assert data["newDebtPaymentWon"] == 300000


def test_bonus_separated_and_never_double_counted_or_assigned_unknown_month():
    a = sample_input()
    a["income"]["annualNetBonus"] = known(12000000)
    args = pair(a=a)
    data = engine().calculate_cashflow(*args)["data"]
    assert data["monthlyIncomeWon"] == 6000000
    assert data["annualizedMonthlyIncomeWon"] == 7000000
    rows = engine().project_12_months(*args)
    assert all(row["bonusWon"] == 0 for row in rows)
    assert data["unallocatedAnnualBonusWon"] == 12000000
    a["income"]["bonusMonth"] = 12
    rows = engine().project_12_months(*pair(a=a))
    assert sum(r["bonusWon"] for r in rows) == 12000000
    assert next(r for r in rows if r["month"] == "2026-12")["bonusWon"] == 12000000
    a["income"]["bonusIncludedInMonthlyIncome"] = True
    data = engine().calculate_cashflow(*pair(a=a))["data"]
    assert data["annualizedMonthlyIncomeWon"] == 6000000
    assert sum(r["bonusWon"] for r in engine().project_12_months(*pair(a=a))) == 0


def test_unknown_bonus_does_not_destroy_regular_cashflow_but_unknown_income_does():
    a = sample_input()
    a["income"]["annualNetBonus"] = {"status": "unknown"}
    block = engine().calculate_cashflow(*pair(a=a))
    assert block["status"] == "partial"
    assert block["data"]["scenarioMonthlySurplusWon"] == 5000000
    assert block["data"]["annualizedMonthlyIncomeWon"] is None
    a["income"]["monthlyNetIncome"] = {"status": "withheld"}
    block = engine().calculate_cashflow(*pair(a=a))
    assert block["data"]["scenarioMonthlySurplusWon"] is None
    assert "a.income.monthlyNetIncome" in block["missingFields"]


def test_unknown_debts_and_mismatched_living_status_never_assumed_zero_or_discounted():
    a = sample_input()
    a["debtsStatus"] = "unknown"
    block = engine().calculate_cashflow(*pair(a=a))
    assert block["data"]["scenarioMonthlySurplusWon"] is None
    a["debtsStatus"] = "known"
    a["livingTogether"] = True
    block = engine().calculate_cashflow(*pair(a=a))
    assert block["data"]["scenarioMonthlySurplusWon"] is None
    assert block["data"]["currentMonthlySurplusWon"] == 6000000


def test_projection_handles_maturity_and_missing_schedule_explicitly():
    a = sample_input()
    a["debts"] = [debt(annualRate="0.12", repaymentType="bulletMaturity", monthlyPayment=known(120000))]
    rows = engine().project_12_months(*pair(a=a))
    assert rows[-1]["debtPaymentWon"] == 12120000
    assert rows[-1]["surplusWon"] == -7120000
    a["debts"] = [debt(annualRate=None, remainingMonths=None, repaymentType="unknown")]
    rows = engine().project_12_months(*pair(a=a))
    assert all(r["debtPaymentWon"] == 100000 for r in rows)
    assert all(r["assumptions"] for r in rows)


def test_unknown_scheduled_bonus_and_withheld_payment_are_not_reconstructed_as_known():
    a = sample_input()
    a["income"].update(annualNetBonus={"status": "unknown"}, bonusMonth=12)
    rows = engine().project_12_months(*pair(a=a))
    december = next(row for row in rows if row["month"] == "2026-12")
    assert december["bonusWon"] is None
    assert december["surplusWon"] is None
    a["debts"] = [debt(monthlyPayment={"status": "withheld"})]
    assert engine().calculate_cashflow(*pair(a=a))["data"]["scenarioMonthlySurplusWon"] is None


def test_half_won_rounding_keeps_displayed_budget_and_surplus_in_balance():
    assert engine().monthly_surplus(9, 0, 10, 0, 0, 0, False) == 0
    a, b = sample_input(), sample_input()
    a["income"]["monthlyNetIncome"] = known(9)
    b["income"]["monthlyNetIncome"] = known(0)
    a["variableExpenses"]["food"] = known(10)
    plan = {**sample_plan(), "monthlyHousingCost": known(0)}
    data = engine().calculate_cashflow(*pair(a=a, b=b, plan=plan))["data"]
    assert data["scenarioVariableExpensesWon"] == 9
    assert data["scenarioMonthlySurplusWon"] == data["monthlyIncomeWon"] - data["scenarioVariableExpensesWon"] == 0
