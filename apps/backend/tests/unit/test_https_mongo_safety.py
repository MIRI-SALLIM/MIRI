import pytest

from auth.passwords import verify_password

NAME = 'mirisalim_deep_test_' + 'a' * 32
PASSWORDS = ('synthetic-https-password-A', 'synthetic-https-password-B')


def test_https_child_cannot_inherit_production_configuration():
    from tests.https_mongo_support import server_environment

    env = server_environment('https://127.0.0.1:8443', NAME, 'mongodb://127.0.0.1:27017', PASSWORDS, {
        'PATH': 'test-path', 'MONGODB_URI': 'mongodb+srv://do-not-contact.example',
        'MONGODB_DB_NAME': 'production', 'GITHUB_TOKEN': 'do-not-inherit',
        'KAKAO_REST_API_KEY': 'do-not-inherit', 'AUTH_SESSION_PEPPER': 'do-not-inherit',
    })
    assert env['PATH'] == 'test-path'
    assert env['MONGODB_URI'] == 'mongodb://127.0.0.1:27017'
    assert env['MONGODB_DATABASE'] == NAME
    assert env['MONGODB_DB_NAME'] == NAME
    assert env['ENVIRONMENT'] == 'production'
    assert env['PUBLIC_APP_ORIGIN'] == env['ALLOWED_ORIGINS'] == 'https://127.0.0.1:8443'
    assert env['PYTHON_DOTENV_DISABLED'] == '1'
    assert env['KAKAO_LOGIN_ENABLED'] == 'false'
    assert env['REVIEWER_LOGIN_ENABLED'] == env['DEEP_MODE_ENABLED'] == 'true'
    assert 'GITHUB_TOKEN' not in env and 'KAKAO_REST_API_KEY' not in env
    assert len(env['AUTH_SESSION_PEPPER']) >= 32 and env['AUTH_SESSION_PEPPER'] != 'do-not-inherit'
    assert verify_password(PASSWORDS[0], env['REVIEWER_A_PASSWORD_HASH'])
    assert verify_password(PASSWORDS[1], env['REVIEWER_B_PASSWORD_HASH'])


@pytest.mark.parametrize('origin,name,uri', [
    ('https://127.0.0.1:8443', 'production', 'mongodb://127.0.0.1:27017'),
    ('https://127.0.0.1:8443', NAME, 'mongodb+srv://do-not-contact.example'),
    ('https://public.example:8443', NAME, 'mongodb://127.0.0.1:27017'),
    ('http://127.0.0.1:8443', NAME, 'mongodb://127.0.0.1:27017'),
    ('https://127.0.0.1:8443/path', NAME, 'mongodb://127.0.0.1:27017'),
    ('https://user@127.0.0.1:8443', NAME, 'mongodb://127.0.0.1:27017'),
    ('https://127.0.0.1:0', NAME, 'mongodb://127.0.0.1:27017'),
])
def test_https_child_rejects_nonisolated_targets(origin, name, uri):
    from tests.https_mongo_support import server_environment

    with pytest.raises(ValueError):
        server_environment(origin, name, uri, PASSWORDS, {})
