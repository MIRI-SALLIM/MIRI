import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from auth.dependencies import get_auth_repository
from tests.unit.test_kakao_client import settings


def test_same_database_wrappers_reuse_indexes_per_event_loop(monkeypatch):
    import main
    first, second = MagicMock(), MagicMock()
    first.__eq__.return_value = True
    first.__getitem__.return_value.create_index = AsyncMock()
    second.__getitem__.return_value.create_index = AsyncMock()
    monkeypatch.setattr(main, "get_database", AsyncMock(side_effect=[first, second]))
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))

    async def run():
        repo_a = await get_auth_repository(request, settings())
        repo_b = await get_auth_repository(request, settings())
        assert repo_a is repo_b

    asyncio.run(run())
    second.__getitem__.return_value.create_index.assert_not_awaited()
