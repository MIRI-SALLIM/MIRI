import asyncio

import pytest

from deep.meeting.models import ExplanationDraft
from deep.meeting.provider import GeneratedExplanation, OpenAIProvider
from deep.meeting.templates import template_cards
from tests.integration.test_deep_sessions import headers
from tests.integration.test_deep_v3 import ready, start


def completion_body(**overrides):
    return {
        "expectedRound": 1, "planVersion": 2, "expectedRevision": 0,
        "answers": {"contributionMeaning": "initialProposal", "adjustableMonthlyWon": 1_000_000},
        "consentVersion": "money-meeting-consent-v2", "shareWithPartner": True,
        "allowAiProcessing": True, **overrides,
    }


@pytest.fixture
def completion(deep_context, monkeypatch):
    client, repo, db = deep_context
    path, _ = ready(client)
    monkeypatch.setenv("DEEP_MEETING_AI_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-not-a-real-key")
    monkeypatch.setenv("DEEP_MEETING_AI_TOTAL_MICRO_USD", "5000000")
    monkeypatch.setenv("DEEP_MEETING_AI_PRIOR_MICRO_USD", "0")
    calls = []

    async def fake(self, brief, clarifications):
        calls.append((brief, clarifications))
        return GeneratedExplanation(ExplanationDraft(cards=template_cards(brief, clarifications)), 100, 100)

    monkeypatch.setattr(OpenAIProvider, "generate", fake)
    return client, repo, db, path, calls


def test_one_completion_saves_answers_and_consent_then_last_member_generates(completion):
    client, _, _, path, calls = completion
    first = client.post(path + "/meeting/complete", headers=headers(), json=completion_body())
    assert first.status_code == 200, first.text
    assert first.json()["own"]["revision"] == 1
    assert first.json()["own"]["answers"]["adjustableMonthlyWon"] == 1_000_000
    assert first.json()["own"]["consent"]["allowAiProcessing"] is True
    assert first.json()["explanation"] == {"status": "waiting"} and not calls
    second = client.post(path + "/meeting/complete", headers=headers("user-b"), json=completion_body())
    assert second.status_code == 200, second.text
    result = second.json()["explanation"]
    assert result["source"] == "ai" and result["cards"]
    for user in ("user-a", "user-b"):
        assert client.get(path + "/meeting/explanation", headers=headers(user)).json() == result
    assert len(calls) == 1
    assert client.post(path + "/meeting/complete", headers=headers("user-b"), json=completion_body()).status_code == 409
    assert len(calls) == 1


def test_unchanged_completion_reuses_current_consent_and_explanation(completion):
    client, _, _, path, calls = completion
    for user in ("user-a", "user-b"):
        result = client.post(path + "/meeting/complete", headers=headers(user), json=completion_body())
        assert result.status_code == 200
    again = client.post(path + "/meeting/complete", headers=headers("user-b"), json=completion_body(expectedRevision=1))
    assert again.status_code == 200, again.text
    assert again.json() == result.json()
    assert len(calls) == 1


@pytest.mark.parametrize("share,ai", [(False, False), (True, False)])
def test_optional_ai_or_sharing_does_not_block_the_existing_report(completion, share, ai):
    client, _, _, path, calls = completion
    assert client.post(path + "/meeting/complete", headers=headers(), json=completion_body()).status_code == 200
    result = client.post(path + "/meeting/complete", headers=headers("user-b"),
                         json=completion_body(shareWithPartner=share, allowAiProcessing=ai))
    assert result.status_code == 200, result.text
    assert result.json()["explanation"] == {"status": "waiting"}
    assert client.get(path + "/result").json()["status"] == "ready"
    assert client.get(path + "/meeting/explanation").json() == {"status": "waiting"}
    assert not calls


@pytest.mark.parametrize("overrides", [
    {"answers": {"contributionMeaning": "initialProposal", "adjustableMonthlyWon": 799_999}},
    {"shareWithPartner": False}, {"allowAiProcessing": "true"}, {"consentVersion": "future"},
])
def test_invalid_completion_does_not_save_answers_or_consent(completion, overrides):
    client, _, _, path, calls = completion
    result = client.post(path + "/meeting/complete", headers=headers(), json=completion_body(**overrides))
    assert result.status_code == 422, result.text
    mine = client.get(path + "/meeting/me").json()
    assert mine["revision"] == 0 and mine["answers"] is None and mine["consent"] is None
    assert not calls


def test_completion_requires_membership_origin_and_current_report(completion):
    client, _, _, path, calls = completion
    assert client.post(path + "/meeting/complete", headers=headers("outsider"), json=completion_body()).status_code == 404
    assert client.post(path + "/meeting/complete", headers={"Origin": "https://evil.invalid"}, json=completion_body()).status_code == 403
    assert not calls


def test_unpublished_report_cannot_be_completed(deep_context):
    client, _, _ = deep_context
    draft = start(client)
    assert client.post(draft + "/meeting/complete", headers=headers(), json=completion_body()).status_code == 409


def test_stale_completion_does_not_restore_withdrawn_consent(completion):
    client, _, _, path, calls = completion
    assert client.post(path + "/meeting/complete", headers=headers(), json=completion_body()).status_code == 200
    assert client.delete(path + "/meeting/me/consent", headers=headers()).status_code == 200
    assert client.post(path + "/meeting/complete", headers=headers(), json=completion_body(expectedRevision=1)).status_code == 409
    assert client.get(path + "/meeting/me").json()["consent"] is None
    assert not calls


def test_missing_total_budget_keeps_completion_but_does_not_call_ai(completion, monkeypatch):
    client, _, _, path, calls = completion
    monkeypatch.delenv("DEEP_MEETING_AI_TOTAL_MICRO_USD")
    monkeypatch.delenv("DEEP_MEETING_AI_PRIOR_MICRO_USD")
    for user in ("user-a", "user-b"):
        result = client.post(path + "/meeting/complete", headers=headers(user), json=completion_body())
        assert result.status_code == 200, result.text
    assert result.json()["own"]["consent"]["allowAiProcessing"] is True
    assert result.json()["explanation"]["source"] == "template"
    assert result.json()["explanation"]["reason"] == "budget_exhausted"
    assert not calls


def test_completion_never_generates_for_a_newer_answer_than_the_clicked_version(completion, monkeypatch):
    from deep.meeting.contracts import SaveMeetingAnswers
    from deep.meeting.storage import MeetingStorage

    client, _, _, path, calls = completion
    assert client.post(path + "/meeting/complete", headers=headers(), json=completion_body()).status_code == 200
    original = MeetingStorage.complete

    async def changed_after_save(self, session_id, user_id, body, now):
        own = await original(self, session_id, user_id, body, now)
        await self.save_answers(session_id, user_id, SaveMeetingAnswers(
            expectedRound=1, planVersion=2, expectedRevision=own["revision"],
            answers={"contributionMeaning": "initialProposal", "adjustableMonthlyWon": 1_200_000}), now)
        return own

    monkeypatch.setattr(MeetingStorage, "complete", changed_after_save)
    result = client.post(path + "/meeting/complete", headers=headers("user-b"), json=completion_body())
    assert result.status_code == 409, result.text
    assert not calls


def test_simultaneous_member_completions_share_one_generation(completion):
    from deep.meeting.completion import complete_meeting
    from deep.meeting.contracts import CompleteMeeting
    from deep.service import DeepService

    _, repo, _, path, calls = completion

    async def run():
        service = DeepService(repo)
        session_id = path.rsplit("/", 1)[-1]
        responses = await asyncio.gather(*(complete_meeting(service, session_id, user, CompleteMeeting(**completion_body()))
                                           for user in ("user-a", "user-b")))
        assert all(response["own"]["revision"] == 1 for response in responses)
        assert len(calls) == 1

    asyncio.run(run())
