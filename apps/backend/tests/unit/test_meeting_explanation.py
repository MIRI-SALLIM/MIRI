from importlib import import_module

import pytest
from pydantic import ValidationError

from deep.errors import DeepError
from tests.meeting_factory import explanation, granted, ready_result


def validate(draft, result=None):
    brief = import_module("deep.meeting.brief").build_brief(
        ready_result() if result is None else result, granted())
    return import_module("deep.meeting.explanation").validate_grounding(draft, brief)


def test_known_issue_with_its_fact_can_be_rendered_by_the_caller():
    draft = explanation()
    assert validate(draft) == draft


@pytest.mark.parametrize("facts", [["expectation_a"], ["contribution_gap", "contribution_gap"], []])
def test_cross_issue_duplicate_or_missing_citation_is_rejected(facts):
    with pytest.raises(DeepError, match="MEETING_GROUNDING_INVALID"):
        validate(explanation(facts=facts))


def test_unknown_fact_is_rejected_by_the_schema():
    with pytest.raises(ValidationError):
        explanation(facts=["invented-bank-account"])


def test_nonexistent_issue_cannot_be_added_even_with_a_known_fact():
    with pytest.raises(DeepError, match="MEETING_GROUNDING_INVALID"):
        validate(explanation(issue="excess_contributions", facts=["budget"]))


@pytest.mark.parametrize("text", ["", "   ", "월 40만원이 부족합니다", "월 ４０만원", "월 ④만원", "x" * 301])
def test_invalid_explanation_text_is_rejected(text):
    with pytest.raises(ValidationError):
        explanation(explanation=text)


def test_extra_fields_and_overlong_question_are_rejected():
    for overrides in ({"approved": True}, {"question": "x" * 161}):
        with pytest.raises(ValidationError):
            explanation(**overrides)


def test_more_than_three_cards_is_rejected():
    model = import_module("deep.meeting.models").ExplanationDraft
    with pytest.raises(ValidationError):
        model(cards=explanation().cards * 4)


def test_same_issue_cannot_fill_multiple_cards():
    model = import_module("deep.meeting.models").ExplanationDraft
    with pytest.raises(DeepError, match="MEETING_GROUNDING_INVALID"):
        validate(model(cards=explanation().cards * 2))
