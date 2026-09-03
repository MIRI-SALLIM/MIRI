"""Backend-only end-to-end: real TLS, Uvicorn, cookies and disposable Mongo."""

import asyncio
import json
import os
from contextlib import AsyncExitStack
from datetime import datetime, timezone

import httpx
import pytest

from tests.deep_factory import sample_input, sample_plan
from tests.deep_mongo_support import isolated_deep_database, safe_test_uri
from tests.https_mongo_support import https_backend
from tests.integration.test_deep_v3 import terms
from tests.v3_factory import v3_input, v3_plan

AUTH = '/api/v1/auth/reviewer'
PASSWORDS = ('synthetic-https-password-A', 'synthetic-https-password-B')


async def request(client, method, path, expected=200, **kwargs):
    response = await client.request(method, path, **kwargs)
    assert response.status_code == expected, f'{method} request returned {response.status_code}, expected {expected}'
    return response


async def login(client, role='A', room=None):
    payload = {'username': 'judge-' + role.lower(), 'password': PASSWORDS[0 if role == 'A' else 1]}
    if room:
        payload['roomCode'] = room
    response = await request(client, 'POST', AUTH + '/login', json=payload)
    cookie = response.headers['set-cookie']
    assert 'Secure' in cookie and 'HttpOnly' in cookie and 'SameSite=lax' in cookie and 'Domain=' not in cookie
    assert 'no-store' in response.headers['cache-control']
    return response.json()


@pytest.mark.parametrize('version', ['deep-v2', 'deep-v3'])
@pytest.mark.parametrize('share_finance,share_values', [(True, True), (False, True), (True, False), (False, False)])
def test_reviewer_journey_over_real_https_and_mongo(share_finance, share_values, version):
    async def run():
        async with isolated_deep_database() as db:
            uri = safe_test_uri(os.environ)
            assert uri is not None
            async with https_backend(db.name, uri, PASSWORDS) as (origin, context), AsyncExitStack() as stack:
                clients = [await stack.enter_async_context(httpx.AsyncClient(
                    base_url=origin, verify=context, headers={'Origin': origin}, trust_env=False, timeout=10,
                )) for _ in range(4)]
                a, b, other, anonymous = clients
                await request(anonymous, 'GET', '/api/v1/deep/questions', expected=401,
                              headers={'X-Test-User': 'pretend-user'})
                await request(anonymous, 'POST', AUTH + '/login', expected=403,
                              headers={'Origin': 'https://untrusted.invalid'},
                              json={'username': 'judge-a', 'password': PASSWORDS[0]})
                light = (await request(a, 'POST', '/api/v1/sessions', expected=201,
                                       json={'nickname': 'synthetic-https', 'mode': 'light'})).json()
                light_cookie = a.cookies.get('mrs_participant')
                assert light_cookie and await db['sessions'].find_one({'id': light['id']}) is not None
                info_a = await login(a)
                info_b = await login(b, 'B', info_a['roomCode'])
                await login(other)
                assert info_a['userId'] != info_b['userId']
                assert (await request(a, 'GET', AUTH + '/context')).json() == info_a
                assert a.cookies.get('mrs_participant') == light_cookie
                questions = (await request(a, 'GET', '/api/v1/deep/questions')).json()
                assert len(questions['questions']) == 10

                base = '/api/v1/deep/v3' if version == 'deep-v3' else '/api/v1/deep'
                created = (await request(a, 'POST', base + '/sessions', expected=201, json={},
                                         headers={'Idempotency-Key': 'https-create'})).json()
                assert created['questionVersion'] == version
                path = base + '/sessions/' + created['id']
                invitation = base + '/invitations/' + created['invitationCode'] + '/join'
                await request(other, 'POST', invitation, expected=404, json={},
                              headers={'Idempotency-Key': 'https-other'})
                await request(b, 'POST', invitation, json={}, headers={'Idempotency-Key': 'https-join'})
                await request(other, 'GET', path + '/result', expected=404)
                for client, sentinel, value in ((a, 'private-note-A', 2), (b, 'private-note-B', 4)):
                    data = v3_input() if version == 'deep-v3' else sample_input()
                    data['contextNotes'] = {'D1': sentinel}
                    data['values'] = {f'D{i}': value for i in range(1, 11)}
                    await request(client, 'PATCH', path + '/me/input', json={'expectedRevision': 0, 'input': data})
                    await request(client, 'PATCH', path + '/me/input', expected=409,
                                  json={'expectedRevision': 0, 'input': data})
                own_a = (await request(a, 'GET', path + '/me/input')).text
                assert 'private-note-A' in own_a and 'private-note-B' not in own_a
                if version == 'deep-v3':
                    catalog = (await request(a, 'GET', path + '/me/questions')).json()
                    assert len(catalog['planningQuestions']) == 6
                    assert 'private-note-B' not in json.dumps(catalog)
                plan = (await request(a, 'GET', path + '/plan')).json()
                saved = (await request(a, 'PATCH', path + '/plan',
                                       json={'expectedVersion': plan['version'], 'plan': v3_plan() if version == 'deep-v3' else sample_plan()})).json()
                plan_version = saved['version']
                for client in (a, b):
                    await request(client, 'POST', path + '/plan/confirm', json={'planVersion': plan_version})
                submission = {'expectedRevision': 1, 'planVersion': plan_version,
                              'consentVersion': 'deep-sharing-v2' if version == 'deep-v3' else 'deep-sharing-v1',
                              'shareFinance': True, 'shareValues': True}
                await request(a, 'POST', path + '/me/submit', json=submission)
                waiting = (await request(a, 'GET', path + '/result')).json()
                assert waiting == {'status': 'waiting', 'partnerCompleted': False}
                await request(b, 'POST', path + '/me/submit',
                              json={**submission, 'shareFinance': share_finance, 'shareValues': share_values})
                result = (await request(a, 'GET', path + '/result')).json()
                assert result['status'] == 'ready'
                assert (await request(b, 'GET', path + '/result')).json() == result
                report = result['report']
                assert 'private-note-' not in json.dumps(result)
                for name, allowed in (('cashflow', share_finance), ('values', share_values)):
                    if allowed:
                        assert report[name]['status'] == 'available'
                    else:
                        assert report[name]['status'] == 'unavailable'
                        assert report[name]['reason'] == 'sharing_not_authorized' and report[name]['data'] is None
                if not share_finance:
                    assert all(report[name]['reason'] == 'sharing_not_authorized' for name in ('housing', 'goal'))
                if not share_values and (version == 'deep-v2' or not share_finance):
                    assert report['topics'] == []
                else:
                    assert 1 <= len(report['topics']) <= 3
                stored = await db['deep_reports'].find_one({'sessionId': created['id']})
                assert stored is not None
                assert stored['expiresAt'] <= datetime.fromisoformat(info_a['expiresAt'].replace('Z', '+00:00'))

                payload = {'expectedRound': 1, 'text': '매월 공동 생활비를 함께 점검한다'}
                if version == 'deep-v3':
                    payload['terms'] = terms()
                    if share_finance:
                        assert report['planning']['data']['contributionGapWon'] == 400000
                    else:
                        assert report['planning']['data'] is None
                agreement = (await request(a, 'POST', path + '/agreements', expected=201, json=payload)).json()
                for client in (a, b):
                    confirmed = (await request(client, 'POST', path + '/agreements/' + agreement['id'] + '/confirm',
                                               json={'expectedVersion': agreement['version']})).json()
                assert confirmed['status'] == 'agreed'
                if version == 'deep-v3':
                    agreed = (await request(a, 'GET', path + '/result')).json()
                    assert agreed['report'] == report
                    assert agreed['operatingStatus']['status'] == 'agreed'
                    assert agreed['operatingStatus']['contributionGapWon'] == (0 if share_finance else None)
                    edited = (await request(a, 'PATCH', path + '/agreements/' + agreement['id'],
                                            json={'expectedVersion': agreement['version'], 'text': '분담액 재검토', 'terms': terms(900000)})).json()
                    assert not edited['myConfirmed'] and not edited['partnerConfirmed']
                    assert edited['version'] == agreement['version'] + 1
                for client in (a, b):
                    await request(client, 'POST', path + '/rounds', json={'expectedRound': 1})
                assert (await request(a, 'GET', path + '/rounds')).json()['round'] == 2
                old_a, old_b = a.cookies.get('mrs_account'), b.cookies.get('mrs_account')
                renewed = (await request(a, 'POST', AUTH + '/reset', json={'confirm': True})).json()
                assert renewed['roomCode'] != info_a['roomCode']
                await request(b, 'GET', '/api/v1/auth/me', expected=401)
                for token in (old_a, old_b):
                    await request(anonymous, 'GET', path + '/result', expected=401,
                                  headers={'Cookie': 'mrs_account=' + str(token)})
                await request(a, 'GET', path + '/result', expected=404)
                await request(other, 'GET', AUTH + '/context')
                assert (await request(a, 'GET', '/api/v1/me/session')).json()['id'] == light['id']
                assert a.cookies.get('mrs_participant') == light_cookie
                old_room = await db['reviewer_rooms'].find_one({'users.A': info_a['userId']})
                assert old_room is not None and old_room['status'] == 'closed'
                assert old_room['expiresAt'] > datetime.now(timezone.utc)
                # Reset revokes access immediately; approved retention is TTL, not hard deletion.
                # Old-token/new-room reads were denied above. Retained artifacts may not
                # outlive the old review room's logical expiration.
                for name in ('deep_reports', 'deep_agreements'):
                    artifacts = await db[name].find({'sessionId': created['id']}).to_list(length=None)
                    assert all(artifact['expiresAt'] <= old_room['expiresAt'] for artifact in artifacts)

    asyncio.run(run())
