from tests.integration.test_deep_sessions import headers
from tests.integration.test_deep_v3 import ready, start


def test_condition_guides_point_to_the_actual_decision_domain():
    from deep.meeting.guide import _direction
    assert _direction({'code': 'CONDITION_EXCEEDED'})[0] == 'housingFunding'
    assert _direction({'code': 'BORROWING_CONDITION'})[0] == 'debt'
    assert _direction({'code': 'CONDITION_NEEDS_DISCUSSION'})[0] == 'other'


def test_guide_is_read_only_and_available_without_ai_consent(deep_context):
    client, _, db = deep_context
    path, _ = ready(client)
    version = db['deep_sessions'].documents[0]['version']
    response = client.get(path + '/meeting/guide')
    assert response.status_code == 200, response.text
    guide = response.json()
    assert guide['status'] == 'ready' and guide['decisions'] == []
    assert guide['priorityIds'] == [row['id'] for row in guide['topics'][:3]]
    assert [(row['code'], row.get('area')) for row in guide['topics'][:3]] == [
        (row['code'], row.get('area')) for row in guide['report']['topics']]
    assert any(row['decisionTopic'] == 'monthlyContribution' for row in guide['topics'])
    assert all(row['whyItMatters'] and row['answerTargets'] for row in guide['topics'])
    assert 'SECRET-PRIVATE-NOTE' not in response.text
    assert db['deep_sessions'].documents[0]['version'] == version
    assert not db['deep_meeting_attempts'].documents


def test_guide_keeps_all_issues_and_respects_partial_sharing(deep_context):
    client, _, _ = deep_context
    path, report = ready(client, finance=False, values=True)
    response = client.get(path + '/meeting/guide')
    assert response.status_code == 200, response.text
    guide = response.json()
    assert all(row['code'] == 'VALUE_DIFFERENCE' for row in guide['topics'])
    assert guide['report']['planning']['data'] is None
    assert 'contribution_gap' not in response.text
    assert guide['report'] == report['report']


def test_guide_waiting_and_nonmember_do_not_reveal_questions(deep_context):
    client, _, _ = deep_context
    path = start(client)
    assert client.get(path + '/meeting/guide').json() == {'status': 'waiting'}
    assert client.get(path + '/meeting/guide', headers=headers('outsider')).status_code == 404


def test_guide_connects_existing_decision_lifecycle_without_auto_agreement(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client)
    response = client.post(path + '/agreements', headers=headers(), json={
        'expectedRound': 1, 'text': '공동비를 함께 확인합니다.', 'reviewOn': '2026-11-30',
        'terms': {'topic': 'monthlyContribution', 'scope': '함께 쓰는 생활비', 'owner': 'both',
                  'startMonth': '2026-10', 'dueDay': 25, 'monthlyContributions': {'A': 1000000, 'B': 1000000},
                  'commonScope': ['housing', 'food'], 'exceptions': '다음 달 다시 확인합니다.'}})
    assert response.status_code == 201, response.text
    agreement = response.json()
    url = path + '/agreements/' + agreement['id']
    for user, expected in [('user-a', 'proposed'), ('user-b', 'agreed')]:
        assert client.post(url + '/confirm', headers=headers(user), json={'expectedVersion': 1}).status_code == 200
        guide_response = client.get(path + '/meeting/guide')
        assert guide_response.status_code == 200, guide_response.text
        guide = guide_response.json()
        assert guide['decisions'][0]['status'] == expected
        assert guide['decisions'][0]['reviewOn'] == '2026-11-30'
        assert agreement['id'] in next(row['relatedAgreementIds'] for row in guide['topics'] if row['decisionTopic'] == 'monthlyContribution')
    edited = client.patch(url, headers=headers(), json={'expectedVersion': 1, 'text': '예외를 변경합니다.',
                           'reviewOn': '2026-12-01', 'terms': agreement['terms']})
    assert edited.status_code == 200, edited.text
    decision = client.get(path + '/meeting/guide').json()['decisions'][0]
    assert decision['status'] == 'proposed' and not decision['myConfirmed'] and not decision['partnerConfirmed']
    assert client.post(url + '/defer', headers=headers(), json={'expectedVersion': 2}).status_code == 200
    assert client.get(path + '/meeting/guide').json()['decisions'][0]['status'] == 'deferred'
