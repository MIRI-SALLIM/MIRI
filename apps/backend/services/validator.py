from typing import Any


def validate_input(data: dict[str, Any], parameters: dict[str, Any]) -> list[dict[str, str]]:
    rules = parameters.get("inputValidation", {}).get("rules", [])
    warnings: list[dict[str, str]] = []

    income = float(data.get("monthlyNetIncome", 0.0))
    total_expense = float(data.get("totalExpense", 0.0))
    debt_total = float(data.get("debtTotal", 0.0))
    variable_expenses = float(data.get("variableExpenses", -1.0))
    savings = float(data.get("savings", 0.0))

    for rule in rules:
        rule_id = rule.get("id")
        
        # V-01: 월 순소득 이상치 (100만원 미만 또는 700만원 초과)
        if rule_id == "V-01" and (income < 100 or income > 700) or rule_id == "V-02" and total_expense > income or rule_id == "V-03" and debt_total > (income * 12 * 5) or rule_id == "V-04" and variable_expenses == 0 or rule_id == "V-05" and savings == 0 and income > 400:
            warnings.append({"id": rule_id, "level": rule["level"], "message": rule["message"]})

    return warnings