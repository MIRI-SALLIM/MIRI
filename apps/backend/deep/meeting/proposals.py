from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from pydantic import Field, StrictInt

from deep.errors import DeepError
from deep.meeting.comparison import compare_budgets
from deep.meeting.contracts import SUPPORTED_CONSENT_VERSIONS
from deep.meeting.models import BudgetComparison, BudgetOption
from deep.meeting.planning_context import (
    MeetingReference,
    SharedPersonalNeeds,
    planning_context,
    reference,
)
from deep.meeting.storage import meeting_state, require_ready
from deep.schemas import CalculationBlock, Money, StrictModel
from deep.service import DeepService
from deep.v3_models import AgreementResponseV3, DecisionTerms
from deep.v3_report import result_with_agreements


class PreviewRequest(StrictModel):
    expectedRound: Annotated[StrictInt, Field(ge=1)]
    planVersion: Annotated[StrictInt, Field(ge=1)]
    sourceReportId: str = Field(min_length=1, max_length=200)
    proposal: BudgetOption


class LimitReview(StrictModel):
    status: Literal['unknown', 'within', 'exceeds'] = 'unknown'
    limitWon: Money | None = None
    excessWon: Money | None = None


class SharedLimitReview(StrictModel):
    A: LimitReview
    B: LimitReview


class UnchangedCalculations(StrictModel):
    cashflow: CalculationBlock
    housing: CalculationBlock
    goal: CalculationBlock


class ProposalPreview(StrictModel):
    reference: MeetingReference
    baseline: BudgetOption
    baselineAssumptions: list[str]
    baselineMissingFields: list[str]
    proposal: BudgetOption
    comparison: BudgetComparison
    personalNeeds: SharedPersonalNeeds | None
    limits: SharedLimitReview
    existingDecisions: list[AgreementResponseV3]
    operatingStatus: dict[str, Any]
    unchangedCalculations: UnchangedCalculations
    nextAction: Literal['revise_plan', 'revise_inputs', 'complete_numbers', 'review_limits', 'review_agreements', 'propose_agreement']
    decisionSeed: DecisionTerms | None
    notice: str


def _limits(document: dict[str, Any], proposal: BudgetOption) -> dict[str, LimitReview]:
    state = meeting_state(document)
    members = state['members']
    if (not all(member['answers'] is not None and member['consent']
                and member['consent'].get('consentVersion') in SUPPORTED_CONSENT_VERSIONS
                and member['consent'].get('shareWithPartner') is True for member in members.values())
            or members['A']['consent']['consentVersion'] != members['B']['consent']['consentVersion']):
        return {role: LimitReview() for role in ('A', 'B')}
    reviews = {}
    for role, amount in (('A', proposal.aWon), ('B', proposal.bWon)):
        member = state['members'][role]
        consent, answers = member['consent'] or {}, member['answers'] or {}
        limit = None
        if consent.get('consentVersion') in SUPPORTED_CONSENT_VERSIONS and consent.get('shareWithPartner') is True:
            if answers.get('contributionMeaning') == 'selfReportedLimit':
                limit = document['members'][role]['input']['contribution']['ownMonthly']['value']
            elif answers.get('contributionMeaning') == 'initialProposal':
                limit = answers.get('adjustableMonthlyWon')
        if limit is None or amount is None:
            reviews[role] = LimitReview(limitWon=limit)
        else:
            reviews[role] = LimitReview(status='exceeds' if amount > limit else 'within',
                                        limitWon=limit, excessWon=max(0, amount - limit))
    return reviews


async def preview_proposal(service: DeepService, session_id: str, user_id: str, body: PreviewRequest) -> dict[str, Any]:
    before = await service.repo.get_for_member(session_id, user_id, datetime.now(timezone.utc))
    require_ready(before, datetime.now(timezone.utc))
    if body.expectedRound != before['round'] or body.sourceReportId != before['reportId']:
        raise DeepError('ROUND_VERSION_CONFLICT')
    if body.planVersion != before['plan']['version']:
        raise DeepError('PLAN_VERSION_CONFLICT')
    result = await result_with_agreements(service, session_id, user_id)
    after = await service.repo.get_for_member(session_id, user_id, datetime.now(timezone.utc))
    require_ready(after, datetime.now(timezone.utc))
    if before['version'] != after['version']:
        raise DeepError('REVISION_CONFLICT')
    if result['status'] != 'ready':
        raise DeepError('MEETING_REPORT_NOT_READY')
    report = result['report']
    planning = report['planning'].get('data') or {}
    if not planning.get('commonScope'):
        raise DeepError('MEETING_BUDGET_NOT_READY')
    baseline = BudgetOption(commonScope=planning['commonScope'], startMonth=planning['startMonth'],
                            budgetWon=planning['commonBudgetWon'],
                            aWon=planning['ownContributionsWon']['A'], bWon=planning['ownContributionsWon']['B'])
    proposal = body.proposal
    comparison = compare_budgets(baseline, proposal)
    limits = _limits(after, proposal)
    existing = [row for row in result['agreements'] if row['terms']['topic'] == 'monthlyContribution']
    seed = None
    changed_plan = (set(baseline.commonScope) != set(proposal.commonScope)
                    or baseline.startMonth != proposal.startMonth
                    or (proposal.budgetWon is not None and baseline.budgetWon != proposal.budgetWon))
    if changed_plan:
        action = 'revise_plan'
    elif comparison.status != 'available':
        action = 'complete_numbers' if None in (proposal.budgetWon, proposal.aWon, proposal.bWon) else 'revise_inputs'
    elif any(review.status == 'exceeds' for review in limits.values()):
        action = 'review_limits'
    else:
        action = 'review_agreements' if existing else 'propose_agreement'
        labels = {'housing': '주거비', 'food': '식비', 'transport': '교통비',
                  'subscriptions': '구독료', 'gifts': '경조사비', 'other': '기타 공동비'}
        seed = {'topic': 'monthlyContribution', 'scope': ' · '.join(labels[key] for key in proposal.commonScope),
                'owner': 'both', 'startMonth': proposal.startMonth, 'commonScope': proposal.commonScope,
                'monthlyContributions': {'A': proposal.aWon, 'B': proposal.bWon}}
    needs, _ = planning_context(after)
    return {'reference': reference(after), 'baseline': baseline, 'proposal': proposal, 'comparison': comparison,
            'baselineAssumptions': report['planning']['assumptions'],
            'baselineMissingFields': report['planning']['missingFields'],
            'personalNeeds': needs, 'limits': limits, 'existingDecisions': existing,
            'operatingStatus': result['operatingStatus'],
            'unchangedCalculations': {key: report[key] for key in ('cashflow', 'housing', 'goal')},
            'nextAction': action, 'decisionSeed': seed,
            'notice': '입력 당시 원안과 비교한 미리보기입니다. 분담 공백이 없어도 월 적자·주거자금·목표 부족이 해소되는 것은 아닙니다. 개인비·저축은 중복 차감하지 않았습니다. 상한 미정은 추가 여력이 있다는 뜻이 아니며, 상한 이내도 지급 능력이나 동의가 아닙니다. 예산·항목·시작월 변경은 새 라운드에서 확인하고, 분담 제안은 기존 기준표를 확인한 뒤 양쪽이 직접 확정하세요.'}
