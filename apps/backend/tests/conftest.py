import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("ENVIRONMENT", "test")


@pytest.fixture(autouse=True)
def isolate_session_repository():
    import main as main_module

    main_module._session_repository = None
    yield
    main_module._session_repository = None
    main_module.app.dependency_overrides.clear()


@pytest.fixture
def deep_context(monkeypatch):
    import asyncio
    from datetime import datetime, timezone

    from fastapi import Request
    from fastapi.testclient import TestClient

    from auth.dependencies import require_account
    from auth.models import Principal
    from deep.dependencies import get_deep_service
    from deep.repository import DeepRepository
    from deep.service import DeepService
    from main import app
    from tests.mongo_fakes import MemoryDatabase

    for key, value in {"DEEP_MODE_ENABLED": "true", "ENVIRONMENT": "test", "PUBLIC_APP_ORIGIN": "http://testserver",
                       "KAKAO_REST_API_KEY": "test-key", "KAKAO_CLIENT_SECRET": "test-secret", "AUTH_SESSION_PEPPER": "p" * 32}.items():
        monkeypatch.setenv(key, value)
    db = MemoryDatabase()
    repo = DeepRepository(db)
    asyncio.run(repo.ensure_indexes())

    def test_account(request: Request):
        return Principal(request.headers.get("X-Test-User", "user-a"), datetime.now(timezone.utc))

    app.dependency_overrides[require_account] = test_account
    app.dependency_overrides[get_deep_service] = lambda: DeepService(repo)
    with TestClient(app) as client:
        yield client, repo, db
