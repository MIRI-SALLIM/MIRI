import importlib
import json

import pytest

from tests.deep_factory import ready_document


def build(document):
    return importlib.import_module("deep.report").build_report(document)


def test_copy_validation_rejects_missing_template_fields_at_startup(monkeypatch):
    from copy import deepcopy
    from unittest.mock import Mock

    from deep import config, report

    data = deepcopy(report.load_copy("deep-copy-ko-v1"))
    data["areas"]["savings"].pop("question")
    monkeypatch.setattr(report.json, "loads", Mock(return_value=data))
    with pytest.raises(Exception, match="INVALID_COPY_CONFIGURATION"):
        report.load_copy("deep-copy-ko-v1")
    monkeypatch.undo()
    loader = Mock(wraps=report.load_copy)
    monkeypatch.setattr(report, "load_copy", loader)
    config.validate_configuration()
    loader.assert_called_once_with("deep-copy-ko-v1")


def test_finance_opt_out_excludes_numbers_private_notes_and_all_financial_derivations():
    document = ready_document()
    document["members"]["B"]["consent"]["shareFinance"] = False
    document["members"]["A"]["input"]["income"]["monthlyNetIncome"]["value"] = 987654321
    document["members"]["A"]["input"]["contextNotes"] = {"D1": "PRIVATE-MEMO-123"}
    document["members"]["B"]["input"]["values"]["D1"] = 5
    report = build(document)
    for field in ("cashflow", "housing", "goal"):
        assert report[field]["status"] == "unavailable"
        assert report[field]["reason"] == "sharing_not_authorized"
        assert report[field]["data"] is None
    assert report["topics"][0]["area"] == "savings"
    assert report["limitations"]["policyMatching"] == "unavailable"
    serialized = json.dumps(report)
    assert "987654321" not in serialized and "PRIVATE-MEMO-123" not in serialized
    assert "numericSayDo" not in report and "overallCompatibilityScore" not in report


def test_values_opt_out_does_not_calculate_or_expose_answer_gaps(monkeypatch):
    module = importlib.import_module("deep.report")

    def forbidden(*args, **kwargs):
        raise AssertionError("Value computation without sharing permission")

    monkeypatch.setattr(module, "value_gaps", forbidden)
    document = ready_document()
    document["members"]["B"]["consent"]["shareValues"] = False
    result = module.build_report(document)
    assert result["values"]["status"] == "unavailable"
    assert result["topics"] == []
    assert result["cashflow"]["data"]["scenarioMonthlySurplusWon"] == 5000000


def test_finance_opt_out_does_not_even_invoke_financial_calculation(monkeypatch):
    module = importlib.import_module("deep.report")

    def forbidden(*args, **kwargs):
        raise AssertionError("Financial computation without sharing permission")

    monkeypatch.setattr(module, "analyze_finances", forbidden)
    document = ready_document()
    document["members"]["A"]["consent"]["shareFinance"] = False
    assert module.build_report(document)["cashflow"]["status"] == "unavailable"


def test_same_answers_create_no_conflict_but_offer_common_agreement_prompts():
    report = build(ready_document())
    assert report["topics"] == []
    assert report["agreementPrompts"]
    assert report["limitations"]["explanation"] == "templates_only"


def test_topic_comparisons_are_tied_to_real_questions_and_exclude_free_text():
    document = ready_document()
    document["members"]["A"]["input"]["values"].update(D7=1, D8=1)
    document["members"]["B"]["input"]["values"].update(D7=5, D8=5)
    report = build(document)
    topic = report["topics"][0]
    assert topic["area"] == "jointManagement"
    assert {row["questionId"] for row in topic["comparisons"]} == {"D7", "D8"}
    assert topic["comparisons"][0]["a"]["answer"] == 1
    assert topic["comparisons"][0]["b"]["answer"] == 5
    assert "통합 관리" in topic["comparisons"][0]["a"]["label"]
    assert topic["question"].endswith("?")


def test_unsubmitted_or_stale_consent_snapshot_cannot_be_reported():
    document = ready_document()
    document["members"]["B"]["submittedAt"] = None
    with pytest.raises(Exception, match="PUBLICATION_NOT_READY"):
        build(document)
