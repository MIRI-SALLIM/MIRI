from typing import Any

from deep.config import load_questions
from deep.engine.cashflow import calculate_cashflow, project_12_months
from deep.engine.common import Evidence, total
from deep.engine.goals import calculate_goal
from deep.engine.housing import calculate_housing
from deep.engine.topics import select_topics
from deep.engine.values import value_gaps
from deep.schemas import AnalysisResult, DeepInput, SharedPlan


def analyze_finances(a: DeepInput, b: DeepInput, plan: SharedPlan) -> dict[str, Any]:
    cashflow = calculate_cashflow(a, b, plan)
    cashflow["data"]["projection"] = project_12_months(a, b, plan)
    evidence = Evidence()
    assets: list[int | None] = []
    balances: list[int | None] = []
    for label, data in (("a", a), ("b", b)):
        if data.assetsStatus != "known":
            assets.append(None)
            evidence.missing.append(label + ".assetsStatus")
        else:
            assets.extend(evidence.amount(asset.balance, f"{label}.assets.{asset.id}.balance") for asset in data.assets)
        if data.debtsStatus != "known":
            balances.append(None)
            evidence.missing.append(label + ".debtsStatus")
        else:
            balances.extend(evidence.amount(debt.balance, f"{label}.debts.{debt.id}.balance") for debt in data.debts)
    asset_sum, balance_sum = total(assets), total(balances)
    net_worth = asset_sum - balance_sum if asset_sum is not None and balance_sum is not None else None
    cashflow["data"]["netWorthWon"] = net_worth
    income = cashflow["data"]["monthlyIncomeWon"]
    payment = total([cashflow["data"]["existingDebtPaymentWon"], cashflow["data"]["newDebtPaymentWon"]])
    cashflow["data"]["repaymentToNetIncomeRatio"] = payment / income if income is not None and income > 0 and payment is not None else None
    cashflow["missingFields"] = list(dict.fromkeys(cashflow["missingFields"] + evidence.missing))
    cashflow["assumptions"] = list(dict.fromkeys(cashflow["assumptions"] + evidence.assumptions))
    if evidence.missing and cashflow["status"] == "available":
        cashflow["status"] = "partial"
    warnings: list[dict[str, str]] = []
    if income == 0:
        warnings.append({"code": "ZERO_INCOME_RATIO_UNAVAILABLE", "field": "cashflow.repaymentToNetIncomeRatio"})
    return {"cashflow": cashflow, "housing": calculate_housing(a, b, plan), "goal": calculate_goal(a, b, plan), "warnings": warnings}


def analyze_deep(a: DeepInput, b: DeepInput, plan: SharedPlan) -> AnalysisResult:
    gaps: dict[str, Any] = value_gaps({str(k): v for k, v in a.values.items()}, {str(k): v for k, v in b.values.items()},
                                    load_questions("deep-v2")["questions"])
    return AnalysisResult.model_validate({
        **analyze_finances(a, b, plan), "values": gaps,
        "topics": select_topics(gaps, list(a.importantAreas), list(b.importantAreas)),
    })
