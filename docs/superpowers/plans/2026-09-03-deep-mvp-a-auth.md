# Deep MVP A — Kakao Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light 익명 인증과 독립적인 카카오 계정 로그인을 제공한다.

**Architecture:** 서버가 카카오 인증을 완료한 뒤 자체 opaque 로그인 쿠키를 발급한다. OAuth state는 브라우저에 결합하여 일회용으로 소비하고 Mongo에는 비밀 토큰의 HMAC만 저장한다.

**Tech Stack:** 기존 FastAPI/HTTPX/PyMongo, Python 표준 secrets/hmac/hashlib, pytest.

**Spec:** `../specs/2026-09-03-mirisallim-deep-mode-design-draft.md`, [통합 실행 계획](2026-09-03-deep-mvp-implementation.md).

**실행 현황(2026-09-03):** A1~A3 로컬 구현 및 mock 단위/API 회귀 검증. 실제 카카오·Mongo 검증과 커밋은 아직 수행하지 않았다. 아래 체크박스는 외부 검증·커밋까지 포함한 원래 실행 절차이며, 현재 상세 상태는 [중간 인계](../../handoffs/2026-09-03-deep-mvp-ab-progress.md)를 따른다.

## Global Constraints

- 라이트의 기존 익명 참여는 유지한다.
- 딥은 카카오 로그인 필수.
- 초대 코드는 로그인 대체 수단이 아니다.
- OAuth 토큰·인가코드·쿠키·비밀값을 응답 DTO나 로그에 넣지 않는다.
- `DEEP_MODE_ENABLED=false`에서 새 환경 변수 누락이 Light 실행을 막지 않는다.
- 기본 테스트는 운영 MongoDB에 접속하지 않는다.

## A1. 설정·세션 저장소·인증 원칙

**Files:** Create `apps/backend/auth/{__init__,models,settings,repository,security,dependencies}.py`, `apps/backend/tests/unit/test_auth_security.py`, `apps/backend/scripts/test_local.py`; Modify `apps/backend/tests/conftest.py`.

**Interfaces:**

- `Principal(user_id: str, authenticated_at: datetime | None = None)`: frozen dataclass. 실제 조회는 앱 로그인 발급 시각을 함께 반환한다. 클라이언트가 전달한 userId·시각으로 만들지 않는다. None은 최근 재인증으로 인정하지 않는다.
- `AuthSettings`: enabled:bool, public_app_origin:str, rest_api_key:str, client_secret:str, session_pepper:str, secure_cookie:bool. `callback_uri`는 origin + `/api/v1/auth/kakao/callback`.
- `load_auth_settings(environ: Mapping[str,str]) -> AuthSettings`: enabled일 때만 카카오 설정·32자 이상 pepper·운영 HTTPS origin을 검증한다.
- `token_digest(token: str, pepper: str) -> str`, `validate_return_to(path: str) -> str`.
- `AuthRepository(database)` async methods: `ensure_indexes()`, `create_challenge(state_hash, browser_hash, return_to, now)`, `consume_challenge(state_hash, browser_hash, now) -> dict | None`, `upsert_user(kakao_id: str, now) -> Principal`, `issue_session(user_id, token_hash, now)`, `lookup_session(token_hash, now) -> Principal | None`, `revoke_session(token_hash)`, `delete_user(user_id)`.
- `get_auth_service()` 및 `require_account()`는 A2·A3에서 완성하며 테스트에서 FastAPI dependency override가 가능해야 한다. 테스트 fake는 production fallback으로 쓰지 않는다.

- [ ] 실패 테스트 작성:

```python
import pytest
from auth.security import token_digest, validate_return_to

def test_digest_is_not_plaintext_and_depends_on_pepper():
    assert token_digest('token', 'a' * 32) != 'token'
    assert token_digest('token', 'a' * 32) != token_digest('token', 'b' * 32)

@pytest.mark.parametrize('path', ['//evil.test', 'https://evil.test', '/\\evil', '/deep\r\nX: y'])
def test_external_or_malformed_return_path_is_rejected(path):
    with pytest.raises(ValueError):
        validate_return_to(path)
```

- [ ] `python scripts/test_local.py tests/unit/test_auth_security.py -q`가 import 실패하는지 확인한다.
- [ ] 최소 구현의 핵심:

```python
import hashlib
import hmac
from urllib.parse import urlsplit

def token_digest(token: str, pepper: str) -> str:
    return hmac.new(pepper.encode(), token.encode(), hashlib.sha256).hexdigest()

def validate_return_to(path: str) -> str:
    parsed = urlsplit(path)
    valid_path = parsed.path == '/' or parsed.path == '/deep' or parsed.path.startswith('/deep/')
    if (not valid_path or parsed.scheme or parsed.netloc or parsed.fragment
            or '\\' in path or any(ord(c) < 32 for c in path) or '%' in path):
        raise ValueError('INVALID_RETURN_TO')
    return path
```

  초대 복귀는 서버가 만든 `/deep/invite/INV-...`만 사용한다. 임의 URL을 저장하지 않는다.

  `auth_challenges`는 stateHash unique와 expiresAt TTL(10분), browserHash를 저장한다. state·browser secret은 각각 secrets.token_urlsafe(32)로 발급한다. `consume_challenge`는 다음 쿼리로 단 한 번 소비한다.

```python
await collection.find_one_and_delete({
    'stateHash': state_hash, 'browserHash': browser_hash,
    'expiresAt': {'$gt': now},
})
```

  `users`는 `(provider='kakao', providerUserId)` unique, 내부 UUID를 사용한다. `auth_sessions`는 tokenHash unique, userId index, expiresAt TTL(7일)을 둔다. 조회 때 만료·사용자 삭제도 검사한다. 저장소 실패는503이며 메모리로 fallback하지 않는다.

- [ ] digest·returnTo·만료·state 재사용·잘못된 browserHash·disabled 설정 테스트를 실행한다. conftest에서 새 dependency override를 매 테스트 후 초기화한다.
- [ ] 통과 후 대상 파일만 stage하고 `feat(auth): add isolated account session storage`로 커밋한다. 계획 작성 단계에서 커밋하지 않는다.

## A2. 카카오 REST 어댑터와 로그인 교환

**Files:** Create `apps/backend/auth/kakao.py`, `service.py`, `apps/backend/tests/unit/test_kakao_client.py`, `test_auth_service.py`.

**Interfaces:**

- `KakaoClient(http: httpx.AsyncClient, settings: AuthSettings)`.
- `authorization_url(state: str) -> str`.
- `await exchange_identity(code: str) -> str`: 카카오 사용자 ID 문자열만 반환한다.
- `AuthService(repo: AuthRepository, kakao: KakaoClient, settings: AuthSettings)`.
- `await begin_login(return_to: str, now) -> dict`: authorizationUrl, browserToken.
- `await finish_login(code: str, state: str, browser_token: str, now) -> dict`: accountToken, returnTo. 카카오 토큰을 포함하지 않는다.

- [ ] 실패 테스트 작성:

```python
import asyncio
import httpx
from auth.kakao import KakaoClient
from auth.settings import load_auth_settings

def test_kakao_identity_uses_server_exchange_and_returns_only_id():
    seen = []
    def handler(request):
        seen.append(request)
        if request.url.path == '/oauth/token':
            assert b'client_secret=test-secret' in request.content
            return httpx.Response(200, json={'access_token': 'test-access-token'})
        assert request.url.path == '/v2/user/me'
        assert request.headers['authorization'] == 'Bearer test-access-token'
        return httpx.Response(200, json={'id': 12345})
    settings = load_auth_settings({
        'DEEP_MODE_ENABLED': 'true', 'ENVIRONMENT': 'test',
        'PUBLIC_APP_ORIGIN': 'http://testserver',
        'KAKAO_REST_API_KEY': 'test-key', 'KAKAO_CLIENT_SECRET': 'test-secret',
        'AUTH_SESSION_PEPPER': 'x' * 32,
    })
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await KakaoClient(http, settings).exchange_identity('test-code')
    assert asyncio.run(run()) == '12345'
    assert len(seen) == 2
```

- [ ] `python scripts/test_local.py tests/unit/test_kakao_client.py tests/unit/test_auth_service.py -q`에서 실패를 확인한다.
- [ ] 최소 교환 흐름:

```python
response = await self.http.post(
    'https://kauth.kakao.com/oauth/token', timeout=5.0,
    data={'grant_type': 'authorization_code', 'client_id': self.settings.rest_api_key,
          'client_secret': self.settings.client_secret,
          'redirect_uri': self.settings.callback_uri, 'code': code},
)
response.raise_for_status()
access_token = response.json()['access_token']
profile = await self.http.get('https://kapi.kakao.com/v2/user/me', timeout=5.0,
                             headers={'Authorization': f'Bearer {access_token}'})
profile.raise_for_status()
kakao_id = profile.json()['id']
if type(kakao_id) is not int or kakao_id <= 0:
    raise ValueError('INVALID_PROVIDER_IDENTITY')
return str(kakao_id)
```

  외부 예외의 URL·본문을 그대로 노출하지 않고 `AUTH_PROVIDER_UNAVAILABLE` 또는 `AUTH_RESTART_REQUIRED`로 번역한다. 토큰 교환은 자동 재시도하지 않는다. 사용자 조회에 실패하면 앱 로그인 쿠키를 발급하지 않는다.

  finish_login은 browser-bound state 소비 → code 교환 → user upsert → 새 opaque accountToken 발급 순서다. 이메일·프로필·전화번호를 필수로 요구하지 않고 ID만 사용한다. 카카오 access/refresh token은 저장하지 않는다. 동시 신규 로그인에서 unique 충돌이 나면 동일 providerUserId를 재조회한다.

- [ ] state 누락·불일치·만료·재사용, 동의 취소, 외부5xx·timeout, invalid ID, 성공 후 응답에 provider token 없음, 동일 ID 재로그인 시 동일 내부 계정 테스트를 추가하여 통과시킨다.
- [ ] 통과 후 `feat(auth): implement Kakao authorization-code login` 커밋.

카카오 authorize/token/user-me의 endpoint·필수 인자 근거는 [공식 REST API 문서](https://developers.kakao.com/docs/ko/kakaologin/rest-api)다. 이 계획의 자체 쿠키·state 수명·저장 정책은 서비스 설계 선택이다.

## A3. 라우트·계정 인증·Light 분리

**Files:** Create `apps/backend/auth/router.py`, `apps/backend/tests/integration/test_account_auth.py`; Modify `apps/backend/main.py`, `auth/dependencies.py`, `auth/service.py`, `apps/backend/.env.example`.

**Interfaces:**

- GET `/api/v1/auth/kakao/start?returnTo=/deep`:302 + `mrs_oauth_browser` 쿠키(10분).
- GET `/api/v1/auth/kakao/callback`: state 검사·성공302 + `mrs_account` 쿠키(7일); OAuth browser cookie 삭제.
- GET `/api/v1/auth/me`: `{userId: str}` 또는401.
- POST `/api/v1/auth/logout`: 현 앱 세션 폐기·쿠키 삭제·204. 카카오 전체 로그아웃으로 표현하지 않는다.
- `require_account(request: Request) -> Principal`: 실제 로그인 쿠키 검증.
- `require_trusted_origin(request: Request) -> None`: 변경 요청 출처 검사; 테스트는 `http://testserver`를 설정한다.
- `get_auth_service() -> AuthService`: main의 DB/설정과 service를 연결하는 override 가능한 의존성. HTTP client는 요청 context에서 닫는다.

- [ ] 첫 실패 테스트:

```python
from fastapi.testclient import TestClient
from main import app

def test_light_cookie_cannot_authenticate_account(monkeypatch):
    monkeypatch.setenv('DEEP_MODE_ENABLED', 'true')
    with TestClient(app) as client:
        response = client.get('/api/v1/auth/me', headers={'Cookie': 'mrs_participant=some-light-token'})
        assert response.status_code == 401
```

  테스트 설정은 A1 conftest에서 테스트용 origin·key·secret·pepper와 fake repo를 주입한다. 미인증 검사는 DB 연결 전에 수행한다.
- [ ] 실패 확인 후 라우트와 의존성을 연결한다. 쿠키 옵션:

```python
response.set_cookie('mrs_account', account_token, httponly=True,
                    secure=settings.secure_cookie, samesite='lax',
                    max_age=7 * 86400, path='/')
```

  Domain을 지정하지 않아 프론트 same-origin `/api` 프록시의 host-only 쿠키로 유지한다. REST 키·secret을 프론트 JavaScript에 전달하지 않는다. GET callback은 browser-state로 보호하고, logout 등 변경 요청은 정확한 Origin 검사 후 수행한다. 계정 쿠키 발급·삭제가 `mrs_participant`를 건드리지 않게 한다.

  로그인 시작은 IP당10분20회, callback은 IP당10분40회 제한을 Mongo TTL 카운터로 둔다. 키에는 raw IP 대신 HMAC을 사용한다. 신뢰할 수 없는 X-Forwarded-For를 임의로 파싱하지 않는다. 프록시 신뢰 설정은 배포 때 확인한다.

- [ ] 정상 callback·취소·재사용·외부 returnTo·잘못된 Origin·logout 후401·Light 계속 접근·disabled404·secret 없는 disabled Light 기동을 검사한다. callback 로그에는 query string을 기록하지 않도록 Uvicorn 및 프록시 로그 설정을 점검한다.
- [ ] `python scripts/test_local.py tests/integration/test_account_auth.py tests/integration/test_session_create.py -q` + lint/typecheck 통과 후 `feat(auth): expose secure account login routes` 커밋.

**외부 시험 gate:** 등록된 카카오 앱 키·secret·정확한 callback과 테스트 프론트 origin이 준비되어야 실제 로그인 E2E를 실행한다. mock 통과를 실제 카카오 로그인 완료라고 보고하지 않는다.
