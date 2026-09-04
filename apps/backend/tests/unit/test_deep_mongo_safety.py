import pytest

from tests.deep_mongo_support import safe_test_uri


def test_fixture_cleans_up_only_its_generated_database(monkeypatch):
    import asyncio
    from types import SimpleNamespace

    from tests import deep_mongo_support as support

    accessed, dropped, closed = [], [], []

    async def ping(*args):
        return {"ok": 1}

    class TestClient:
        admin = SimpleNamespace(command=ping)

        def __init__(self, *args, **kwargs):
            pass

        def __getitem__(self, name):
            accessed.append(name)
            return name

        async def drop_database(self, name):
            dropped.append(name)

        async def close(self):
            closed.append(True)

    monkeypatch.setenv("DEEP_TEST_MONGODB_URI", "mongodb://127.0.0.1:27017")
    monkeypatch.setattr(support, "AsyncMongoClient", TestClient)

    async def run():
        async with support.isolated_deep_database() as name:
            assert name.startswith("mirisalim_deep_test_")

    asyncio.run(run())
    assert len(accessed) == 1 and dropped == accessed and closed == [True]


@pytest.mark.parametrize("uri", ["mongodb+srv://cluster.example", "mongodb://user:pass@127.0.0.1", "mongodb://example.com",
                                  "mongodb://127.0.0.1,example.com", "mongodb://127.0.0.1/?replicaSet=prod",
                                  "mongodb://localhost/production", "mongodb://mongodb:27017"])
def test_reject_nonisolated_test_database(uri):
    with pytest.raises(ValueError, match="UNSAFE_DEEP_TEST_MONGODB_URI"):
        safe_test_uri({"DEEP_TEST_MONGODB_URI": uri})


def test_only_loopback_or_explicit_ci_service_is_allowed():
    for uri in ("mongodb://127.0.0.1:27017", "mongodb://localhost:27017/", "mongodb://[::1]:27017"):
        assert safe_test_uri({"DEEP_TEST_MONGODB_URI": uri}) == uri
    assert safe_test_uri({"CI": "true", "DEEP_TEST_MONGODB_URI": "mongodb://mongodb:27017"}) == "mongodb://mongodb:27017"
    assert safe_test_uri({"MONGODB_URI": "mongodb+srv://production"}) is None
    with pytest.raises(ValueError, match="DEEP_TEST_MONGODB_URI_REQUIRED"):
        safe_test_uri({"REQUIRE_DEEP_MONGO_TESTS": "1"})
