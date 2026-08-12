from typing import Dict, List, Any

def validate_input(data: Dict[str, Any], parameters: Dict[str, Any]) -> List[Dict[str, str]]:
    rules = parameters.get("inputValidation", {}).get("rules", [])
    warnings = []

    income = data.get("monthlyNetIncome", 0)
    total_expense = data.get("totalExpense", 0)
    debt_total = data.get("debtTotal", 0)
    variable_expenses = data.get("variableExpenses", -1)
    savings = data.get("savings", 0)

    for rule in rules:
        rule_id = rule.get("id")
        
        # V-01: 월 순소득 이상치 (100만원 미만 또는 700만원 초과)
        if rule_id == "V-01" and (income < 100 or income > 700):
            warnings.append({"id": rule_id, "level": rule["level"], "message": rule["message"]})
            
        # V-02: 지출 합계가 소득보다 많음
        elif rule_id == "V-02" and total_expense > income:
            warnings.append({"id": rule_id, "level": rule["level"], "message": rule["message"]})
            
        # V-03: 부채 규모가 연소득의 5배 초과
        elif rule_id == "V-03" and debt_total > (income * 12 * 5):
            warnings.append({"id": rule_id, "level": rule["level"], "message": rule["message"]})
            
        # V-04: 변동지출이 0
        elif rule_id == "V-04" and variable_expenses == 0:
            warnings.append({"id": rule_id, "level": rule["level"], "message": rule["message"]})
            
        # V-05: 모아둔 돈(저축)이 0이고 월 소득 400만원 초과
        elif rule_id == "V-05" and savings == 0 and income > 400:
            warnings.append({"id": rule_id, "level": rule["level"], "message": rule["message"]})

    return warnings