from datetime import date as CalendarDate
from typing import Any, Self, cast, get_args

from pydantic import ValidationError, field_validator, model_validator

from deep.errors import DeepError
from deep.meeting.brief import build_brief
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
from deep.schemas import Money, StrictModel
from deep.v3_models import SharedPlanV3
from deep.v3_report import topic_priority


class _HousingRow(StrictModel):
    date: CalendarDate
    requiredHousingWon: Money | None
    settlementDueWon: Money | None
    confirmedSourceFundingWon: Money
    expectedSourceFundingWon: Money
    availableForHousingWon: SignedMoney | None
    fundingGapWon: Money | None
    includingExpectedGapWon: Money | None

    @field_validator('date', mode='before')
    @classmethod
    def calendar_date_only(cls, value: Any) -> CalendarDate:
        if type(value) is CalendarDate:
            return value
        if not isinstance(value, str) or len(value) != 10:
            raise ValueError('INVALID_CALENDAR_DATE')
        parsed = CalendarDate.fromisoformat(value)
        if parsed.isoformat() != value:
            raise ValueError('INVALID_CALENDAR_DATE')
        return parsed

    @model_validator(mode='after')
    def consistent(self) -> Self:
        available = None if self.settlementDueWon is None else self.confirmedSourceFundingWon - self.settlementDueWon
        gap = None if available is None or self.requiredHousingWon is None else max(0, self.requiredHousingWon - available)
        expected_gap = None if gap is None else max(0, gap - self.expectedSourceFundingWon)
        if (available, gap, expected_gap) != (self.availableForHousingWon, self.fundingGapWon, self.includingExpectedGapWon):
            raise ValueError('INCONSISTENT_HOUSING_EVIDENCE')
        return self


class _Cashflow(StrictModel):
    scenarioMonthlySurplusWon: SignedMoney | None


class _Goal(StrictModel):
    requiredMonthlySavingWon: Money | None
    monthlySavingShortfallWon: Money | None


CODES: dict[IssueId, str] = {
    'housing_gap': 'FUNDING_GAP', 'monthly_deficit': 'MONTHLY_DEFICIT',
    'housing_unknown': 'HOUSING_UNCERTAIN', 'cashflow_unknown': 'CASHFLOW_UNCERTAIN', 'goal_unknown': 'GOAL_UNCERTAIN',
    'contribution_unknown': 'CONTRIBUTION_UNKNOWN', 'contribution_gap': 'CONTRIBUTION_GAP',
    'condition_discussion': 'CONDITION_NEEDS_DISCUSSION', 'goal_saving_gap': 'GOAL_SAVING_GAP',
    'housing_expected': 'EXPECTED_SOURCE', 'excess_contributions': 'EXCESS_CONTRIBUTIONS',
    'expectation_a': 'EXPECTATION_DIFFERENCE', 'expectation_b': 'EXPECTATION_DIFFERENCE',
}


def build_plan_brief(result: dict[str, Any], permissions: MeetingPermissions, plan: dict[str, Any]) -> MeetingBrief:
    # The existing projector validates authorization, version and monthly evidence first.
    if any((result.get('report') or {}).get(key, {}).get('reason') == 'sharing_not_authorized'
           for key in ('housing', 'cashflow', 'goal', 'planning')):
        raise DeepError('MEETING_FINANCE_NOT_SHARED')
    try:
        brief = build_brief(result, permissions)
    except DeepError as error:
        if error.code != 'MEETING_PLANNING_UNAVAILABLE':
            raise
        try:
            shared = SharedPlanV3.model_validate(plan)
            versions = result['report']['versions']
            status = result.get('operatingStatus', {}).get('status')
            brief = MeetingBrief(sourceRound=versions['round'], planVersion=versions['planVersion'], startMonth=shared.startMonth,
                                 commonScope=sorted(shared.commonExpenses), sourceHasAssumptions=True,
                                 agreementStatus=cast(AgreementStatus, status) if status in get_args(AgreementStatus) else 'unknown',
                                 facts=[], issues=[MeetingIssue(id='contribution_unknown', factIds=[])])
        except (ValidationError, KeyError, TypeError, ValueError):
            raise DeepError('MEETING_EVIDENCE_INVALID') from None
    try:
        return _extend(brief, result['report'])
    except (ValidationError, KeyError, TypeError, ValueError):
        raise DeepError('MEETING_EVIDENCE_INVALID') from None


def _extend(brief: MeetingBrief, report: dict[str, Any]) -> MeetingBrief:
    brief.scope = 'sharedPlan'
    facts = {row.id: row.valueWon for row in brief.facts}

    def issue(identifier: IssueId, values: dict[FactId, int | None]) -> None:
        known = {key: value for key, value in values.items() if value is not None}
        facts.update(known)
        brief.issues.append(MeetingIssue(id=identifier, factIds=list(known)))

    housing = report['housing']
    rows = [_HousingRow.model_validate({key: row[key] for key in _HousingRow.model_fields})
            for row in (housing.get('data') or {}).get('timeline', [])]
    rows.sort(key=lambda row: row.date)
    if len({row.date for row in rows}) != len(rows):
        raise ValueError('DUPLICATE_HOUSING_DATE')
    gap = next((row for row in rows if row.fundingGapWon), None)
    if gap is not None:
        brief.housingGapDate = gap.date
        issue('housing_gap', {'housing_required': gap.requiredHousingWon, 'housing_available': gap.availableForHousingWon,
                              'housing_gap': gap.fundingGapWon, 'housing_expected': gap.expectedSourceFundingWon,
                              'housing_gap_with_expected': gap.includingExpectedGapWon})
    if not rows or any(row.fundingGapWon is None for row in rows) or housing['status'] != 'available':
        issue('housing_unknown', {})
    if any(row.expectedSourceFundingWon for row in rows):
        issue('housing_expected', {})
    cash_data = report['cashflow'].get('data') or {}
    cash = _Cashflow.model_validate({'scenarioMonthlySurplusWon': cash_data.get('scenarioMonthlySurplusWon')})
    surplus = cash.scenarioMonthlySurplusWon
    if surplus is None:
        issue('cashflow_unknown', {})
    else:
        facts['monthly_surplus'] = surplus
        if surplus < 0:
            issue('monthly_deficit', {'monthly_surplus': surplus})
    goal_block = report['goal']
    if goal_block.get('reason') != 'no_target':
        data = goal_block.get('data') or {}
        goal = _Goal.model_validate({key: data.get(key) for key in _Goal.model_fields})
        required, shortfall = goal.requiredMonthlySavingWon, goal.monthlySavingShortfallWon
        expected_shortfall = None if required is None or surplus is None else max(0, required - max(0, surplus))
        if shortfall != expected_shortfall:
            raise ValueError('INCONSISTENT_GOAL_EVIDENCE')
        if required is not None:
            facts['goal_required_saving'] = required
        if shortfall is None:
            issue('goal_unknown', {})
        elif shortfall:
            issue('goal_saving_gap', {'goal_required_saving': required, 'goal_saving_gap': shortfall, 'monthly_surplus': surplus})
    if any(row['code'] in {'CONDITION_EXCEEDED', 'CONDITION_NEEDS_DISCUSSION', 'BORROWING_CONDITION'} for row in report['issues']):
        issue('condition_discussion', {})
    brief.sourceHasAssumptions = any(report[key].get('assumptions') for key in ('housing', 'cashflow', 'goal', 'planning'))
    brief.facts = [Fact(id=key, valueWon=value) for key, value in facts.items()]

    def priority(item: MeetingIssue) -> tuple[int, str, int, str]:
        dated = str(brief.housingGapDate) if item.id == 'housing_gap' else brief.startMonth + '-01' if item.id == 'monthly_deficit' else None
        return topic_priority({'code': CODES[item.id], 'date': dated}, [])

    brief.issues.sort(key=priority)
    return brief
