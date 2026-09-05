import asyncio
import json
import os
from dataclasses import dataclass, field
from typing import Any

import httpx
from openai import APIError, AsyncOpenAI
from pydantic import Field, ValidationError, field_validator

from deep.errors import DeepError
from deep.meeting.contracts import SharedClarifications
from deep.meeting.explanation import validate_grounding
from deep.meeting.models import ExplanationCard, ExplanationDraft, MeetingBrief
from deep.meeting.templates import template_cards
from deep.schemas import StrictModel

MODEL = "gpt-5.4-mini-2026-03-17"
PROMPT_VERSION = "money-meeting-v7-selected-evidence-slots"
MAX_OUTPUT_TOKENS = 800
MAX_REQUEST_BYTES = 16_000
RESERVED_INPUT_TOKENS = MAX_REQUEST_BYTES + 4096
TIMEOUT_SECONDS = 20
MONTHLY_ISSUE_IDS = {'contribution_gap', 'contribution_unknown', 'excess_contributions', 'expectation_a', 'expectation_b'}
# Micro-USD rounded up; input $0.75/M, output $4.50/M, no cache discount.
RESERVATION_MICRO_USD = (3 * RESERVED_INPUT_TOKENS + 18 * MAX_OUTPUT_TOKENS + 3) // 4
INSTRUCTIONS = """Explain a Korean couple's submitted shared-budget intentions, not their financial capacity.
Return Korean explanation/question text cards for the supplied issues in their exact order.
Do not return issueId or factId; the server binds each text card to its preselected evidence slot.
Use only the brief and clarifications. Never invent facts, calculate numbers, or output numbers in prose.
Numbers are separately rendered from server facts. Null means unknown, never zero.
initialProposal is negotiable intention; selfReportedLimit is a stated ceiling, not verified affordability.
adjustableMonthlyWon is a stated negotiation ceiling, not consent to increase contributions. Never pressure beyond it.
Use already supplied clarifications. Do not ask whether a known initialProposal is a proposal or ceiling again.
Keep explanations declarative; put the single discussion question only in the question field.
Be direct about uncovered budget or differing expectations without blaming a partner.
Connect the observed fact to its significance for the shared plan, then to a decision the couple can discuss.
Use everyday Korean; explain any necessary financial term in context. Do not assume marriage, cohabitation, or motives.
Brevity alone is not the goal: preserve the uncomfortable fact and explain a useful next step, not generic encouragement.
expectation_a compares A's expectation of B with B's contribution; expectation_b compares B's expectation of A with A's contribution.
agreementStatus describes only the current monthly contribution agreement, never housing or savings agreement.
Facts describe original submissions. Do not claim old gaps remain after agreement.
Ask one concrete discussion question per card. Never announce agreement, fairness, personality or relationship quality,
loan approval, investment advice, or policy entitlement. No outside knowledge, links, or markdown.
If evidence is incomplete say it needs confirmation. Produce at most three short cards.
For sharedPlan scope, return exactly one text card for each of the first three supplied issues, in order.
housing_gap refers only to the first dated shortfall, never the sum of cumulative deadlines.
housing_expected is uncertain future funding, not money available now. housing_unknown prevents a complete conclusion.
monthly_surplus is a scenario assuming current non-housing expenses and planned repayments, not verified disposable income.
goal_saving_gap and housing_gap are separate needs; never add them or count the same asset twice.
condition_discussion only states that a constraint needs discussion; never invent its content or owner.
"""


@dataclass(frozen=True)
class AiSettings:
    enabled: bool = False
    api_key: str = field(default="", repr=False)
    daily_micro_usd: int = 250_000
    daily_calls: int = 20
    total_micro_usd: int | None = None
    prior_micro_usd: int = 0
    extended_enabled: bool = False

    @classmethod
    def load(cls) -> "AiSettings":
        try:
            budget = int(os.environ.get("DEEP_MEETING_AI_DAILY_MICRO_USD", "250000"))
            calls = int(os.environ.get("DEEP_MEETING_AI_DAILY_CALLS", "20"))
            if not 0 <= budget <= 5_000_000 or not 0 <= calls <= 200:
                raise ValueError
            total_raw = os.environ.get("DEEP_MEETING_AI_TOTAL_MICRO_USD")
            prior_raw = os.environ.get("DEEP_MEETING_AI_PRIOR_MICRO_USD")
            total, prior = None, 0
            if total_raw is not None or prior_raw is not None:
                if total_raw is None or prior_raw is None:
                    raise ValueError
                total, prior = int(total_raw), int(prior_raw)
                if not 0 <= prior <= total <= 5_000_000:
                    raise ValueError
        except ValueError:
            return cls()
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        return cls(os.environ.get("DEEP_MEETING_AI_ENABLED", "false") == "true" and bool(key), key, budget, calls, total, prior,
                   os.environ.get('DEEP_MEETING_AI_EXTENDED_ENABLED', 'false') == 'true')


class ProviderFailure(Exception):
    def __init__(self, *, budget_violation: bool = False) -> None:
        super().__init__("AI_PROVIDER_UNAVAILABLE")
        self.budget_violation = budget_violation


@dataclass(frozen=True)
class GeneratedExplanation:
    draft: ExplanationDraft
    input_tokens: int
    output_tokens: int


class ProviderCard(StrictModel):
    explanation: str = Field(min_length=1, max_length=300)
    question: str = Field(min_length=1, max_length=160)

    @field_validator('explanation', 'question')
    @classmethod
    def text_without_numbers(cls, value: str) -> str:
        if not value.strip() or any(char.isnumeric() for char in value):
            raise ValueError('INVALID_EXPLANATION_TEXT')
        return value


class ProviderDraft(StrictModel):
    cards: list[ProviderCard] = Field(min_length=1, max_length=3)


def request_body(brief: MeetingBrief, clarifications: dict[str, Any]) -> dict[str, Any]:
    try:
        shared = SharedClarifications.model_validate(clarifications)
    except ValidationError:
        raise ProviderFailure() from None
    guidance = ""
    for role in ("A", "B"):
        if getattr(shared, role).contributionMeaning == "selfReportedLimit" and has_monthly_cards(brief):
            guidance += f'\nMandatory: include the exact phrase "{role}가 밝힌 상한" in an explanation. Treat it as a self-reported ceiling, not a negotiable initial proposal or verified capacity.'
    if guidance:
        guidance += "\nKeep that ceiling fixed in discussion options. Do not ask for a generic redistribution. "
    questions = [card.question for card in template_cards(brief, shared.model_dump(mode="json"))]
    guidance += "\nUse these server-selected discussion directions; do not turn possible adjustments into commitments: " + json.dumps(questions, ensure_ascii=False)
    facts = {fact.id: fact.model_dump(mode='json') for fact in brief.facts}
    selected = brief.issues[:3]
    payload = {
        'context': {
            'scope': brief.scope, 'startMonth': brief.startMonth,
            'housingGapDate': brief.housingGapDate.isoformat() if brief.housingGapDate else None,
            'commonScope': brief.commonScope, 'sourceHasAssumptions': brief.sourceHasAssumptions,
            'monthlyAgreementStatus': brief.agreementStatus, 'basis': brief.basis,
        },
        'evidenceSlots': [
            {'issue': issue.id, 'facts': [facts[fact_id] for fact_id in issue.factIds]}
            for issue in selected
        ],
        'clarifications': shared.model_dump(mode='json'),
    }
    body = {
        "model": MODEL, "instructions": INSTRUCTIONS + guidance,
        "input": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        "text": {"format": {"type": "json_schema", "name": "money_meeting", "strict": True,
                            "schema": ProviderDraft.model_json_schema()}},
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
        monthly_cards = [generated.draft.cards[index] for index, issue in enumerate(brief.issues[:3])
                         if issue.id in MONTHLY_ISSUE_IDS]
        for role in ("A", "B"):
            if (getattr(shared, role).contributionMeaning == "selfReportedLimit" and monthly_cards
                    and not any(f"{role}가 밝힌 상한" in card.explanation for card in monthly_cards)):
                # Required acknowledgment only; not a semantic truth/safety guarantee.
                raise ProviderFailure()
        return generated


def has_monthly_cards(brief: MeetingBrief) -> bool:
    return any(issue.id in MONTHLY_ISSUE_IDS for issue in brief.issues[:3])


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
        text = ProviderDraft.model_validate_json(response.output_text)
        expected = brief.issues[:3]
        if len(text.cards) != len(expected):
            raise ProviderFailure()
        draft = validate_grounding(ExplanationDraft(cards=[ExplanationCard(
            issueId=issue.id, factIds=issue.factIds,
            explanation=card.explanation, question=card.question,
        ) for issue, card in zip(expected, text.cards, strict=True)]), brief)
        return GeneratedExplanation(draft, usage.input_tokens, usage.output_tokens)
    except (AttributeError, TypeError, ValidationError, DeepError):
        raise ProviderFailure() from None
