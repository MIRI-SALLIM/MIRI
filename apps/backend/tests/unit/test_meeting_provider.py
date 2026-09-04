import asyncio
import json

import httpx
import pytest

from deep.meeting.provider import (
    AiSettings,
    OpenAIProvider,
    ProviderFailure,
    request_body,
)
from deep.meeting.templates import template_cards
from tests.meeting_factory import granted, ready_result


def inputs():
    from deep.meeting.brief import build_brief
    brief = build_brief(ready_result(), granted())
    return brief, {role: {"contributionMeaning": "initialProposal", "adjustableMonthlyWon": None} for role in ("A", "B")}


def test_request_guides_questions_from_known_answers_without_requiring_a_ceiling():
    brief, answers = inputs()
    body = request_body(brief, answers)
    assert "A의 초기 제안" in body["instructions"]
    assert "B의 초기 제안" in body["instructions"]
    assert "공동 예산과 제안 금액" in body["instructions"]


def test_default_disabled_and_invalid_config_fails_closed(monkeypatch):
    monkeypatch.delenv("DEEP_MEETING_AI_ENABLED", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-not-a-real-key")
    assert not AiSettings.load().enabled
    monkeypatch.setenv("DEEP_MEETING_AI_ENABLED", "true")
    assert AiSettings.load().enabled
    monkeypatch.setenv("DEEP_MEETING_AI_DAILY_MICRO_USD", "unbounded")
    assert not AiSettings.load().enabled


def test_templates_are_valid_grounded_and_request_is_minimal():
    from deep.meeting.explanation import validate_grounding
    from deep.meeting.models import ExplanationDraft
    brief, clarifications = inputs()
    cards = template_cards(brief)
    assert validate_grounding(ExplanationDraft(cards=cards), brief)
    body = request_body(brief, clarifications)
    assert body["store"] is False and body["max_output_tokens"] == 800
    assert body["reasoning"] == {"effort": "none"}
    assert body["service_tier"] == "default"
    assert body["model"] == "gpt-5.4-mini-2026-03-17"
    assert set(json.loads(body["input"])) == {"brief", "clarifications"}


@pytest.mark.parametrize("failure", [None, "acknowledged", "refusal", "incomplete", "malformed", "ungrounded", "429", "500", "timeout",
                                     "null_response", "missing_output", "null_output", "missing_content", "over_budget"])
@pytest.mark.parametrize("ceiling", [False, True])
def test_sdk_contract_and_safe_failures(failure, ceiling):
    brief, clarifications = inputs()
    if ceiling:
        clarifications["B"] = {"contributionMeaning": "selfReportedLimit", "adjustableMonthlyWon": None}
    seen = []

    def handler(request):
        seen.append(json.loads(request.content))
        assert str(request.url) == "https://api.openai.com/v1/responses"
        if failure == "timeout":
            raise httpx.ReadTimeout("PRIVATE-DETAIL", request=request)
        if failure in {"429", "500"}:
            return httpx.Response(int(failure), json={"error": {"message": "PRIVATE-DETAIL"}})
        if failure == "null_response":
            return httpx.Response(200, content="null", headers={"content-type": "application/json"})
        draft = {"cards": [card.model_dump() for card in template_cards(brief)]}
        if failure == "acknowledged":
            draft = {"cards": [card.model_dump() for card in template_cards(brief, clarifications)]}
        if failure == "ungrounded":
            draft["cards"][0]["factIds"] = ["excess"]
        content = [{"type": "output_text", "text": "invalid" if failure == "malformed" else json.dumps(draft), "annotations": []}]
        if failure == "refusal":
            content = [{"type": "refusal", "refusal": "PRIVATE-DETAIL"}]
        envelope = {
            "id": "resp_test", "object": "response", "created_at": 1, "model": seen[-1]["model"],
            "status": "incomplete" if failure == "incomplete" else "completed",
            "output": [{"id": "msg_test", "type": "message", "role": "assistant", "status": "completed", "content": content}],
            "usage": {"input_tokens": 100, "output_tokens": 100, "total_tokens": 200,
                      "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0}},
        }
        if failure == "missing_output":
            del envelope["output"]
        elif failure == "null_output":
            envelope["output"] = None
        elif failure == "missing_content":
            envelope["output"][0].pop("content")
        elif failure == "over_budget":
            envelope["usage"]["input_tokens"] = 100_000
        return httpx.Response(200, json=envelope)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            provider = OpenAIProvider(AiSettings(enabled=True, api_key="test-not-a-real-key"), http_client=http)
            if failure not in (None, "acknowledged") or (ceiling and failure != "acknowledged"):
                with pytest.raises(ProviderFailure) as error:
                    await provider.generate(brief, clarifications)
                assert "PRIVATE-DETAIL" not in str(error.value)
                assert error.value.budget_violation is (failure == "over_budget")
            else:
                result = await provider.generate(brief, clarifications)
                assert result.draft.cards and result.input_tokens == 100
    asyncio.run(run())
    assert len(seen) == 1


def test_oversized_payload_never_sent():
    brief, clarifications = inputs()
    clarifications["A"]["unexpected"] = "x" * 30_000
    with pytest.raises(ProviderFailure):
        request_body(brief, clarifications)


def test_expectation_copy_matches_the_expecting_role():
    brief, _ = inputs()
    cards = {card.issueId: card for card in template_cards(brief)}
    assert "A가 B에게" in cards["expectation_a"].explanation
    assert "B가 A에게" in cards["expectation_b"].explanation
