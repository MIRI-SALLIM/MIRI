import pytest

from deep.meeting.brief import build_brief
from deep.meeting.templates import template_cards
from tests.meeting_factory import granted, ready_result


@pytest.mark.parametrize("capped,other_limit", [("A", 1_200_000), ("B", 1_200_000), ("B", None), ("B", 800_000)])
def test_fallback_states_the_correct_ceiling_and_safe_budget_choice(capped, other_limit):
    other = "B" if capped == "A" else "A"
    answers = {capped: {"contributionMeaning": "selfReportedLimit", "adjustableMonthlyWon": None},
               other: {"contributionMeaning": "initialProposal", "adjustableMonthlyWon": other_limit}}
    cards = template_cards(build_brief(ready_result(), granted()), answers)
    gap = cards[0]
    assert capped + "가 밝힌 상한" in gap.explanation
    assert "예산" in gap.question
    assert "늘릴" not in gap.question
    if other_limit == 1_200_000:
        assert other + "의 조정 가능 범위" in gap.question
    elif other_limit is None:
        assert other + "의 조정 가능 여부" in gap.question
    else:
        assert "조정 가능 범위" not in gap.question


def test_both_ceilings_do_not_assume_room_to_increase():
    answers = {role: {"contributionMeaning": "selfReportedLimit", "adjustableMonthlyWon": None} for role in ("A", "B")}
    cards = template_cards(build_brief(ready_result(), granted()), answers)
    assert "A가 밝힌 상한" in cards[0].explanation and "B가 밝힌 상한" in cards[0].explanation
    assert "예산" in cards[0].question and "줄일" in cards[0].question
    assert "조정 가능 범위" not in cards[0].question


@pytest.mark.parametrize("target", ["A", "B"])
@pytest.mark.parametrize("other_meaning", ["initialProposal", "selfReportedLimit"])
def test_known_initial_proposal_is_not_asked_again_even_without_partner_ceiling(target, other_meaning):
    other = "B" if target == "A" else "A"
    answers = {target: {"contributionMeaning": "initialProposal", "adjustableMonthlyWon": 1_200_000},
               other: {"contributionMeaning": other_meaning, "adjustableMonthlyWon": None}}
    cards = template_cards(build_brief(ready_result(), granted()), answers)
    issue = "expectation_b" if target == "A" else "expectation_a"
    question = next(card.question for card in cards if card.issueId == issue)
    assert "시작점인지" not in question and "상한인지" not in question
    assert f"{target}의 초기 제안" in question
    assert f"{other}가 기대한" in question


def test_unknown_contribution_meaning_still_gets_clarified():
    answers = {role: {"contributionMeaning": "unknown", "adjustableMonthlyWon": None} for role in ("A", "B")}
    cards = template_cards(build_brief(ready_result(), granted()), answers)
    assert "상한인지" in next(card.question for card in cards if card.issueId == "expectation_b")
