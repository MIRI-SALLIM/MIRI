from tests.integration.test_deep_sessions import headers
from tests.integration.test_meeting_completion import (
    completion as completion,  # noqa: PLC0414 -- exported pytest fixture
)
from tests.integration.test_meeting_completion import completion_body


def test_legacy_consent_stays_monthly_and_mixed_versions_wait(completion):
    client, _, _, path, calls = completion
    assert client.post(path + '/meeting/complete', headers=headers(), json=completion_body()).status_code == 200
    response = client.post(path + '/meeting/complete', headers=headers('user-b'),
                           json=completion_body(consentVersion='money-meeting-consent-v3'))
    assert response.status_code == 200, response.text
    assert response.json()['explanation'] == {'status': 'waiting'} and not calls
    assert client.get(path + '/meeting/me').json()['consent']['consentVersion'] == 'money-meeting-consent-v2'
    response = client.post(path + '/meeting/complete', headers=headers('user-b'), json=completion_body(expectedRevision=1))
    assert response.json()['explanation']['brief']['scope'] == 'monthly' and len(calls) == 1


def test_extended_requires_explicit_activation_then_reuses_single_generation(completion, monkeypatch):
    client, _, db, path, calls = completion
    for user in ('user-a', 'user-b'):
        response = client.post(path + '/meeting/complete', headers=headers(user), json=completion_body(consentVersion='money-meeting-consent-v3'))
        assert response.status_code == 200, response.text
    assert response.json()['explanation']['brief']['scope'] == 'sharedPlan'
    assert response.json()['explanation']['source'] == 'template' and not calls
    assert not db['deep_meeting_attempts'].documents
    monkeypatch.setenv('DEEP_MEETING_AI_EXTENDED_ENABLED', 'true')
    response = client.post(path + '/meeting/complete', headers=headers(), json=completion_body(expectedRevision=1, consentVersion='money-meeting-consent-v3'))
    assert response.json()['explanation']['source'] == 'ai' and len(calls) == 1
    assert client.get(path + '/meeting/explanation').json()['source'] == 'ai' and len(calls) == 1
    assert client.delete(path + '/meeting/me/consent', headers=headers()).status_code == 200
    assert client.get(path + '/meeting/explanation').json() == {'status': 'waiting'}


def test_legacy_generation_endpoint_cannot_bypass_extended_total_budget(completion, monkeypatch):
    client, _, _, path, calls = completion
    monkeypatch.setenv('DEEP_MEETING_AI_EXTENDED_ENABLED', 'true')
    monkeypatch.delenv('DEEP_MEETING_AI_TOTAL_MICRO_USD')
    monkeypatch.delenv('DEEP_MEETING_AI_PRIOR_MICRO_USD')
    for user in ('user-a', 'user-b'):
        response = client.post(path + '/meeting/complete', headers=headers(user), json=completion_body(consentVersion='money-meeting-consent-v3'))
        assert response.status_code == 200, response.text
    assert client.post(path + '/meeting/explanation', headers=headers()).json()['reason'] == 'budget_exhausted'
    assert not calls
