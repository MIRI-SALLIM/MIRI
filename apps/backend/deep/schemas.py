from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    model_validator,
)

from deep.config import AREAS, QUESTION_IDS

Money = Annotated[StrictInt, Field(ge=0, le=2**53 - 1)]
Month = Annotated[str, Field(pattern=r"^[1-9][0-9]{3}-(0[1-9]|1[0-2])$")]
Area = Literal["savings", "spending", "investment", "debt", "jointManagement"]
QuestionId = Literal["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"]
Knowledge = Literal["known", "unknown", "withheld"]
Answer = Annotated[StrictInt, Field(ge=1, le=5)]
FIXED_CATEGORIES = ("communication", "insurance", "subscriptions", "familySupport", "other")
VARIABLE_CATEGORIES = ("food", "transport", "shopping", "leisure", "other")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_default=True)


class Amount(StrictModel):
    value: Money | None = None
    status: Knowledge = "unknown"
    precision: Literal["exact", "estimate"] = "exact"

    @model_validator(mode="after")
    def consistent_state(self) -> Self:
        if (self.status == "known") != (self.value is not None):
            raise ValueError("AMOUNT_STATUS_MISMATCH")
        return self


class IncomeInput(StrictModel):
    monthlyNetIncome: Amount = Field(default_factory=Amount)
    annualNetBonus: Amount = Field(default_factory=Amount)
    bonusIncludedInMonthlyIncome: StrictBool = False
    bonusMonth: Annotated[StrictInt, Field(ge=1, le=12)] | None = None
    referenceMonth: Month | None = None


class DebtInput(StrictModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    type: str = Field(min_length=1, max_length=50)
    balance: Amount = Field(default_factory=Amount)
    monthlyPayment: Amount = Field(default_factory=Amount)
    annualRate: Annotated[Decimal, Field(ge=0, allow_inf_nan=False, max_digits=14, decimal_places=10)] | None = None
    # Computation/resource limit, not a judgement about a person's debt.
    remainingMonths: Annotated[StrictInt, Field(ge=1, le=1200)] | None = None
    repaymentType: Literal["equalPayment", "equalPrincipal", "bulletMaturity", "unknown"] = "unknown"
    disposition: Literal["keep", "settle"] = "keep"


class AssetInput(StrictModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    kind: Literal["cashSavings", "rentalDeposit", "investments", "subscription", "realEstate", "other"]
    balance: Amount = Field(default_factory=Amount)
    availableOn: date | None = None
    housingAllocationWon: Money = 0
    goalAllocationWon: Money = 0

    @model_validator(mode="after")
    def allocation_within_balance(self) -> Self:
        allocation = self.housingAllocationWon + self.goalAllocationWon
        if allocation and (self.balance.value is None or allocation > self.balance.value):
            raise ValueError("ASSET_ALLOCATION_EXCEEDS_KNOWN_BALANCE")
        return self


class DeepInput(StrictModel):
    income: IncomeInput = Field(default_factory=IncomeInput)
    fixedExpenses: dict[str, Amount] = Field(default_factory=dict)
    variableExpenses: dict[str, Amount] = Field(default_factory=dict)
    housingCost: Amount = Field(default_factory=Amount)
    debts: list[DebtInput] = Field(default_factory=list, max_length=30)
    debtsStatus: Knowledge = "unknown"
    assets: list[AssetInput] = Field(default_factory=list, max_length=100)
    assetsStatus: Knowledge = "unknown"
    livingTogether: StrictBool | None = None
    values: dict[QuestionId, Answer | None] = Field(default_factory=dict)
    skippedQuestionIds: list[QuestionId] = Field(default_factory=list, max_length=10)
    importantAreas: list[Area] = Field(default_factory=list, max_length=2)
    contextNotes: dict[str, Annotated[str, Field(max_length=300)]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def consistent_input(self) -> Self:
        for values, keys in ((self.fixedExpenses, FIXED_CATEGORIES), (self.variableExpenses, VARIABLE_CATEGORIES)):
            if set(values) - set(keys):
                raise ValueError("UNKNOWN_EXPENSE_CATEGORY")
            for key in keys:
                values.setdefault(key, Amount())
        if len(set(self.importantAreas)) != len(self.importantAreas):
            raise ValueError("DUPLICATE_IMPORTANT_AREA")
        if len(set(self.skippedQuestionIds)) != len(self.skippedQuestionIds):
            raise ValueError("DUPLICATE_SKIPPED_QUESTION")
        if any(self.values.get(key) is not None for key in self.skippedQuestionIds):
            raise ValueError("SKIPPED_QUESTION_HAS_ANSWER")
        if set(self.contextNotes) - set(QUESTION_IDS) - set(AREAS):
            raise ValueError("UNKNOWN_CONTEXT_KEY")
        for items, status in ((self.debts, self.debtsStatus), (self.assets, self.assetsStatus)):
            if len({item.id for item in items}) != len(items):
                raise ValueError("DUPLICATE_ITEM_ID")
            if status != "known" and items:
                raise ValueError("ITEMS_REQUIRE_KNOWN_COLLECTION")
        return self


class GoalInput(StrictModel):
    title: str = Field(min_length=1, max_length=50)
    amountWon: Annotated[StrictInt, Field(gt=0, le=2**53 - 1)]
    targetMonth: Month


class SharedPlan(StrictModel):
    startMonth: Month
    housingType: Literal["keep", "rent", "jeonse", "buy"] = "keep"
    monthlyHousingCost: Amount = Field(default_factory=Amount)
    housingPriceWon: Amount = Field(default_factory=Amount)
    oneOffCostsWon: Amount = Field(default_factory=Amount)
    newHousingLoan: DebtInput | None = None
    target: GoalInput | None = None

    @model_validator(mode="after")
    def valid_new_loan(self) -> Self:
        if self.newHousingLoan and (self.housingType == "keep" or self.newHousingLoan.disposition != "keep"):
            raise ValueError("INVALID_NEW_HOUSING_LOAN")
        return self


class SaveDeepInputRequest(StrictModel):
    expectedRevision: Annotated[StrictInt, Field(ge=0)]
    input: DeepInput


class SubmitDeepInputRequest(StrictModel):
    expectedRevision: Annotated[StrictInt, Field(ge=0)]
    planVersion: Annotated[StrictInt, Field(ge=1)]
    consentVersion: Literal["deep-sharing-v1"]
    shareFinance: StrictBool
    shareValues: StrictBool


class CreateDeepSessionRequest(StrictModel):
    pass


class UpdateSharedPlanRequest(StrictModel):
    expectedVersion: Annotated[StrictInt, Field(ge=1)]
    plan: SharedPlan


class ConfirmSharedPlanRequest(StrictModel):
    planVersion: Annotated[StrictInt, Field(ge=1)]


class DeepSessionResponse(StrictModel):
    id: str
    role: Literal["A", "B"]
    round: int
    invitationCode: str
    questionVersion: Literal["deep-v2"]


class OwnDeepInputResponse(StrictModel):
    revision: int
    input: DeepInput


class SharedPlanResponse(StrictModel):
    version: int
    plan: SharedPlan
    myConfirmed: bool
    partnerConfirmed: bool
    locked: bool


class DeepStatusResponse(StrictModel):
    status: Literal["waiting", "ready"]
    mySubmitted: bool
    partnerCompleted: bool


class CalculationBlock(StrictModel):
    status: Literal["available", "partial", "unavailable"]
    missingFields: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    data: dict[str, Any] | None = None
    reason: str | None = None


class AnalysisResult(StrictModel):
    ruleVersion: Literal["deep-rules-v1"] = "deep-rules-v1"
    source: Literal["self_reported_and_calculated"] = "self_reported_and_calculated"
    cashflow: CalculationBlock
    housing: CalculationBlock
    goal: CalculationBlock
    values: dict[str, Any]
    topics: list[str]
    warnings: list[dict[str, str]] = Field(default_factory=list)


class DeepReport(StrictModel):
    versions: dict[str, str | int]
    cashflow: CalculationBlock
    housing: CalculationBlock
    goal: CalculationBlock
    values: CalculationBlock
    topics: list[dict[str, Any]]
    agreementPrompts: list[str]
    limitations: dict[str, str]
    warnings: list[dict[str, str]]


class WaitingDeepResult(StrictModel):
    status: Literal["waiting"]
    partnerCompleted: bool


class ReadyDeepResult(StrictModel):
    status: Literal["ready"]
    report: DeepReport


DeepResultResponse = Annotated[WaitingDeepResult | ReadyDeepResult, Field(discriminator="status")]


class AgreementContent(StrictModel):
    text: str = Field(min_length=1, max_length=1000)
    reviewOn: date | None = None


class AgreementRequest(AgreementContent):
    expectedRound: Annotated[StrictInt, Field(ge=1)]


class VersionRequest(StrictModel):
    expectedVersion: Annotated[StrictInt, Field(ge=1)]


class EditAgreementRequest(AgreementContent):
    expectedVersion: Annotated[StrictInt, Field(ge=1)]


class AgreementResponse(StrictModel):
    id: str
    version: int
    round: int
    text: str
    reviewOn: date | None
    status: Literal["proposed", "agreed", "deferred"]
    myConfirmed: bool
    partnerConfirmed: bool


class RoundRequest(StrictModel):
    expectedRound: Annotated[StrictInt, Field(ge=1)]


class RoundResponse(StrictModel):
    round: int
    pending: bool


class RoundStateResponse(StrictModel):
    round: int
    myRequested: bool
    partnerRequested: bool


class ClosedDeepResponse(StrictModel):
    status: Literal["closed"] = "closed"
