"""Dated, earmarked funding: count gross inflows and repayment events once."""

from deep.funding_models import (
    FundingDeadline,
    FundingIssue,
    FundingPreviewRequest,
    FundingPreviewResponse,
    FundingSettlement,
    FundingSource,
    FundingSourceResult,
    FundingTimelineRow,
)


def _source_result(
    source: FundingSource, body: FundingPreviewRequest, allocated: int,
    missing: list[str], issues: list[FundingIssue],
) -> FundingSourceResult:
    gross = source.grossAmount.value
    unknown_settlement = body.settlementsStatus != "known" or body.debtsStatus != "known" or any(
        event.amount.value is None for event in body.settlements
    )
    net = None if gross is None or unknown_settlement else gross - allocated
    result = FundingSourceResult(id=source.id, netAfterSettlementWon=net,
                                 housingAllocationWon=source.housingAllocationWon, availableOn=source.availableOn, basis="excluded")
    if gross is None:
        missing.append(f"sources.{source.id}.grossAmount")
    if source.availableOn is None:
        missing.append(f"sources.{source.id}.availableOn")
    if source.certainty == "unknown":
        missing.append(f"sources.{source.id}.certainty")
    if gross is None or source.availableOn is None or source.certainty == "unknown":
        return result
    if source.certainty != "available" and source.availableOn < body.asOf:
        missing.append(f"sources.{source.id}.receiptConfirmation")
        issues.append(FundingIssue(code="OVERDUE_SOURCE", sourceId=source.id,
                                   message="입금 예정일이 지났지만 사용 가능 여부가 확인되지 않았습니다. 확보 재원에서 제외했습니다.",
                                   question="실제로 받은 돈인가요? 사용 가능 여부와 날짜를 다시 확인해 주세요."))
    elif source.certainty == "expected":
        result.basis = "expected"
        issues.append(FundingIssue(code="EXPECTED_SOURCE", sourceId=source.id,
                                   message="아직 예상인 재원은 기본 확보액에서 제외하고 별도 가정으로만 비교합니다.",
                                   question="받을 금액과 날짜가 확인됐나요?"))
    else:
        result.basis = "confirmed"
    return result


def calculate_funding(body: FundingPreviewRequest) -> FundingPreviewResponse:
    missing: list[str] = []
    issues: list[FundingIssue] = []
    assumptions = ["본인이 제공한 입력만 계산하는 개인 미리보기입니다. 공동 결과나 합의가 아닙니다.",
                   "확보액은 자기보고한 사용 가능·확인된 예정 재원 기준이며 실제 지급을 보증하지 않습니다.",
                   "날짜별 부족액은 누적 값입니다. 각 행의 부족액을 합산하지 않습니다."]
    for field in ("sourcesStatus", "debtsStatus", "settlementsStatus"):
        if getattr(body, field) != "known":
            missing.append(field)
    if not body.deadlines:
        missing.append("deadlines")
    allocated = {source.id: 0 for source in body.sources}
    for event in body.settlements:
        for part in event.parts:
            allocated[part.sourceId] += part.amountWon
    results = [_source_result(source, body, allocated[source.id], missing, issues) for source in body.sources]
    for debt in body.debts:
        if debt.balance.value is None:
            missing.append(f"debts.{debt.id}.balance")
    obligations: list[tuple[str, FundingSettlement | FundingDeadline]] = [
        ("settlements", event) for event in body.settlements
    ]
    obligations.extend(("deadlines", item) for item in body.deadlines)
    for collection, item in obligations:
        if item.amount.value is None:
            missing.append(f"{collection}.{item.id}.amount")
        if item.dueOn is None:
            missing.append(f"{collection}.{item.id}.dueOn")
    if any(item.grossAmount.precision == "estimate" for item in body.sources) or any(
        item.amount.precision == "estimate" for _, item in obligations
    ):
        assumptions.append("일부 금액은 추정 입력입니다. 계산값도 추정이며 확정 금액이 아닙니다.")
    dates = sorted({item.dueOn for _, item in obligations if item.dueOn is not None} | {
        source.availableOn for source, result in zip(body.sources, results, strict=True)
        if source.availableOn is not None and source.availableOn >= body.asOf and result.basis != "excluded"
    })
    unknown_repayment_date = body.debtsStatus != "known" or body.settlementsStatus != "known" or any(
        event.dueOn is None for event in body.settlements
    )
    unknown_housing = not body.deadlines or any(item.dueOn is None for item in body.deadlines)
    timeline = []
    for when in dates:
        required = [item.amount.value for item in body.deadlines if item.dueOn is not None and item.dueOn <= when]
        housing = None if unknown_housing or None in required else sum(value for value in required if value is not None)
        repayments = [event.amount.value for event in body.settlements if event.dueOn is not None and event.dueOn <= when]
        repayment = None if unknown_repayment_date or None in repayments else sum(value for value in repayments if value is not None)
        due_parts = dict.fromkeys(allocated, 0)
        for event in body.settlements:
            if event.dueOn is not None and event.dueOn <= when:
                for part in event.parts:
                    due_parts[part.sourceId] += part.amountWon
        inflows = {"confirmed": 0, "expected": 0}
        for source, result in zip(body.sources, results, strict=True):
            if result.basis == "excluded" or source.availableOn is None or source.availableOn > when:
                continue
            # Earmarked source money pays either housing or linked repayments.
            # Goal/reserve/unallocated balances never become housing funds implicitly.
            inflows[result.basis] += min(source.grossAmount.value or 0, source.housingAllocationWon + due_parts[source.id])
        available = None if repayment is None else inflows["confirmed"] - repayment
        gap = None if housing is None or available is None else max(0, housing - available)
        scenario = None if housing is None or available is None else max(0, housing - available - inflows["expected"])
        timeline.append(FundingTimelineRow(date=when, requiredHousingWon=housing, settlementDueWon=repayment,
                                          confirmedSourceFundingWon=inflows["confirmed"], expectedSourceFundingWon=inflows["expected"],
                                          availableForHousingWon=available, fundingGapWon=gap, includingExpectedGapWon=scenario))
        if gap:
            issues.append(FundingIssue(code="FUNDING_GAP", date=when, amountWon=gap,
                                       message=f"{when.isoformat()}까지 입력상 확보한 재원 기준으로 {gap:,}원이 부족합니다.",
                                       question="추가 재원을 확인할까요, 필요한 금액이나 지급일을 조정할까요?"))
    if missing:
        issues.append(FundingIssue(code="INCOMPLETE_FUNDING", message="미확정 정보가 있습니다. 모르는 금액을 0원으로 간주하지 않았습니다.",
                                   question="본인의 입력에서 금액·날짜·재원 상태를 확인할 수 있나요?"))
    if any(row.fundingGapWon is None for row in timeline):
        issues.append(FundingIssue(code="GAP_UNAVAILABLE", message="필요한 금액이나 상환 일정이 미정이라 정확한 부족액을 계산할 수 없습니다.",
                                   question="납부·상환 금액과 날짜부터 확인해 주세요."))
    return FundingPreviewResponse(status="unavailable" if not timeline else "partial" if missing else "available",
                                  sources=results, timeline=timeline, missingFields=sorted(set(missing)),
                                  assumptions=assumptions, issues=issues)
