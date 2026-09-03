import asyncio
import importlib
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

NOW = datetime(2026, 9, 3, tzinfo=timezone.utc)


def test_challenge_consumption_is_atomic_browser_bound_and_unexpired():
    collection = MagicMock()
    collection.find_one_and_delete = AsyncMock(return_value={"returnTo": "/deep"})
    db = MagicMock()
    db.__getitem__.return_value = collection
    repo = importlib.import_module("auth.repository").AuthRepository(db)
    result = asyncio.run(repo.consume_challenge("state-hash", "browser-hash", NOW))
    assert result == {"returnTo": "/deep"}
    collection.find_one_and_delete.assert_awaited_once_with({
        "stateHash": "state-hash", "browserHash": "browser-hash", "expiresAt": {"$gt": NOW},
    })


def test_challenge_records_only_digests_and_fixed_expiry():
    collection = MagicMock()
    collection.insert_one = AsyncMock()
    db = MagicMock()
    db.__getitem__.return_value = collection
    repo = importlib.import_module("auth.repository").AuthRepository(db)
    asyncio.run(repo.create_challenge("state-hash", "browser-hash", "/deep", NOW))
    inserted = collection.insert_one.call_args.args[0]
    assert inserted == {"stateHash": "state-hash", "browserHash": "browser-hash",
                        "returnTo": "/deep", "expiresAt": NOW + timedelta(minutes=10)}


def test_session_lookup_excludes_expired_sessions_and_deleted_users():
    sessions = MagicMock()
    sessions.find_one = AsyncMock(return_value={"userId": "user-a", "issuedAt": NOW})
    users = MagicMock()
    users.find_one = AsyncMock(return_value=None)
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: users if name == "users" else sessions
    repo = importlib.import_module("auth.repository").AuthRepository(db)
    assert asyncio.run(repo.lookup_session("account-hash", NOW)) is None
    sessions.find_one.assert_awaited_once_with({"tokenHash": "account-hash", "expiresAt": {"$gt": NOW}})
    users.find_one.assert_awaited_once_with({"id": "user-a"})


def mock_database():
    collections = {}
    for name in ("users", "auth_sessions", "auth_challenges", "auth_rate_limits", "reviewer_rooms"):
        collection = MagicMock()
        for operation in ("create_index", "find_one_and_update", "find_one", "insert_one",
                          "delete_one", "delete_many"):
            setattr(collection, operation, AsyncMock())
        collections[name] = collection
    db = MagicMock()
    db.__getitem__.side_effect = collections.__getitem__
    return db, collections


def test_required_unique_and_ttl_indexes():
    db, collections = mock_database()
    repo = importlib.import_module("auth.repository").AuthRepository(db)
    asyncio.run(repo.ensure_indexes())
    collections["users"].create_index.assert_any_await([("provider", 1), ("providerUserId", 1)], unique=True)
    collections["users"].create_index.assert_any_await("id", unique=True)
    for name, key in (("auth_sessions", "tokenHash"), ("auth_challenges", "stateHash")):
        collections[name].create_index.assert_any_await(key, unique=True)
        collections[name].create_index.assert_any_await("expiresAt", expireAfterSeconds=0)
    collections["auth_rate_limits"].create_index.assert_any_await("expiresAt", expireAfterSeconds=0)


def test_upsert_returns_internal_id_and_recovers_concurrent_provider_creation():
    db, collections = mock_database()
    users = collections["users"]
    users.find_one_and_update.side_effect = DuplicateKeyError("duplicate test key")
    users.find_one.return_value = {"id": "existing-internal-id"}
    repo = importlib.import_module("auth.repository").AuthRepository(db)
    principal = asyncio.run(repo.upsert_user("12345", NOW))
    assert principal.user_id == "existing-internal-id"
    users.find_one.assert_awaited_once_with({"provider": "kakao", "providerUserId": "12345"})
    args, kwargs = users.find_one_and_update.call_args
    assert args[0] == {"provider": "kakao", "providerUserId": "12345"}
    assert args[1]["$setOnInsert"]["id"] != "12345"
    assert kwargs == {"upsert": True, "return_document": ReturnDocument.AFTER}


def test_issue_lookup_revoke_and_delete_account_sessions():
    db, collections = mock_database()
    sessions = collections["auth_sessions"]
    sessions.find_one.return_value = {"userId": "user-a", "issuedAt": NOW.replace(tzinfo=None)}
    collections["users"].find_one.return_value = {"id": "user-a"}
    repo = importlib.import_module("auth.repository").AuthRepository(db)

    async def run():
        await repo.issue_session("user-a", "hash", NOW)
        principal = await repo.lookup_session("hash", NOW)
        assert principal.user_id == "user-a"
        assert principal.authenticated_at == NOW
        await repo.revoke_session("hash")
        await repo.delete_user("user-a")

    asyncio.run(run())
    sessions.insert_one.assert_awaited_once_with({"userId": "user-a", "tokenHash": "hash",
                                                "issuedAt": NOW, "expiresAt": NOW + timedelta(days=7)})
    sessions.delete_one.assert_awaited_once_with({"tokenHash": "hash"})
    sessions.delete_many.assert_awaited_once_with({"userId": "user-a"})
    collections["users"].delete_one.assert_awaited_once_with({"id": "user-a"})


def test_fixed_window_rate_limit_increments_atomically_and_recovers_first_insert_race():
    db, collections = mock_database()
    counter = collections["auth_rate_limits"]
    counter.find_one_and_update.side_effect = [DuplicateKeyError("race"), {"count": 20}, {"count": 21}]
    repo = importlib.import_module("auth.repository").AuthRepository(db)

    async def run():
        assert await repo.allow_attempt("ip-digest", "start", 20, NOW)
        assert not await repo.allow_attempt("ip-digest", "start", 20, NOW)

    asyncio.run(run())
    args, kwargs = counter.find_one_and_update.call_args
    assert "ip-digest" in args[0]["_id"]
    assert args[1]["$inc"] == {"count": 1}
    assert args[1]["$setOnInsert"]["expiresAt"] > NOW
    assert kwargs["return_document"] == ReturnDocument.AFTER
