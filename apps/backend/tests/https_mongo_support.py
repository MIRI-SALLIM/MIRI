"""Real local HTTPS test server; never accept production targets or credentials."""

import asyncio
import os
import re
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import time
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

import httpx
import pytest

from auth.passwords import hash_password
from tests.deep_mongo_support import safe_test_uri

BACKEND = Path(__file__).resolve().parents[1]


def server_environment(origin: str, database_name: str, mongo_uri: str, passwords: tuple[str, str],
                       inherited: Mapping[str, str]) -> dict[str, str]:
    if not re.fullmatch(r'mirisalim_deep_test_[a-f0-9]{32}', database_name):
        raise ValueError('Unsafe test database name')
    parsed = urlsplit(origin)
    if (parsed.scheme != 'https' or parsed.hostname != '127.0.0.1' or not parsed.port
            or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment
            or origin != f'https://127.0.0.1:{parsed.port}'):
        raise ValueError('HTTPS test server must use an explicit loopback port')
    uri = safe_test_uri({'DEEP_TEST_MONGODB_URI': mongo_uri, 'CI': inherited.get('CI', '')})
    if uri is None:
        raise ValueError('An isolated Mongo URI is required')
    env = {key: value for key, value in inherited.items()
           if key.upper() in {'PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LANG'}}
    env.update({
        'ENVIRONMENT': 'production', 'MONGODB_URI': uri, 'MONGODB_DATABASE': database_name,
        'MONGODB_DB_NAME': database_name, 'PUBLIC_APP_ORIGIN': origin, 'ALLOWED_ORIGINS': origin,
        'DEEP_MODE_ENABLED': 'true', 'KAKAO_LOGIN_ENABLED': 'false', 'REVIEWER_LOGIN_ENABLED': 'true',
        'AUTH_SESSION_PEPPER': secrets.token_urlsafe(32), 'PARTICIPANT_TOKEN_PEPPER': secrets.token_urlsafe(32),
        'REVIEWER_A_PASSWORD_HASH': hash_password(passwords[0]),
        'REVIEWER_B_PASSWORD_HASH': hash_password(passwords[1]),
        'SESSION_TTL_DAYS': '7', 'PYTHON_DOTENV_DISABLED': '1', 'PYTHONDONTWRITEBYTECODE': '1',
    })
    return env


@asynccontextmanager
async def https_backend(database_name: str, mongo_uri: str,
                        passwords: tuple[str, str]) -> AsyncIterator[tuple[str, ssl.SSLContext]]:
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    origin = f'https://127.0.0.1:{port}'
    env = server_environment(origin, database_name, mongo_uri, passwords, os.environ)
    openssl = shutil.which('openssl')
    if not openssl:
        if os.environ.get('REQUIRE_DEEP_MONGO_TESTS') == '1':
            pytest.fail('OpenSSL is required for real HTTPS validation')
        pytest.skip('OpenSSL unavailable; real HTTPS validation NOT executed')
    with TemporaryDirectory(prefix='mirisalim-https-test-') as folder:
        cert, key = Path(folder) / 'cert.pem', Path(folder) / 'key.pem'
        await asyncio.to_thread(subprocess.run, [
            openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
            '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
            '-keyout', str(key), '-out', str(cert),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15, env=env)
        context = ssl.create_default_context(cafile=str(cert))
        process = await asyncio.to_thread(subprocess.Popen, [
            sys.executable, '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', str(port),
            '--ssl-keyfile', str(key), '--ssl-certfile', str(cert), '--no-access-log', '--no-proxy-headers',
        ], cwd=BACKEND, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0) if os.name == 'nt' else 0)
        try:
            deadline = time.monotonic() + 20
            async with httpx.AsyncClient(base_url=origin, verify=context, trust_env=False, timeout=1) as health:
                while True:
                    if process.poll() is not None:
                        raise RuntimeError('Isolated HTTPS server exited before becoming ready')
                    try:
                        response = await health.get('/health')
                        if response.status_code == 200 and response.json().get('database') == 'connected':
                            break
                    except httpx.TransportError:
                        pass
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Isolated HTTPS/Mongo readiness timed out')
                    await asyncio.sleep(0.1)
            yield origin, context
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    await asyncio.to_thread(process.wait, timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    await asyncio.to_thread(process.wait, timeout=5)
