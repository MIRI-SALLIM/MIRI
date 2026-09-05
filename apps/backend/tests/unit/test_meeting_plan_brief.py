import json
from copy import deepcopy
from importlib import import_module

import pytest

from deep.errors import DeepError
from deep.meeting.explanation import validate_grounding
from deep.meeting.models import ExplanationDraft
from deep.meeting.provider import request_body
from deep.meeting.templates import template_cards
from tests.meeting_factory import granted, ready_result
from tests.v3_factory import v3_plan


def project(result):
    return import_module('deep.meeting.plan_brief').build_plan_brief(result, granted(), v3_plan())


def extended_result():
    result = ready_result()
    result['report']['housing']['data']['timeline'] = [
        {'date': '2026-10-01', 'requiredHousingWon': 30_000_000, 'settlementDueWon': 0,
         'confirmedSourceFundingWon': 20_000_000, 'expectedSourceFundingWon': 0,
         'availableForHousingWon': 20_000_000, 'fundingGapWon': 10_000_000, 'includingExpectedGapWon': 10_000_000},
        {'date': '2026-11-01', 'requiredHousingWon': 40_000_000, 'settlementDueWon': 0,
         'confirmedSourceFundingWon': 20_000_000, 'expectedSourceFundingWon': 0,
         'availableForHousingWon': 20_000_000, 'fundingGapWon': 20_000_000, 'includingExpectedGapWon': 20_000_000}]
    result['report']['cashflow']['data']['scenarioMonthlySurplusWon'] = -200_000
    result['report']['goal'] = {'status': 'available', 'data': {
        'requiredMonthlySavingWon': 100_000, 'monthlySavingShortfallWon': 100_000},
        'assumptions': [], 'missingFields': []}
    return result


def test_first_dated_gap_is_not_sum_and_all_domains_are_retained():
    result = extended_result()
    brief = project(result)
    facts = {row.id: row.valueWon for row in brief.facts}
    assert brief.scope == 'sharedPlan'
    assert str(brief.housingGapDate) == '2026-10-01'
    assert facts['housing_gap'] == 10_000_000
    assert facts['monthly_surplus'] == -200_000 and facts['goal_saving_gap'] == 100_000
    assert brief.issues[0].id == 'housing_gap'
    assert {row.id for row in brief.issues} >= {'housing_gap', 'monthly_deficit', 'goal_saving_gap', 'contribution_gap'}
    assert len(template_cards(brief)) == 3


@pytest.mark.parametrize('value', [True, '100', 2**53])
def test_invalid_money_is_rejected_without_coercion(value):
    result = extended_result()
    result['report']['cashflow']['data']['scenarioMonthlySurplusWon'] = value
    with pytest.raises(DeepError, match='MEETING_EVIDENCE_INVALID'):
        project(result)


def test_inconsistent_gap_arithmetic_is_rejected():
    result = extended_result()
    result['report']['housing']['data']['timeline'][0]['fundingGapWon'] = 1
    with pytest.raises(DeepError, match='MEETING_EVIDENCE_INVALID'):
        project(result)


def test_unknown_cashflow_and_housing_are_not_zero():
    result = ready_result()
    result['report']['housing'] = {'status': 'unavailable', 'reason': 'housing_payment_schedule_missing', 'data': None}
    result['report']['cashflow']['data']['scenarioMonthlySurplusWon'] = None
    brief = project(result)
    assert {'housing_unknown', 'cashflow_unknown'} <= {row.id for row in brief.issues}
    assert not {'housing_gap', 'monthly_surplus'} & {row.id for row in brief.facts}


def test_projection_does_not_send_raw_notes_or_agreements():
    result = extended_result()
    result['report']['housing']['data']['privateNote'] = 'SECRET-RAW-INPUT'
    result['operatingStatus']['privateNote'] = 'SECRET-RAW-INPUT'
    body = request_body(project(result), {role: {'contributionMeaning': 'unknown'} for role in ('A', 'B')})
    assert 'SECRET-RAW-INPUT' not in json.dumps(body)
    assert 'comparisons' not in body['input'] and 'agreements' not in body['input']


def test_ai_must_start_with_server_priority_not_monthly_issue():
    brief = project(extended_result())
    cards = template_cards(brief)
    assert validate_grounding(ExplanationDraft(cards=cards), brief)
    wrong = deepcopy(cards)
    wrong.reverse()
    with pytest.raises(DeepError, match='MEETING_GROUNDING_INVALID'):
        validate_grounding(ExplanationDraft(cards=wrong), brief)
    with pytest.raises(DeepError, match='MEETING_GROUNDING_INVALID'):
        validate_grounding(ExplanationDraft(cards=cards[:1]), brief)
    missing_core = deepcopy(cards)
    missing_core[0].factIds = missing_core[0].factIds[1:]
    with pytest.raises(DeepError, match='MEETING_GROUNDING_INVALID'):
        validate_grounding(ExplanationDraft(cards=missing_core), brief)


@pytest.mark.parametrize('value', [0, 1780272000, '2026-10-01T00:00:00', '20261001'])
def test_housing_dates_do_not_coerce_timestamps(value):
    result = extended_result()
    result['report']['housing']['data']['timeline'][0]['date'] = value
    with pytest.raises(DeepError, match='MEETING_EVIDENCE_INVALID'):
        project(result)


@pytest.mark.parametrize('block', ['housing', 'cashflow', 'goal', 'planning'])
def test_denied_report_block_cannot_be_expanded(block):
    result = ready_result()
    result['report'][block] = {'status': 'unavailable', 'reason': 'sharing_not_authorized', 'data': None}
    with pytest.raises(DeepError):
        project(result)


@pytest.mark.parametrize('kind', ['sources', 'settlements', 'contribution', 'values'])
def test_real_engine_partial_reports_still_project(kind):
    from tests.v3_factory import v3_input
    a = v3_input()
    if kind in ('sources', 'settlements'):
        a['funding'][kind] = []
        a['funding'][kind + 'Status'] = 'unknown'
    elif kind == 'contribution':
        a['contribution']['ownMonthly'] = {'status': 'unknown'}
    else:
        a['values'] = {}
    brief = project(ready_result(a))
    assert brief.scope == 'sharedPlan'
