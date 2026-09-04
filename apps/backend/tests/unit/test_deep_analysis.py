import importlib

from tests.deep_factory import asset, debt, known, sample_input
from tests.unit.test_deep_cashflow import pair


def test_analysis_is_deterministic_with_versions_and_no_overall_judgment():
    analyze = importlib.import_module("deep.engine.analysis").analyze_deep
    args = pair()
    first = analyze(*args).model_dump(mode="json")
    assert first == analyze(*args).model_dump(mode="json")
    assert first["ruleVersion"] == "deep-rules-v1"
    assert first["source"] == "self_reported_and_calculated"
    assert first["topics"] == []
    assert not {"overallCompatibilityScore", "numericSayDo", "rank"} & set(first)
    assert len(first["cashflow"]["data"]["projection"]) == 12


def test_zero_income_ratio_is_unavailable_negative_net_worth_is_preserved():
    analyze = importlib.import_module("deep.engine.analysis").analyze_deep
    a, b = sample_input(), sample_input()
    a["income"]["monthlyNetIncome"] = b["income"]["monthlyNetIncome"] = known(0)
    a["assets"] = [asset(balance=known(1000000))]
    a["debts"] = [debt(balance=known(12000000))]
    result = analyze(*pair(a=a, b=b))
    assert result.cashflow.data["netWorthWon"] == -11000000
    assert result.cashflow.data["repaymentToNetIncomeRatio"] is None
    assert any(warning["code"] == "ZERO_INCOME_RATIO_UNAVAILABLE" for warning in result.warnings)
    assert result.cashflow.data["scenarioMonthlySurplusWon"] < 0


def test_missing_financial_block_does_not_block_value_topics():
    analyze = importlib.import_module("deep.engine.analysis").analyze_deep
    a, b = sample_input(), sample_input()
    a["income"]["monthlyNetIncome"] = {"status": "withheld"}
    b["values"]["D1"] = 5
    result = analyze(*pair(a=a, b=b))
    assert result.cashflow.status == "unavailable"
    assert result.topics == ["savings"]
