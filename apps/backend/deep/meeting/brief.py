from typing import Any, Literal, Self, cast, get_args

from pydantic import Field, ValidationError, model_validator

from deep.errors import DeepError
from deep.meeting.models import (
    AgreementStatus,
    Fact,
    FactId,
    IssueId,
    MeetingBrief,
    MeetingIssue,
    MeetingPermissions,
    SignedMoney,
)
from deep.schemas import Money, Month, StrictModel
from deep.v3_models import CommonCategory, ReadyResultV3
from deep.versions import version_fields


class _Contributions(StrictModel):
    A: Money | None
    B: Money | None


class _Expectation(StrictModel):
    expectingRole: Literal["A", "B"]
    contributingRole: Literal["A", "B"]
    expectedWon: Money
    offeredWon: Money
    differenceWon: SignedMoney


class _PlanningEvidence(StrictModel):
    basis: Literal["submitted_intentions_not_agreement"]
    startMonth: Month
    commonScope: list[CommonCategory] = Field(max_length=6)
    commonBudgetWon: Money | None
    ownContributionsWon: _Contributions
    offeredTotalWon: Money | None
    contributionGapWon: Money | None
    excessContributionsWon: Money | None
    expectationDifferences: list[_Expectation] = Field(max_length=2)

    @model_validator(mode="after")
    def consistent_evidence(self) -> Self:
        a, b = self.ownContributionsWon.A, self.ownContributionsWon.B
        total = None if a is None or b is None else a + b
        budget = self.commonBudgetWon
        gap = None if budget is None or total is None else max(0, budget - total)
        excess = None if budget is None or total is None else max(0, total - budget)
        if (total, gap, excess) != (self.offeredTotalWon, self.contributionGapWon, self.excessContributionsWon):
            raise ValueError("INCONSISTENT_CONTRIBUTIONS")
        if len(set(self.commonScope)) != len(self.commonScope):
            raise ValueError("DUPLICATE_COMMON_SCOPE")
        roles = [row.expectingRole for row in self.expectationDifferences]
        if len(set(roles)) != len(roles):
            raise ValueError("DUPLICATE_EXPECTATION")
        for row in self.expectationDifferences:
            offered = b if row.expectingRole == "A" else a
            if (row.expectingRole == row.contributingRole or row.offeredWon != offered
                    or row.differenceWon != row.expectedWon - row.offeredWon):
                raise ValueError("INCONSISTENT_EXPECTATION")
        return self


def _project(result: dict[str, Any]) -> MeetingBrief:
    ready = ReadyResultV3.model_validate(result)
    # Use raw versions so a coercion in the existing report model cannot turn bool into a round.
    versions = result["report"]["versions"]
    if any(versions.get(key) != value for key, value in version_fields("deep-v3").items()):
        raise ValueError("UNSUPPORTED_VERSION")
    block = ready.report.planning
    if block.reason is not None or block.data is None:
        raise DeepError("MEETING_PLANNING_UNAVAILABLE")
    data = _PlanningEvidence.model_validate({key: block.data[key] for key in _PlanningEvidence.model_fields})
    if block.status == "unavailable":
        missing = {key for key, value in (
            ("commonExpenses", data.commonBudgetWon),
            ("A.ownMonthly", data.ownContributionsWon.A), ("B.ownMonthly", data.ownContributionsWon.B),
        ) if value is None}
        # The v3 engine retains known facts when only the gap is incalculable.
        # Explicit denial reasons, absent data, and unexplained unavailability stay closed.
        if not missing or not missing <= set(block.missingFields):
            raise DeepError("MEETING_PLANNING_UNAVAILABLE")
    values: dict[FactId, int | None] = {
        "budget": data.commonBudgetWon, "offered_total": data.offeredTotalWon,
        "contribution_gap": data.contributionGapWon, "excess": data.excessContributionsWon,
        "contribution_a": data.ownContributionsWon.A, "contribution_b": data.ownContributionsWon.B,
    }
    issues: list[MeetingIssue] = []
    if data.contributionGapWon is None:
        issues.append(MeetingIssue(id="contribution_unknown", factIds=[key for key, value in values.items() if value is not None]))
    elif data.contributionGapWon > 0:
        issues.append(MeetingIssue(id="contribution_gap", factIds=["budget", "offered_total", "contribution_gap", "contribution_a", "contribution_b"]))
    elif data.excessContributionsWon:
        issues.append(MeetingIssue(id="excess_contributions", factIds=["budget", "offered_total", "excess", "contribution_a", "contribution_b"]))
    for row in sorted(data.expectationDifferences, key=lambda item: item.expectingRole):
        expected_id: FactId = "expected_a_for_b" if row.expectingRole == "A" else "expected_b_for_a"
        difference_id: FactId = "expectation_a" if row.expectingRole == "A" else "expectation_b"
        issue_id: IssueId = "expectation_a" if row.expectingRole == "A" else "expectation_b"
        offered_id: FactId = "contribution_b" if row.expectingRole == "A" else "contribution_a"
        values[expected_id], values[difference_id] = row.expectedWon, row.differenceWon
        if row.differenceWon:
            issues.append(MeetingIssue(id=issue_id, factIds=[expected_id, offered_id, difference_id]))
    agreement_status = ready.operatingStatus.get("status")
    return MeetingBrief(
        sourceRound=versions["round"], planVersion=versions["planVersion"],
        startMonth=data.startMonth, commonScope=data.commonScope, sourceHasAssumptions=bool(block.assumptions),
        agreementStatus=cast(AgreementStatus, agreement_status) if agreement_status in get_args(AgreementStatus) else "unknown",
        facts=[Fact(id=key, valueWon=value) for key, value in values.items() if value is not None], issues=issues,
    )


def build_brief(result: dict[str, Any], permissions: MeetingPermissions) -> MeetingBrief:
    """Project a server-authorized result; callers must load current permissions from storage."""
    if not (permissions.aiA and permissions.aiB):
        raise DeepError("MEETING_AI_CONSENT_REQUIRED")
    if not (permissions.financeA and permissions.financeB):
        raise DeepError("MEETING_FINANCE_NOT_SHARED")
    if result.get("status") != "ready":
        raise DeepError("MEETING_REPORT_NOT_READY")
    try:
        return _project(result)
    except (ValidationError, KeyError, TypeError, ValueError):
        # Do not attach provider-bound inputs or original validation messages to logs/errors.
        raise DeepError("MEETING_EVIDENCE_INVALID") from None
