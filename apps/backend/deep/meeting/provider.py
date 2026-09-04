import asyncio
import json
import os
from dataclasses import dataclass, field
from typing import Any

import httpx
from openai import APIError, AsyncOpenAI
from pydantic import ValidationError

from deep.errors import DeepError
from deep.meeting.contracts import SharedClarifications
from deep.meeting.explanation import validate_grounding
from deep.meeting.models import ExplanationDraft, MeetingBrief
from deep.meeting.templates import template_cards

MODEL = "gpt-5.4-mini-2026-03-17"
PROMPT_VERSION = "money-meeting-v2-ceilings"
MAX_OUTPUT_TOKENS = 800
MAX_REQUEST_BYTES = 16_000
RESERVED_INPUT_TOKENS = MAX_REQUEST_BYTES + 4096
TIMEOUT_SECONDS = 20
# Micro-USD rounded up; input $0.75/M, output $4.50/M, no cache discount.
RESERVATION_MICRO_USD = (3 * RESERVED_INPUT_TOKENS + 18 * MAX_OUTPUT_TOKENS + 3) // 4
INSTRUCTIONS = """Explain a Korean couple's submitted shared-budget intentions, not their financial capacity.
Return Korean explanation/question cards ONLY for supplied issueIds and factIds, prioritizing the funding gap.
Use only the brief and clarifications. Never invent facts, calculate numbers, or output numbers in prose.
Numbers are separately rendered from server facts. Null means unknown, never zero.
initialProposal is negotiable intention; selfReportedLimit is a stated ceiling, not verified affordability.
adjustableMonthlyWon is a stated negotiation ceiling, not consent to increase contributions. Never pressure beyond it.
Be direct about uncovered budget or differing expectations without blaming a partner.
expectation_a compares A's expectation of B with B's contribution; expectation_b compares B's expectation of A with A's contribution.
agreementStatus describes current agreement; facts describe original submissions. Do not claim old gaps remain after agreement.
Ask one concrete discussion question per card. Never announce agreement, fairness, personality or relationship quality,
loan approval, investment advice, or policy entitlement. No outside knowledge, links, or markdown.
If evidence is incomplete say it needs confirmation. Produce at most three short cards.
"""


@dataclass(frozen=True)
class AiSettings:
    enabled: bool = False
    api_key: str = field(default="", repr=False)
    daily_micro_usd: int = 250_000
    daily_calls: int = 20

    @classmethod
    def load(cls) -> "AiSettings":
        try:
            budget = int(os.environ.get("DEEP_MEETING_AI_DAILY_MICRO_USD", "250000"))
            calls = int(os.environ.get("DEEP_MEETING_AI_DAILY_CALLS", "20"))
            if not 0 <= budget <= 5_000_000 or not 0 <= calls <= 200:
                raise ValueError
        except ValueError:
            return cls()
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        return cls(os.environ.get("DEEP_MEETING_AI_ENABLED", "false") == "true" and bool(key), key, budget, calls)


class ProviderFailure(Exception):
    def __init__(self, *, budget_violation: bool = False) -> None:
        super().__init__("AI_PROVIDER_UNAVAILABLE")
        self.budget_violation = budget_violation


@dataclass(frozen=True)
class GeneratedExplanation:
    draft: ExplanationDraft
    input_tokens: int
    output_tokens: int


def request_body(brief: MeetingBrief, clarifications: dict[str, Any]) -> dict[str, Any]:
    try:
        shared = SharedClarifications.model_validate(clarifications)
    except ValidationError:
        raise ProviderFailure() from None
    guidance = ""
    for role in ("A", "B"):
        if getattr(shared, role).contributionMeaning == "selfReportedLimit":
            guidance += f'\nMandatory: include the exact phrase "{role}가 밝힌 상한" in an explanation. Treat it as a self-reported ceiling, not a negotiable initial proposal or verified capacity.'
    if guidance:
        questions = [card.question for card in template_cards(brief, shared.model_dump(mode="json"))]
        guidance += "\nKeep that ceiling fixed in discussion options. Do not ask for a generic redistribution. "
        guidance += "Use these server-selected discussion directions; do not turn possible adjustments into commitments: " + json.dumps(questions, ensure_ascii=False)
    body = {
        "model": MODEL, "instructions": INSTRUCTIONS + guidance,
        "input": json.dumps({"brief": brief.model_dump(mode="json"), "clarifications": shared.model_dump(mode="json")},
                            ensure_ascii=False, separators=(",", ":")),
        "text": {"format": {"type": "json_schema", "name": "money_meeting", "strict": True,
                            "schema": ExplanationDraft.model_json_schema()}},
        "reasoning": {"effort": "none"}, "max_output_tokens": MAX_OUTPUT_TOKENS, "store": False,
        "service_tier": "default",
    }
    if len(json.dumps(body, ensure_ascii=False).encode("utf-8")) > MAX_REQUEST_BYTES:
        raise ProviderFailure()
    return body


class OpenAIProvider:
    def __init__(self, settings: AiSettings, *, http_client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.http_client = http_client

    async def generate(self, brief: MeetingBrief, clarifications: dict[str, Any]) -> GeneratedExplanation:
        if not self.settings.enabled:
            raise ProviderFailure()
        body = request_body(brief, clarifications)
        try:
            async with AsyncOpenAI(api_key=self.settings.api_key, base_url="https://api.openai.com/v1",
                                   max_retries=0, timeout=TIMEOUT_SECONDS, http_client=self.http_client) as client:
                async with asyncio.timeout(TIMEOUT_SECONDS):
                    response = await client.responses.create(**body)
        except (APIError, httpx.HTTPError, TimeoutError):
            raise ProviderFailure() from None
        generated = parse_response(response, brief)
        shared = SharedClarifications.model_validate(clarifications)
        for role in ("A", "B"):
            if (getattr(shared, role).contributionMeaning == "selfReportedLimit"
                    and not any(f"{role}가 밝힌 상한" in card.explanation for card in generated.draft.cards)):
                # Required acknowledgment only; not a semantic truth/safety guarantee.
                raise ProviderFailure()
        return generated


def parse_response(response: Any, brief: MeetingBrief) -> GeneratedExplanation:
    # The SDK may construct partially typed objects from malformed successful responses.
    try:
        usage = response.usage
        if usage and (type(usage.input_tokens) is not int or type(usage.output_tokens) is not int
                      or not 0 <= usage.input_tokens <= RESERVED_INPUT_TOKENS
                      or not 0 <= usage.output_tokens <= MAX_OUTPUT_TOKENS):
            raise ProviderFailure(budget_violation=True)
        if response.status != "completed" or not usage or not response.output_text:
            raise ProviderFailure()
        if any(item.type == "message" and any(part.type == "refusal" for part in item.content) for item in response.output):
            raise ProviderFailure()
        draft = validate_grounding(ExplanationDraft.model_validate_json(response.output_text), brief)
        return GeneratedExplanation(draft, usage.input_tokens, usage.output_tokens)
    except (AttributeError, TypeError, ValidationError, DeepError):
        raise ProviderFailure() from None
