from decimal import Decimal, localcontext

from deep.engine.common import Evidence, won
from deep.schemas import DebtInput


def payment_schedule(
    principal: int, annual_rate: Decimal, months: int, repayment_type: str,
) -> list[dict[str, int]]:
    if (type(principal) is not int or principal < 0 or not annual_rate.is_finite() or annual_rate < 0
            or type(months) is not int or not 1 <= months <= 1200
            or repayment_type not in {"equalPayment", "equalPrincipal", "bulletMaturity"}):
        raise ValueError("INVALID_DEBT_SCHEDULE")
    rows: list[dict[str, int]] = []
    with localcontext() as context:
        context.prec = 50
        balance, rate = Decimal(principal), annual_rate / 12
        installment = balance / months if rate == 0 else balance * rate / (1 - (1 + rate) ** -months)
        principal_sum = Decimal(0)
        rounded_principal_sum = 0
        for index in range(months):
            interest = balance * rate
            if index == months - 1:
                principal_part = balance
            elif repayment_type == "bulletMaturity":
                principal_part = Decimal(0)
            elif repayment_type == "equalPrincipal":
                principal_part = Decimal(principal) / months
            else:
                principal_part = min(balance, max(Decimal(0), installment - interest))
            principal_sum += principal_part
            # Round the cumulative principal to avoid losing or creating principal across rows.
            principal_won = (principal if index == months - 1 else won(principal_sum)) - rounded_principal_sum
            rounded_principal_sum += principal_won
            interest_won = won(interest)
            rows.append({"month": index + 1, "principalWon": principal_won, "interestWon": interest_won,
                         "totalWon": principal_won + interest_won})
            balance -= principal_part
    return rows


def debt_schedule(debt: DebtInput) -> list[dict[str, int]] | None:
    if (debt.balance.value is None or debt.annualRate is None or debt.remainingMonths is None
            or debt.repaymentType == "unknown"):
        return None
    return payment_schedule(debt.balance.value, debt.annualRate, debt.remainingMonths, debt.repaymentType)


def current_payment(debt: DebtInput, path: str, evidence: Evidence) -> int | None:
    if debt.monthlyPayment.value is not None:
        return evidence.amount(debt.monthlyPayment, path + ".monthlyPayment")
    if debt.monthlyPayment.status == "withheld":
        evidence.missing.append(path + ".monthlyPayment")
        return None
    rows = debt_schedule(debt)
    if rows is None:
        evidence.missing.append(path + ".monthlyPayment")
        return None
    evidence.assumptions.append(f"{path}: 입력한 계약 조건으로 첫 회차 상환액 추정")
    return rows[0]["totalWon"]
