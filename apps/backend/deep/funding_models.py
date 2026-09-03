"""Private funding preview contract; deliberately independent of legacy v2 sessions."""

from datetime import date as CalendarDate
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from deep.schemas import Amount, Knowledge, Money, StrictModel

FundingId = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")]
SAFE_MONEY = 2**53 - 1


class FundingSource(StrictModel):
    id: FundingId
    kind: Literal["cashSavings", "rentalDeposit", "investments", "subscription", "realEstate", "other", "support", "newBorrowing"]
    grossAmount: Amount = Field(default_factory=Amount, description="본인 몫의 사용 예정 재원, 연결 상환 차감 전 원 단위 금액")
    availableOn: CalendarDate | None = None
    certainty: Literal["available", "confirmed", "expected", "unknown"] = "unknown"
    housingAllocationWon: Money = 0
    goalAllocationWon: Money = 0
    reserveAllocationWon: Money = 0


class FundingDebt(StrictModel):
    id: FundingId
    balance: Amount = Field(default_factory=Amount)


class SettlementPart(StrictModel):
    sourceId: FundingId
    amountWon: Money


class FundingSettlement(StrictModel):
    id: FundingId
    debtId: FundingId
    amount: Amount = Field(default_factory=Amount)
    dueOn: CalendarDate | None = None
    parts: list[SettlementPart] = Field(default_factory=list, max_length=100)


class FundingDeadline(StrictModel):
    id: FundingId
    dueOn: CalendarDate | None = None
    amount: Amount = Field(default_factory=Amount, description="주거/일회성 비용의 이번 회차 지급액; 누적 총액 아님")


class FundingPreviewRequest(StrictModel):
    asOf: CalendarDate
    sourcesStatus: Knowledge = "unknown"
    debtsStatus: Knowledge = "unknown"
    settlementsStatus: Knowledge = "unknown"
    sources: list[FundingSource] = Field(default_factory=list, max_length=100)
    debts: list[FundingDebt] = Field(default_factory=list, max_length=30)
    settlements: list[FundingSettlement] = Field(default_factory=list, max_length=60)
    deadlines: list[FundingDeadline] = Field(default_factory=list, max_length=120)

    @model_validator(mode="after")
    def validate_funding_links(self) -> Self:
        for items, status in ((self.sources, self.sourcesStatus), (self.debts, self.debtsStatus),
                              (self.settlements, self.settlementsStatus), (self.deadlines, "known")):
            if len({item.id for item in items}) != len(items):
                raise ValueError("DUPLICATE_FUNDING_ID")
            if items and status != "known":
                raise ValueError("FUNDING_ITEMS_REQUIRE_KNOWN_COLLECTION")
        sources = {item.id: item for item in self.sources}
        debts = {item.id: item for item in self.debts}
        source_parts = dict.fromkeys(sources, 0)
        debt_paid = dict.fromkeys(debts, 0)
        for event in self.settlements:
            if event.debtId not in debts or any(part.sourceId not in sources for part in event.parts):
                raise ValueError("UNKNOWN_FUNDING_REFERENCE")
            if len({part.sourceId for part in event.parts}) != len(event.parts):
                raise ValueError("DUPLICATE_SETTLEMENT_SOURCE")
            if event.parts and (event.amount.value is None or sum(p.amountWon for p in event.parts) != event.amount.value):
                raise ValueError("SETTLEMENT_PARTS_MISMATCH")
            if event.amount.value is not None:
                debt_paid[event.debtId] += event.amount.value
            for part in event.parts:
                source_parts[part.sourceId] += part.amountWon
        for key, paid in debt_paid.items():
            balance = debts[key].balance.value
            if balance is not None and paid > balance:
                raise ValueError("SETTLEMENT_EXCEEDS_DEBT")
        for source in self.sources:
            if source.certainty == "available" and (source.availableOn is None or source.availableOn > self.asOf):
                raise ValueError("AVAILABLE_SOURCE_REQUIRES_PAST_OR_CURRENT_DATE")
            allocation = source.housingAllocationWon + source.goalAllocationWon + source.reserveAllocationWon
            if source.grossAmount.value is not None and allocation > max(0, source.grossAmount.value - source_parts[source.id]):
                raise ValueError("ALLOCATION_EXCEEDS_NET_SOURCE")
            if allocation > SAFE_MONEY:
                raise ValueError("UNSAFE_FUNDING_TOTAL")
        # Bound derived sums too, not only each input: JSON consumers use safe integers.
        inflows = sum(source.grossAmount.value or 0 for source in self.sources)
        outflows = sum(event.amount.value or 0 for event in self.settlements) + sum(item.amount.value or 0 for item in self.deadlines)
        if max(inflows, outflows, sum(debt_paid.values())) > SAFE_MONEY:
            raise ValueError("UNSAFE_FUNDING_TOTAL")
        return self


class FundingSourceResult(StrictModel):
    id: str
    netAfterSettlementWon: int | None
    housingAllocationWon: Money
    availableOn: CalendarDate | None
    basis: Literal["confirmed", "expected", "excluded"]


class FundingTimelineRow(StrictModel):
    date: CalendarDate
    requiredHousingWon: int | None
    settlementDueWon: int | None
    confirmedSourceFundingWon: int
    expectedSourceFundingWon: int
    availableForHousingWon: int | None
    fundingGapWon: int | None
    includingExpectedGapWon: int | None


class FundingIssue(StrictModel):
    code: str
    message: str
    question: str
    date: CalendarDate | None = None
    sourceId: str | None = None
    amountWon: int | None = None


class FundingPreviewResponse(StrictModel):
    ruleVersion: Literal["deep-funding-v1"] = "deep-funding-v1"
    audience: Literal["private_input_preview"] = "private_input_preview"
    fundingBasis: Literal["self_reported_confirmed_sources"] = "self_reported_confirmed_sources"
    status: Literal["available", "partial", "unavailable"]
    sources: list[FundingSourceResult]
    timeline: list[FundingTimelineRow]
    missingFields: list[str]
    assumptions: list[str]
    issues: list[FundingIssue]
