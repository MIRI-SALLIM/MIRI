import asyncio
from datetime import datetime, timezone

import pytest

from deep.errors import DeepError


def test_v3_members_round_and_consent_version_are_preserved(deep_context):
    _, repo, _ = deep_context

    async def run():
        now = datetime.now(timezone.utc)
        doc = await repo.create("user-a", "v3", "payload", now, question_version="deep-v3")
        assert doc["consentVersion"] == "deep-sharing-v2"
        joined = await repo.join(doc["invitationCode"], "user-b", "join", now)
        for role in ("A", "B"):
            assert joined["members"][role]["input"]["inputVersion"] == "deep-input-v3"
        await repo.request_round(doc["id"], "user-a", 1, now)
        updated = await repo.request_round(doc["id"], "user-b", 1, now)
        assert updated["round"] == 2
        assert updated["questionVersion"] == "deep-v3"
        assert updated["members"]["A"]["consent"] is None
        with pytest.raises(DeepError):
            await repo.save_input(doc["id"], "user-a", 1, {}, now)

    asyncio.run(run())
