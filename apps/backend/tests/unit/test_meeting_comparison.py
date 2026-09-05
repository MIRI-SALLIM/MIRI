from importlib import import_module

import pytest
from pydantic import ValidationError

from tests.meeting_factory import option


def compare(baseline, proposal):
    return import_module("deep.meeting.comparison").compare_budgets(baseline, proposal)


def test_budget_and_contribution_change_does_not_claim_affordability():
    baseline = option(2_000_000, 800_000, 800_000)
    proposal = option(1_800_000, 1_000_000, 800_000)
    result = compare(baseline, proposal)
    assert result.baselineGapWon == 400_000
    assert result.proposalGapWon == 0
    assert result.budgetChangeWon == -200_000
    assert result.aChangeWon == 200_000 and result.bChangeWon == 0
    assert result.basis == "calculation_only_not_affordability_or_agreement"
    assert baseline.budgetWon == 2_000_000


def test_scope_order_is_irrelevant():
    result = compare(option(10, 2, 3), option(10, 2, 3, commonScope=["food", "housing"]))
    assert result.status == "available" and result.proposalGapWon == 5


@pytest.mark.parametrize("overrides", [{"commonScope": ["food"]}, {"startMonth": "2026-11"}])
def test_mismatched_scope_or_month_does_not_claim_a_saving(overrides):
    result = compare(option(10, 2, 3), option(0, 0, 0, **overrides))
    assert result.status == "unavailable" and result.reason == "scope_or_month_mismatch"
    assert result.proposalGapWon is None and result.budgetChangeWon is None


def test_unknown_inputs_only_hide_affected_comparisons():
    result = compare(option(10, 2, 3), option(10, None, 3))
    assert result.status == "partial"
    assert result.proposalGapWon is None and result.aChangeWon is None
    assert result.baselineGapWon == 5 and result.budgetChangeWon == 0


def test_zero_is_known_and_excess_is_not_negative_gap():
    result = compare(option(0, 0, 0), option(0, 1, 2))
    assert result.status == "available"
    assert result.baselineGapWon == 0 and result.proposalGapWon == 0
    assert result.proposalExcessWon == 3


@pytest.mark.parametrize("value", [True, 1.0, "1", -1, 2**53])
def test_invalid_money_is_not_coerced(value):
    with pytest.raises(ValidationError):
        option(value, 0, 0)


def test_contribution_sum_cannot_exceed_safe_integer():
    with pytest.raises(ValidationError, match="UNSAFE_CONTRIBUTION_TOTAL"):
        option(0, 2**53 - 1, 1)
    assert compare(option(0, 0, 0), option(2**53 - 1, 2**53 - 1, 0)).proposalGapWon == 0


@pytest.mark.parametrize("scope", [[], ["food", "food"], ["private-bank-account"]])
def test_empty_duplicate_or_unknown_scope_is_rejected(scope):
    with pytest.raises(ValidationError):
        option(0, 0, 0, commonScope=scope)
