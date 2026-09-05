from copy import deepcopy

import pytest

from tests.deep_factory import known
from tests.integration.test_deep_sessions import headers
from tests.integration.test_deep_v3 import ready, start, terms
from tests.v3_factory import v3_input, v3_plan


def ready_with(client, a, b, plan=None):
    path = start(client)
    assert client.patch(path + '/plan', headers=headers(), json={'expectedVersion': 1, 'plan': plan or v3_plan()}).status_code == 200
    for user, data in (('user-a', a), ('user-b', b)):
        assert client.patch(path + '/me/input', headers=headers(user), json={'expectedRevision': 0, 'input': data}).status_code == 200
        assert client.post(path + '/plan/confirm', headers=headers(user), json={'planVersion': 2}).status_code == 200
        assert client.post(path + '/me/submit', headers=headers(user), json={
            'expectedRevision': 1, 'planVersion': 2, 'consentVersion': 'deep-sharing-v2',
            'shareFinance': True, 'shareValues': True}).status_code == 200
    assert client.get(path + '/result').json()['status'] == 'ready'
    return path


def preview_body(client, path, **changes):
    reference = client.get(path + '/meeting/guide').json()['reference']
    proposal = {'commonScope': ['food', 'housing'], 'startMonth': '2026-10',
                'budgetWon': 2000000, 'aWon': 1000000, 'bWon': 800000}
    proposal.update(changes)
    return {'expectedRound': reference['round'], 'planVersion': reference['planVersion'],
            'sourceReportId': reference['sourceReportId'], 'proposal': proposal}


def test_preview_compares_server_baseline_without_changing_report_agreements_or_calling_ai(deep_context):
    client, _, db = deep_context
    path, original = ready(client)
    before = deepcopy(db['deep_sessions'].documents)
    body = preview_body(client, path)
    response = client.post(path + '/meeting/preview', headers=headers(), json=body)
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview['baseline']['aWon'] == 800000
    assert preview['comparison']['baselineGapWon'] == 400000
    assert preview['comparison']['proposalGapWon'] == 200000
    assert preview['nextAction'] == 'propose_agreement'
    assert preview['decisionSeed']['monthlyContributions'] == {'A': 1000000, 'B': 800000}
    assert preview['limits']['B']['status'] == 'unknown'
    body['proposal']['budgetWon'] = 1800000
    adjusted = client.post(path + '/meeting/preview', headers=headers(), json=body).json()
    assert adjusted['comparison']['proposalGapWon'] == 0
    assert adjusted['nextAction'] == 'revise_plan'
    assert adjusted['decisionSeed'] is None
    assert adjusted['unchangedCalculations']['cashflow'] == original['report']['cashflow']
    assert adjusted['unchangedCalculations']['housing'] == original['report']['housing']
    assert db['deep_sessions'].documents == before
    assert client.get(path + '/result').json() == original
    assert not db['deep_agreements'].documents
    assert not db['deep_meeting_attempts'].documents


@pytest.mark.parametrize('change', [{'commonScope': ['food']}, {'startMonth': '2026-11'}])
def test_preview_never_compares_different_scope_or_month(deep_context, change):
    client, _, _ = deep_context
    path, _ = ready(client)
    response = client.post(path + '/meeting/preview', headers=headers(), json=preview_body(client, path, **change))
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['comparison']['status'] == 'unavailable'
    assert data['comparison']['proposalGapWon'] is None
    assert data['nextAction'] == 'revise_plan' and data['decisionSeed'] is None


def test_preview_preserves_unknown_versus_zero_and_rejects_unsafe_amounts(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client)
    body = preview_body(client, path, aWon=None)
    result = client.post(path + '/meeting/preview', headers=headers(), json=body).json()
    assert result['comparison']['status'] == 'partial'
    assert result['comparison']['proposalGapWon'] is None
    assert result['nextAction'] == 'complete_numbers' and result['decisionSeed'] is None
    body['proposal']['aWon'] = 0
    result = client.post(path + '/meeting/preview', headers=headers(), json=body).json()
    assert result['comparison']['proposalGapWon'] == 1200000
    for invalid in (-1, True, 2**53 - 1):
        body['proposal']['aWon'] = invalid
        assert client.post(path + '/meeting/preview', headers=headers(), json=body).status_code == 422
    body = preview_body(client, path)
    body['baseline'] = body['proposal']
    assert client.post(path + '/meeting/preview', headers=headers(), json=body).status_code == 422


def test_preview_missing_budget_is_incomplete_not_a_request_to_erase_the_plan(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client)
    response = client.post(path + '/meeting/preview', headers=headers(), json=preview_body(client, path, budgetWon=None))
    assert response.status_code == 200, response.text
    assert response.json()['nextAction'] == 'complete_numbers'
    assert response.json()['decisionSeed'] is None


def test_preview_points_to_new_round_when_only_immutable_baseline_has_missing_numbers(deep_context):
    client, _, _ = deep_context
    a = v3_input()
    a['contribution']['ownMonthly'] = {'status': 'unknown'}
    path = ready_with(client, a, v3_input())
    response = client.post(path + '/meeting/preview', headers=headers(), json=preview_body(client, path))
    assert response.status_code == 200, response.text
    assert response.json()['comparison']['status'] == 'partial'
    assert response.json()['comparison']['baselineGapWon'] is None
    assert response.json()['comparison']['proposalGapWon'] == 200000
    assert response.json()['nextAction'] == 'revise_inputs'
    assert response.json()['decisionSeed'] is None


@pytest.mark.parametrize('field,value,code', [
    ('expectedRound', 99, 'ROUND_VERSION_CONFLICT'),
    ('planVersion', 99, 'PLAN_VERSION_CONFLICT'),
    ('sourceReportId', 'stale', 'ROUND_VERSION_CONFLICT'),
])
def test_preview_rejects_stale_reference(deep_context, field, value, code):
    client, _, _ = deep_context
    path, _ = ready(client)
    body = preview_body(client, path)
    body[field] = value
    response = client.post(path + '/meeting/preview', headers=headers(), json=body)
    assert response.status_code == 409
    assert response.json()['error']['code'] == code


def test_preview_respects_member_finance_and_origin_boundaries(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client, finance=False)
    guide = client.get(path + '/meeting/guide').json()
    assert guide['personalNeeds'] is None
    body = preview_body(client, path)
    denied = client.post(path + '/meeting/preview', headers=headers(), json=body)
    assert denied.status_code == 409
    assert denied.json()['error']['code'] == 'MEETING_FINANCE_NOT_SHARED'
    assert client.post(path + '/meeting/preview', headers=headers('outsider'), json=body).status_code == 404
    assert client.get(path + '/meeting/standards', headers=headers('outsider')).status_code == 404
    assert client.post(path + '/meeting/preview', headers={**headers(), 'Origin': 'https://untrusted.example'}, json=body).status_code == 403
    assert all(row['code'] == 'VALUE_DIFFERENCE' for row in guide['topics'])


def test_preview_checks_only_current_partner_shared_limits_without_ai_consent(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client)
    completion = {
        'expectedRound': 1, 'planVersion': 2, 'expectedRevision': 0,
        'answers': {'contributionMeaning': 'selfReportedLimit'},
        'consentVersion': 'money-meeting-consent-v3', 'shareWithPartner': True, 'allowAiProcessing': False}
    response = client.post(path + '/meeting/complete', headers=headers(), json=completion)
    assert response.status_code == 200, response.text
    body = preview_body(client, path)
    unshared = client.post(path + '/meeting/preview', headers=headers('user-b'), json=body).json()
    assert unshared['limits']['A']['status'] == 'unknown'
    assert unshared['limits']['A']['limitWon'] is None
    assert client.post(path + '/meeting/complete', headers=headers('user-b'), json=completion).status_code == 200
    response = client.post(path + '/meeting/preview', headers=headers('user-b'), json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['limits']['A'] == {'status': 'exceeds', 'limitWon': 800000, 'excessWon': 200000}
    assert result['nextAction'] == 'review_limits' and result['decisionSeed'] is None
    assert client.delete(path + '/meeting/me/consent', headers=headers()).status_code == 200
    result = client.post(path + '/meeting/preview', headers=headers('user-b'), json=body).json()
    assert result['limits']['A'] == {'status': 'unknown', 'limitWon': None, 'excessWon': None}
    assert result['limits']['B'] == {'status': 'unknown', 'limitWon': None, 'excessWon': None}


def test_preview_preserves_estimated_baseline_evidence(deep_context):
    client, _, _ = deep_context
    a = v3_input()
    a['contribution']['ownMonthly']['precision'] = 'estimate'
    path = ready_with(client, a, v3_input())
    response = client.post(path + '/meeting/preview', headers=headers(), json=preview_body(client, path))
    assert response.status_code == 200, response.text
    assert any('A.ownMonthly' in item and '추정' in item for item in response.json()['baselineAssumptions'])


@pytest.mark.parametrize('unsafe', [False, True])
def test_preview_unavailable_baseline_does_not_return_server_error(deep_context, unsafe):
    client, _, _ = deep_context
    a, b, plan = v3_input(), v3_input(), v3_plan()
    if unsafe:
        a['contribution']['ownMonthly'] = known(2**53 - 1)
        b['contribution']['ownMonthly'] = known(2**53 - 1)
    else:
        plan.update(commonExpenses={}, commonExpensesStatus='unknown')
    path = ready_with(client, a, b, plan)
    response = client.post(path + '/meeting/preview', headers=headers(), json=preview_body(client, path))
    assert response.status_code == 409
    assert response.json()['error']['code'] == 'MEETING_BUDGET_NOT_READY'


def test_preview_rechecks_session_after_read_and_rejects_withdrawn_data(deep_context, monkeypatch):
    from datetime import datetime, timezone

    client, repo, _ = deep_context
    path, _ = ready(client)
    body = preview_body(client, path)
    original = repo.load_report_for_member

    async def withdraw_after_read(session_id, user_id, now):
        report = await original(session_id, user_id, now)
        await repo.withdraw(session_id, 'user-b', datetime.now(timezone.utc))
        return report

    monkeypatch.setattr(repo, 'load_report_for_member', withdraw_after_read)
    response = client.post(path + '/meeting/preview', headers=headers(), json=body)
    assert response.status_code == 410
    assert 'baseline' not in response.json()


def test_guide_reuses_personal_needs_and_perception_without_double_deducting_or_declaring_conflict(deep_context):
    client, _, _ = deep_context
    a, b = v3_input(), v3_input()
    a['contribution'].update(personalSpendingFloor=known(300000), personalSavingFloor=known(200000), discussionState='believeAgreed')
    b['contribution'].update(personalSpendingFloor={'status': 'withheld'}, personalSavingFloor=known(0), discussionState='discussing')
    path = ready_with(client, a, b)
    report = client.get(path + '/result').json()['report']
    guide = client.get(path + '/meeting/guide').json()
    assert guide['personalNeeds']['A']['personalSpendingFloor']['value'] == 300000
    assert guide['personalNeeds']['B']['personalSpendingFloor']['status'] == 'withheld'
    assert guide['personalNeeds']['B']['personalSavingFloor']['value'] == 0
    difference = next(row for row in guide['topics'] if row['code'] == 'DISCUSSION_PERCEPTION_DIFFERENCE')
    assert difference['decisionTopic'] == 'monthlyContribution'
    assert difference['evidence']['states'] == {'A': 'believeAgreed', 'B': 'discussing'}
    assert any(row['code'] == 'PERSONAL_NEEDS_REVIEW' for row in guide['topics'])
    assert guide['operatingStatus']['status'] == 'notProposed'
    assert guide['report'] == report
    assert report['cashflow']['data']['scenarioMonthlySurplusWon'] == 5000000


def test_same_perception_is_not_a_mutual_confirmation(deep_context):
    client, _, _ = deep_context
    a = v3_input()
    a['contribution']['discussionState'] = 'believeAgreed'
    path = ready_with(client, a, deepcopy(a))
    guide = client.get(path + '/meeting/guide').json()
    assert not any(row['code'] == 'DISCUSSION_PERCEPTION_DIFFERENCE' for row in guide['topics'])
    assert guide['decisions'] == []
    assert client.get(path + '/meeting/standards').json()['confirmed'] == []


def test_standards_retains_decision_lifecycle_review_dates_and_unresolved_questions(deep_context):
    client, _, db = deep_context
    path, original = ready(client)
    created = client.post(path + '/agreements', headers=headers(), json={
        'expectedRound': 1, 'text': '주거비와 식비 기준', 'terms': terms(), 'reviewOn': '2026-11-30'}).json()
    url = path + '/agreements/' + created['id']
    for user in ('user-a', 'user-b'):
        assert client.post(url + '/confirm', headers=headers(user), json={'expectedVersion': 1}).status_code == 200
    before = deepcopy(db['deep_sessions'].documents)
    response = client.get(path + '/meeting/standards')
    assert response.status_code == 200, response.text
    summary = response.json()
    assert summary['confirmed'][0]['terms'] == terms()
    assert summary['proposed'] == summary['deferred'] == []
    assert summary['nextReviewOn'] == '2026-11-30'
    assert summary['operatingStatus']['contributionGapWon'] == 0
    assert summary['submittedContributionGapWon'] == 400000
    assert summary['discussionItems']  # Matching topic alone is not issue resolution.
    assert db['deep_sessions'].documents == before
    preview = client.post(path + '/meeting/preview', headers=headers(), json=preview_body(client, path)).json()
    assert preview['nextAction'] == 'review_agreements'
    assert preview['existingDecisions'][0]['id'] == created['id']
    assert preview['existingDecisions'][0]['version'] == 1
    edited = client.patch(url, headers=headers(), json={
        'expectedVersion': 1, 'text': '분담 수정', 'terms': terms(900000), 'reviewOn': '2026-12-01'})
    assert edited.status_code == 200
    summary = client.get(path + '/meeting/standards').json()
    assert summary['confirmed'] == [] and summary['proposed'][0]['version'] == 2
    assert not summary['proposed'][0]['myConfirmed'] and not summary['proposed'][0]['partnerConfirmed']
    assert summary['nextReviewOn'] is None
    assert client.post(url + '/defer', headers=headers(), json={'expectedVersion': 2}).status_code == 200
    summary = client.get(path + '/meeting/standards').json()
    assert summary['proposed'] == [] and summary['deferred'][0]['reviewOn'] == '2026-12-01'
    assert client.get(path + '/result').json()['report'] == original['report']
    for user in ('user-a', 'user-b'):
        assert client.post(path + '/rounds', headers=headers(user), json={'expectedRound': 1}).status_code == 200
    assert client.get(path + '/meeting/standards').json() == {'status': 'waiting'}
