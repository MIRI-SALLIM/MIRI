import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from deep.meeting.models import ExplanationDraft
from deep.meeting.provider import GeneratedExplanation, OpenAIProvider, ProviderFailure
from deep.meeting.templates import template_cards
from tests.integration.test_deep_sessions import headers
from tests.integration.test_deep_v3 import ready
from tests.integration.test_meeting import both_ready, consent, save


@pytest.fixture
def generation(deep_context, monkeypatch):
    client, repo, db = deep_context
    path, _ = ready(client)
    both_ready(client, path)
    monkeypatch.setenv("DEEP_MEETING_AI_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-not-a-real-key")
    calls = []

    async def fake(self, brief, clarifications):
        calls.append((brief, clarifications))
        return GeneratedExplanation(ExplanationDraft(cards=template_cards(brief)), 100, 100)

    monkeypatch.setattr(OpenAIProvider, "generate", fake)
    return client, repo, db, path, calls


def test_read_is_free_and_post_caches_for_both_members(generation):
    client, _, _, path, calls = generation
    url = path + "/meeting/explanation"
    initial = client.get(url)
    assert initial.status_code == 200, initial.text
    assert initial.json()["reason"] == "not_generated" and not calls
    first = client.post(url, headers=headers())
    assert first.status_code == 200, first.text
    assert first.json()["source"] == "ai" and first.json()["cards"]
    assert client.get(url, headers=headers("user-b")).json() == first.json()
    assert client.post(url, headers=headers("user-b")).json() == first.json()
    assert len(calls) == 1


@pytest.mark.parametrize("mode,reason", [("disabled", "disabled"), ("budget", "budget_exhausted"), ("failure", "provider_unavailable")])
def test_safe_fallback_without_retries(generation, monkeypatch, mode, reason):
    client, _, _, path, calls = generation
    if mode == "disabled":
        monkeypatch.setenv("DEEP_MEETING_AI_ENABLED", "false")
    elif mode == "budget":
        monkeypatch.setenv("DEEP_MEETING_AI_DAILY_MICRO_USD", "0")
    else:
        async def fail(*args):
            calls.append("failed")
            raise ProviderFailure()
        monkeypatch.setattr(OpenAIProvider, "generate", fail)
    for _ in range(2):
        response = client.post(path + "/meeting/explanation", headers=headers())
        assert response.status_code == 200, response.text
        assert response.json()["source"] == "template"
        assert response.json()["reason"] == reason
    assert len(calls) == (1 if mode == "failure" else 0)


def test_revocation_blocks_read_and_discards_cache(generation):
    client, _, db, path, calls = generation
    assert client.post(path + "/meeting/explanation", headers=headers()).json()["source"] == "ai"
    client.delete(path + "/meeting/me/consent", headers=headers("user-b"))
    for method in (client.get, client.post):
        assert method(path + "/meeting/explanation", headers=headers()).json() == {"status": "waiting"}
    assert db["deep_sessions"].documents[0]["meeting"].get("generation") is None
    assert len(calls) == 1


def test_old_no_transmission_consent_is_not_generation_permission(generation):
    client, _, db, path, calls = generation
    db["deep_sessions"].documents[0]["meeting"]["members"]["B"]["consent"]["consentVersion"] = "money-meeting-consent-v1"
    assert client.post(path + "/meeting/explanation", headers=headers()).json() == {"status": "waiting"}
    own = client.get(path + "/meeting/me", headers=headers("user-b"))
    assert own.status_code == 200 and own.json()["consent"] is None
    assert consent(client, path, revision=2, consentVersion="money-meeting-consent-v1").status_code == 422
    assert not calls


def test_answer_change_requires_reconsent_and_new_generation(generation):
    client, _, _, path, calls = generation
    url = path + "/meeting/explanation"
    client.post(url, headers=headers())
    assert save(client, path, revision=2, adjustableMonthlyWon=1_100_000).status_code == 200
    assert client.get(url).json() == {"status": "waiting"}
    assert consent(client, path, revision=3).status_code == 200
    assert client.post(url, headers=headers()).json()["source"] == "ai"
    assert len(calls) == 2


def test_withdrawal_during_provider_does_not_store_or_return_output(generation, monkeypatch):
    client, repo, db, path, _ = generation
    async def withdraw(self, brief, clarifications):
        await repo.withdraw(path.rsplit("/", 1)[-1], "user-b", datetime.now(timezone.utc))
        return GeneratedExplanation(ExplanationDraft(cards=template_cards(brief)), 100, 100)
    monkeypatch.setattr(OpenAIProvider, "generate", withdraw)
    response = client.post(path + "/meeting/explanation", headers=headers())
    assert response.status_code == 410 and "cards" not in response.json()
    assert db["deep_sessions"].documents[0]["meeting"] is None


def test_expired_attempt_never_calls_provider_again(generation):
    from deep.meeting.generation import snapshot
    from deep.service import DeepService
    client, repo, db, path, calls = generation
    session_id = path.rsplit("/", 1)[-1]
    current = asyncio.run(snapshot(DeepService(repo), session_id, "user-a"))
    now = datetime.now(timezone.utc)
    asyncio.run(db["deep_meeting_attempts"].insert_one({
        "_id": current.key, "sessionId": session_id, "status": "pending",
        "deadline": now - timedelta(seconds=1), "expiresAt": now + timedelta(days=90),
    }))
    response = client.post(path + "/meeting/explanation", headers=headers())
    assert response.status_code == 200, response.text
    assert response.json()["reason"] == "interrupted" and not calls


def test_same_context_concurrent_requests_make_one_call(generation, monkeypatch):
    from deep.meeting.generation import explanation
    from deep.service import DeepService
    _, repo, db, path, calls = generation
    async def run():
        started, release = asyncio.Event(), asyncio.Event()
        async def blocked(self, brief, clarifications):
            calls.append("called")
            started.set()
            await release.wait()
            return GeneratedExplanation(ExplanationDraft(cards=template_cards(brief)), 100, 100)
        monkeypatch.setattr(OpenAIProvider, "generate", blocked)
        service = DeepService(repo)
        session = path.rsplit("/", 1)[-1]
        first = asyncio.create_task(explanation(service, session, "user-a", generate=True))
        await asyncio.wait_for(started.wait(), timeout=2)
        second = await explanation(service, session, "user-b", generate=True)
        assert second["reason"] == "pending"
        release.set()
        assert (await first)["source"] == "ai"
    asyncio.run(run())
    assert len(calls) == 1 and db["deep_meeting_budgets"].documents[0]["calls"] == 1


def test_revoke_during_call_discards_result(generation, monkeypatch):
    from deep.meeting.storage import MeetingStorage
    client, repo, db, path, _ = generation
    async def revoke(self, brief, clarifications):
        await MeetingStorage(repo).revoke_consent(path.rsplit("/", 1)[-1], "user-b", datetime.now(timezone.utc))
        return GeneratedExplanation(ExplanationDraft(cards=template_cards(brief)), 100, 100)
    monkeypatch.setattr(OpenAIProvider, "generate", revoke)
    response = client.post(path + "/meeting/explanation", headers=headers())
    assert response.status_code == 409 and "cards" not in response.json()
    assert db["deep_sessions"].documents[0]["meeting"].get("generation") is None


def test_agreement_confirmation_changes_cache_for_both_viewers(generation):
    from tests.integration.test_deep_v3 import terms
    client, _, _, path, calls = generation
    url = path + "/meeting/explanation"
    client.post(url, headers=headers())
    proposal = client.post(path + "/agreements", headers=headers(), json={"expectedRound": 1, "text": "PRIVATE agreement", "terms": terms()})
    assert proposal.status_code == 201, proposal.text
    agreement = path + "/agreements/" + proposal.json()["id"]
    assert client.get(url).json()["reason"] == "not_generated"
    assert client.post(url, headers=headers()).json()["source"] == "ai"
    assert client.get(url, headers=headers("user-b")).json()["source"] == "ai"
    assert client.post(agreement + "/confirm", headers=headers(), json={"expectedVersion": 1}).status_code == 200
    assert client.get(url).json()["reason"] == "not_generated"
    assert "PRIVATE" not in repr(calls) and len(calls) == 2


def test_late_completion_is_discarded(generation, monkeypatch):
    import deep.meeting.generation as module
    client, _, db, path, _ = generation
    real_now = datetime.now(timezone.utc)
    monkeypatch.setattr(module, "utcnow", lambda: real_now)
    async def late(self, brief, clarifications):
        monkeypatch.setattr(module, "utcnow", lambda: real_now + timedelta(seconds=31))
        return GeneratedExplanation(ExplanationDraft(cards=template_cards(brief)), 100, 100)
    monkeypatch.setattr(OpenAIProvider, "generate", late)
    response = client.post(path + "/meeting/explanation", headers=headers())
    assert response.json()["reason"] == "interrupted"
    assert not db["deep_sessions"].documents[0]["meeting"].get("generation")


def test_unexpected_usage_halts_day_and_keeps_reservation(generation, monkeypatch):
    from deep.meeting.provider import RESERVATION_MICRO_USD, RESERVED_INPUT_TOKENS
    client, _, db, path, _ = generation
    async def expensive(self, brief, clarifications):
        return GeneratedExplanation(ExplanationDraft(cards=template_cards(brief)), RESERVED_INPUT_TOKENS + 1, 100)
    monkeypatch.setattr(OpenAIProvider, "generate", expensive)
    assert client.post(path + "/meeting/explanation", headers=headers()).json()["reason"] == "provider_unavailable"
    budget = db["deep_meeting_budgets"].documents[0]
    assert budget["halted"] and budget["reservedMicroUsd"] == RESERVATION_MICRO_USD


def test_explanation_requires_membership_and_origin(generation):
    client, _, _, path, calls = generation
    url = path + "/meeting/explanation"
    assert client.post(url, headers=headers("user-c")).status_code == 404
    assert client.post(url, headers={"Origin": "https://untrusted.example"}).status_code == 403
    assert not calls


@pytest.mark.parametrize("budget", [0, 250_000])
def test_withdrawal_before_attempt_insert_does_not_retain_identifiers(generation, monkeypatch, budget):
    client, repo, db, path, calls = generation
    monkeypatch.setenv("DEEP_MEETING_AI_DAILY_MICRO_USD", str(budget))
    attempts = db["deep_meeting_attempts"]
    original_insert = attempts.insert_one
    async def withdraw_then_insert(document):
        await repo.withdraw(path.rsplit("/", 1)[-1], "user-b", datetime.now(timezone.utc))
        return await original_insert(document)
    monkeypatch.setattr(attempts, "insert_one", withdraw_then_insert)
    response = client.post(path + "/meeting/explanation", headers=headers())
    assert response.status_code == 410
    assert not calls and attempts.documents == []


def test_provider_rejection_uses_ceiling_aware_fallback(generation, monkeypatch):
    client, _, _, path, _ = generation
    assert save(client, path, "user-b", revision=2, contributionMeaning="selfReportedLimit", adjustableMonthlyWon=None).status_code == 200
    assert consent(client, path, "user-b", revision=3).status_code == 200
    async def reject(*args):
        raise ProviderFailure()
    monkeypatch.setattr(OpenAIProvider, "generate", reject)
    response = client.post(path + "/meeting/explanation", headers=headers())
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["source"] == "template"
    assert "B가 밝힌 상한" in payload["cards"][0]["explanation"]
    assert "A의 조정 가능 범위" in payload["cards"][0]["question"]
