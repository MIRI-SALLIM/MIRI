from datetime import date
from typing import Annotated, Literal, Self

from pydantic import Field, StrictBool, StrictInt, field_validator, model_validator

from deep.schemas import Money, Month, StrictModel
from deep.v3_models import CommonCategory

MAX_MONEY = 2**53 - 1
SignedMoney = Annotated[StrictInt, Field(ge=-MAX_MONEY, le=MAX_MONEY)]
FactId = Literal[
    "budget", "offered_total", "contribution_gap", "excess", "contribution_a", "contribution_b",
    "expected_a_for_b", "expected_b_for_a", "expectation_a", "expectation_b",
    "housing_required", "housing_available", "housing_gap", "housing_expected", "housing_gap_with_expected",
    "monthly_surplus", "goal_required_saving", "goal_saving_gap",
]
IssueId = Literal["contribution_gap", "contribution_unknown", "excess_contributions", "expectation_a", "expectation_b",
                  "housing_gap", "housing_unknown", "housing_expected", "monthly_deficit", "cashflow_unknown",
                  "goal_saving_gap", "goal_unknown", "condition_discussion"]
AgreementStatus = Literal["unknown", "notProposed", "proposed", "deferred", "agreed", "conflicting"]


class MeetingPermissions(StrictModel):
    financeA: StrictBool = False
    financeB: StrictBool = False
    aiA: StrictBool = False
    aiB: StrictBool = False


class Fact(StrictModel):
    id: FactId
    valueWon: SignedMoney


class MeetingIssue(StrictModel):
    id: IssueId
    factIds: list[FactId]


class MeetingBrief(StrictModel):
    scope: Literal["monthly", "sharedPlan"] = "monthly"
    housingGapDate: date | None = None
    sourceRound: Annotated[StrictInt, Field(ge=1)]
    planVersion: Annotated[StrictInt, Field(ge=1)]
    startMonth: Month
    commonScope: list[CommonCategory] = Field(max_length=6)
    sourceHasAssumptions: StrictBool
    agreementStatus: AgreementStatus
    facts: list[Fact]
    issues: list[MeetingIssue]
    basis: Literal["submitted_intentions_not_affordability"] = "submitted_intentions_not_affordability"


class BudgetOption(StrictModel):
    commonScope: list[CommonCategory] = Field(min_length=1, max_length=6)
    startMonth: Month
    budgetWon: Money | None
    aWon: Money | None
    bWon: Money | None

    @field_validator("commonScope")
    @classmethod
    def unique_scope(cls, value: list[CommonCategory]) -> list[CommonCategory]:
        if len(set(value)) != len(value):
            raise ValueError("DUPLICATE_COMMON_SCOPE")
        return value

    @model_validator(mode="after")
    def safe_total(self) -> Self:
        if self.aWon is not None and self.bWon is not None and self.aWon + self.bWon > MAX_MONEY:
            raise ValueError("UNSAFE_CONTRIBUTION_TOTAL")
        return self


class BudgetComparison(StrictModel):
    status: Literal["available", "partial", "unavailable"]
    reason: Literal["scope_or_month_mismatch"] | None = None
    baselineGapWon: Money | None = None
    proposalGapWon: Money | None = None
    proposalExcessWon: Money | None = None
    budgetChangeWon: SignedMoney | None = None
    aChangeWon: SignedMoney | None = None
    bChangeWon: SignedMoney | None = None
    basis: Literal["calculation_only_not_affordability_or_agreement"] = "calculation_only_not_affordability_or_agreement"


class ExplanationCard(StrictModel):
    issueId: IssueId
    factIds: list[FactId] = Field(max_length=10)
    explanation: str = Field(min_length=1, max_length=300)
    question: str = Field(min_length=1, max_length=160)

    @field_validator("explanation", "question")
    @classmethod
    def bounded_text_without_numeric_characters(cls, value: str) -> str:
        # Figures must be rendered from facts, not copied from generated prose.
        # This is not a semantic truth check (e.g. Korean number words).
        if not value.strip() or any(char.isnumeric() for char in value):
            raise ValueError("INVALID_EXPLANATION_TEXT")
        return value


class ExplanationDraft(StrictModel):
    cards: list[ExplanationCard] = Field(min_length=1, max_length=3)
