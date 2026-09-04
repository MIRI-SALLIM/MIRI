import asyncio
import importlib
from datetime import datetime, timezone

import pytest

from tests.mongo_fakes import MemoryDatabase

NOW = datetime(2026, 9, 3, tzinfo=timezone.utc)


def test_idempotency_key_different_payload_does_not_create_second_session():
    repository = importlib.import_module("deep.repository").DeepRepository
    db = MemoryDatabase()

    async def run():
        repo = repository(db)
        await repo.ensure_indexes()
        await repo.create("user-a", "same-key", "payload-a", NOW)
        with pytest.raises(Exception, match="IDEMPOTENCY_CONFLICT"):
            await repo.create("user-a", "same-key", "payload-b", NOW)
        assert len(db["deep_sessions"].documents) == 1

    asyncio.run(run())


def test_concurrent_join_allows_only_one_second_account():
    repository = importlib.import_module("deep.repository").DeepRepository

    async def run():
        repo = repository(MemoryDatabase())
        await repo.ensure_indexes()
        created = await repo.create("user-a", "key", "payload", NOW)
        results = await asyncio.gather(*(repo.join(created["invitationCode"], user, "key", NOW)
                                         for user in ("user-b", "user-c")), return_exceptions=True)
        assert sum(isinstance(result, dict) for result in results) == 1
        assert sum(str(result) == "SESSION_FULL" for result in results) == 1

    asyncio.run(run())


def test_old_deep_document_cannot_enter_light_result_or_invitation_flow():
    from fastapi.testclient import TestClient

    import main

    async def arrange():
        repo = await main.get_session_repository()
        return await repo.create(nickname="legacy", mode="deep", question_set_version="deep-v1", question_count=5,
                                 idempotency_key="legacy-deep", pepper=main.PARTICIPANT_TOKEN_PEPPER, now=NOW, ttl_days=365)

    document, token = asyncio.run(arrange())
    with TestClient(main.app) as client:
        cookie = {"Cookie": f'mrs_participant={document["id"]}:{token}'}
        result = client.get(f'/api/v1/sessions/{document["id"]}/result', headers=cookie)
        assert result.status_code == 409
        assert result.json()["error"]["code"] == "LEGACY_DEEP_UNSUPPORTED"
        assert client.get(f'/api/v1/invitations/{document["invitationCode"]}').status_code == 404
        assert client.post(f'/api/v1/invitations/{document["invitationCode"]}/join', json={}).status_code == 404
