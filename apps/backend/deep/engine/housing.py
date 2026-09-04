from typing import Any

from deep.engine.common import Evidence, month_start, total
from deep.schemas import DeepInput, SharedPlan


def allocated_assets(
    a: DeepInput, b: DeepInput, plan: SharedPlan, allocation: str, evidence: Evidence,
) -> tuple[int, bool]:
    available = 0
    complete = True
    for label, person in (("a", a), ("b", b)):
        if person.assetsStatus != "known":
            evidence.missing.append(label + ".assetsStatus")
            complete = False
            continue
        for asset in person.assets:
            amount = getattr(asset, allocation)
            if not amount:
                continue
            if asset.availableOn is None or asset.availableOn > month_start(plan.startMonth):
                evidence.missing.append(f"{label}.assets.{asset.id}.availableOn")
                complete = False
            else:
                available += amount
                evidence.amount(asset.balance, f"{label}.assets.{asset.id}.balance")
    evidence.assumptions.append("공동자산은 각자 소유 지분만 입력; 계획 시작월 1일까지 사용 가능한 배정액만 확정 자금에 포함")
    return available, complete


def calculate_housing(a: DeepInput, b: DeepInput, plan: SharedPlan) -> dict[str, Any]:
    evidence = Evidence()
    required: int | None
    if plan.housingType == "keep":
        required = 0
        evidence.assumptions.append("현 주거 유지: 새 주거가격 및 이전 비용은 계산하지 않음")
    else:
        required = total([evidence.amount(plan.housingPriceWon, "plan.housingPriceWon"),
                          evidence.amount(plan.oneOffCostsWon, "plan.oneOffCostsWon")])
    assets, complete = allocated_assets(a, b, plan, "housingAllocationWon", evidence)
    settled: list[int | None] = []
    for label, person in (("a", a), ("b", b)):
        if person.debtsStatus != "known":
            settled.append(None)
            evidence.missing.append(label + ".debtsStatus")
        else:
            settled.extend(evidence.amount(debt.balance, f"{label}.debts.{debt.id}.balance")
                           for debt in person.debts if debt.disposition == "settle")
    settlement = total(settled)
    borrowing = 0 if plan.newHousingLoan is None else evidence.amount(plan.newHousingLoan.balance, "plan.newHousingLoan.balance")
    available = assets - settlement + borrowing if complete and settlement is not None and borrowing is not None else None
    data = {"requiredWon": required, "confirmedAssetFundingWon": assets, "settlementWon": settlement,
            "newBorrowingWon": borrowing, "availableWon": available,
            "fundingGapWon": max(0, required - available) if required is not None and available is not None else None}
    return evidence.block(data, ["requiredWon", "availableWon", "fundingGapWon"])
