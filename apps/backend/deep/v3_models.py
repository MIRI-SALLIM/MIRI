from datetime import date
from typing import Annotated, Any, Literal, Self

from pydantic import Field, StrictBool, StrictInt, model_validator

from deep.funding_models import (
    FundingDeadline,
    FundingId,
    FundingPreviewRequest,
    FundingSettlement,
    FundingSource,
)
from deep.schemas import (
    AgreementRequest,
    AgreementResponse,
    Amount,
    CalculationBlock,
    DeepInput,
    EditAgreementRequest,
    Knowledge,
    Money,
    Month,
    SharedPlan,
    StrictModel,
    WaitingDeepResult,
)


class PersonalFunding(StrictModel):
    sourcesStatus: Knowledge = "unknown"
    sources: list[FundingSource] = Field(default_factory=list, max_length=100)
    settlementsStatus: Knowledge = "unknown"
    settlements: list[FundingSettlement] = Field(default_factory=list, max_length=60)


class Contribution(StrictModel):
    ownMonthly: Amount = Field(default_factory=Amount)
    expectedPartnerMonthly: Amount = Field(default_factory=Amount)
    personalSpendingFloor: Amount = Field(default_factory=Amount)
    personalSavingFloor: Amount = Field(default_factory=Amount)
    discussionState: Literal["unknown", "notDiscussed", "discussing", "believeAgreed"] = "unknown"


class PlanConstraint(StrictModel):
    id: FundingId
    kind: Literal["housingCost", "debtPayment", "borrowing", "personalSpending", "other"]
    scope: Literal["household", "self"]
    strength: Literal["required", "preferred"]
    amount: Amount = Field(default_factory=Amount)
    allowBorrowing: StrictBool | None = None
    note: str = Field(default="", max_length=300)


class DeepInputV3(DeepInput):
    inputVersion: Literal["deep-input-v3"]
    funding: PersonalFunding = Field(default_factory=PersonalFunding)
    contribution: Contribution = Field(default_factory=Contribution)
    constraints: list[PlanConstraint] = Field(default_factory=list, max_length=20)
    afterSettlementMonthlyPayments: dict[FundingId, Amount] = Field(default_factory=dict, max_length=30)

    @model_validator(mode="after")
    def coherent_v3_funding(self) -> Self:
        assets = {asset.id: asset for asset in self.assets}
        if any(asset.housingAllocationWon or asset.goalAllocationWon for asset in self.assets):
            raise ValueError("USE_V3_FUNDING_ALLOCATIONS_ONLY")
        if any(debt.disposition != "keep" for debt in self.debts):
            raise ValueError("USE_V3_SETTLEMENT_EVENTS_ONLY")
        if len({item.id for item in self.constraints}) != len(self.constraints):
            raise ValueError("DUPLICATE_CONSTRAINT")
        if set(self.afterSettlementMonthlyPayments) - {loan.id for loan in self.debts}:
            raise ValueError("UNKNOWN_POST_SETTLEMENT_DEBT")
        identifiers = [item.id for item in self.funding.sources] + [item.id for item in self.funding.settlements] + [item.id for item in self.debts]
        if any(len(identifier) > 62 for identifier in identifiers):
            raise ValueError("V3_ID_TOO_LONG")
        for source in self.funding.sources:
            if source.kind in {"support", "newBorrowing"}:
                if source.id in assets:
                    raise ValueError("EXTERNAL_SOURCE_DUPLICATES_ASSET")
                continue
            asset = assets.get(source.id)
            if asset is None or asset.kind != source.kind:
                raise ValueError("FUNDING_ASSET_REFERENCE_MISMATCH")
            if source.grossAmount.value is not None and asset.balance.value is not None and source.grossAmount.value > asset.balance.value:
                raise ValueError("FUNDING_EXCEEDS_OWN_ASSET")
        self.funding_request(date.max)
        return self

    def funding_request(self, as_of: date) -> FundingPreviewRequest:
        return FundingPreviewRequest.model_validate({"asOf": as_of, **self.funding.model_dump(), "debtsStatus": self.debtsStatus,
                                     "debts": [{"id": debt.id, "balance": debt.balance.model_dump()} for debt in self.debts]})


CommonCategory = Literal["housing", "food", "transport", "subscriptions", "gifts", "other"]


class SharedPlanV3(SharedPlan):
    planSchemaVersion: Literal["deep-plan-v3"]
    fundingAsOf: date
    fundingDeadlines: list[FundingDeadline] = Field(default_factory=list, max_length=120)
    commonExpensesStatus: Knowledge = "unknown"
    commonExpenses: dict[CommonCategory, Amount] = Field(default_factory=dict)
    newLoanAvailableOn: date | None = None
    newLoanCertainty: Literal["confirmed", "expected", "unknown"] = "unknown"

    @model_validator(mode="after")
    def coherent_shared_budget(self) -> Self:
        if self.commonExpensesStatus != "known" and self.commonExpenses:
            raise ValueError("BUDGET_ITEMS_REQUIRE_KNOWN_SCOPE")
        if len({item.id for item in self.fundingDeadlines}) != len(self.fundingDeadlines):
            raise ValueError("DUPLICATE_FUNDING_DEADLINE")
        housing = 0 if self.housingType == "keep" else self.housingPriceWon.value
        if (self.fundingDeadlines and housing is not None and self.oneOffCostsWon.value is not None
                and all(item.amount.value is not None for item in self.fundingDeadlines)
                and sum(item.amount.value or 0 for item in self.fundingDeadlines) != housing + self.oneOffCostsWon.value):
            raise ValueError("DEADLINE_TOTAL_MISMATCH")
        if sum(item.value or 0 for item in self.commonExpenses.values()) > 2**53 - 1:
            raise ValueError("UNSAFE_COMMON_BUDGET")
        return self


class SaveInputV3(StrictModel):
    expectedRevision: Annotated[StrictInt, Field(ge=0)]
    input: DeepInputV3


class OwnInputV3(StrictModel):
    revision: int
    input: DeepInputV3


class UpdatePlanV3(StrictModel):
    expectedVersion: Annotated[StrictInt, Field(ge=1)]
    plan: SharedPlanV3


class PlanResponseV3(StrictModel):
    version: int
    plan: SharedPlanV3
    myConfirmed: bool
    partnerConfirmed: bool
    locked: bool


class SubmitV3(StrictModel):
    expectedRevision: Annotated[StrictInt, Field(ge=0)]
    planVersion: Annotated[StrictInt, Field(ge=1)]
    consentVersion: Literal["deep-sharing-v2"]
    shareFinance: StrictBool
    shareValues: StrictBool


class SessionV3(StrictModel):
    id: str
    role: Literal["A", "B"]
    round: int
    invitationCode: str
    questionVersion: Literal["deep-v3"]


class DecisionTerms(StrictModel):
    topic: Literal["monthlyContribution", "housingFunding", "savings", "spending", "investment", "debt", "jointManagement", "other"]
    scope: str = Field(min_length=1, max_length=300)
    owner: Literal["A", "B", "both"]
    startMonth: Month
    dueDay: Annotated[StrictInt, Field(ge=1, le=31)] | None = None
    monthlyContributions: dict[Literal["A", "B"], Money] = Field(default_factory=dict)
    commonScope: list[CommonCategory] = Field(default_factory=list, max_length=6)
    exceptions: str = Field(default="", max_length=300)

    @model_validator(mode="after")
    def complete_monthly_proposal(self) -> Self:
        if len(self.commonScope) != len(set(self.commonScope)):
            raise ValueError("DUPLICATE_COMMON_SCOPE")
        if self.topic != "monthlyContribution" and self.commonScope:
            raise ValueError("COMMON_SCOPE_REQUIRES_MONTHLY_TOPIC")
        if self.topic == "monthlyContribution" and set(self.monthlyContributions) != {"A", "B"}:
            raise ValueError("BOTH_CONTRIBUTIONS_REQUIRED")
        if self.topic != "monthlyContribution" and self.monthlyContributions:
            raise ValueError("CONTRIBUTIONS_REQUIRE_MONTHLY_TOPIC")
        if sum(self.monthlyContributions.values()) > 2**53 - 1:
            raise ValueError("UNSAFE_CONTRIBUTION_TOTAL")
        return self


class AgreementRequestV3(AgreementRequest):
    terms: DecisionTerms


class EditAgreementV3(EditAgreementRequest):
    terms: DecisionTerms


class AgreementResponseV3(AgreementResponse):
    terms: DecisionTerms
    planVersion: int
    sourceReportId: str


class ReportV3(StrictModel):
    versions: dict[str, str | int]
    cashflow: CalculationBlock
    housing: CalculationBlock
    goal: CalculationBlock
    planning: CalculationBlock
    values: CalculationBlock
    issues: list[dict[str, Any]]
    topics: list[dict[str, Any]]
    limitations: dict[str, str]


class ReadyResultV3(StrictModel):
    status: Literal["ready"]
    report: ReportV3
    agreements: list[AgreementResponseV3]
    operatingStatus: dict[str, Any]


ResultV3 = Annotated[WaitingDeepResult | ReadyResultV3, Field(discriminator="status")]
