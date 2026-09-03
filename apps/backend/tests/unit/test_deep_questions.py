import importlib
import json
from collections import Counter
from pathlib import Path

import pytest


def test_v2_has_ten_labeled_questions_and_consistent_investment_direction():
    config = importlib.import_module("deep.config")
    questions = config.load_questions("deep-v2")["questions"]
    by_id = {q["id"]: q for q in questions}
    assert set(by_id) == {f"D{i}" for i in range(1, 11)}
    assert Counter(q["area"] for q in questions) == {
        "savings": 2, "spending": 2, "investment": 2, "debt": 2, "jointManagement": 2,
    }
    assert all(q["left"] and q["right"] for q in questions)
    assert config.normalize_answer(5, by_id["D5"]["reverse"]) == 5
    assert config.normalize_answer(5, by_id["D9"]["reverse"]) == 5
    assert config.normalize_answer(1, True) == 5
    assert config.normalize_answer(5, True) == 1


def test_v1_preserves_original_eight_questions_and_light_config_is_unchanged():
    config = importlib.import_module("deep.config")
    original = json.loads((Path(__file__).parents[2] / "config/parameters.json").read_text(encoding="utf-8"))
    assert config.load_questions("deep-v1")["questions"] == original["questionMapping"]["deep"]
    assert config.load_questions("deep-v1")["questions"][4]["reverse"] is True


@pytest.mark.parametrize("version", ["deep-v0", "../parameters", "deep-v3"])
def test_unknown_question_version_is_explicitly_rejected(version):
    config = importlib.import_module("deep.config")
    with pytest.raises(ValueError, match="QUESTION_SET_NOT_FOUND"):
        config.load_questions(version)


@pytest.mark.parametrize("corruption", ["duplicate", "label", "area", "scale", "version"])
def test_invalid_question_config_fails_validation(corruption):
    config = importlib.import_module("deep.config")
    data = config.load_questions("deep-v2")
    if corruption == "duplicate":
        data["questions"][0]["id"] = "D2"
    elif corruption == "label":
        data["questions"][0]["left"] = ""
    elif corruption == "area":
        data["questions"][0]["area"] = "unknown"
    elif corruption == "scale":
        data["scale"]["min"] = 0
    else:
        data["version"] = "other"
    with pytest.raises(ValueError, match="INVALID_QUESTION_CONFIG"):
        config.validate_questions(data, "deep-v2")
    assert config.load_questions("deep-v2")["questions"][0]["id"] == "D1"


def test_mvp_rules_disable_external_and_judgment_features():
    config = importlib.import_module("deep.config")
    rules = config.load_rules("deep-rules-v1")
    assert rules["cohabitationMultiplier"] == "0.85"
    assert rules["topicLimit"] == 3
    assert rules["areaOrder"] == ["jointManagement", "savings", "spending", "debt", "investment"]
    assert not any(rules[k] for k in ("numericSayDoEnabled", "policyMatchingEnabled", "llmEnabled"))


def test_startup_validation_checks_both_question_versions_and_rules(monkeypatch):
    from unittest.mock import Mock

    config = importlib.import_module("deep.config")
    questions = Mock(wraps=config.load_questions)
    rules = Mock(wraps=config.load_rules)
    monkeypatch.setattr(config, "load_questions", questions)
    monkeypatch.setattr(config, "load_rules", rules)
    config.validate_configuration()
    assert [call.args[0] for call in questions.call_args_list] == ["deep-v1", "deep-v2"]
    rules.assert_called_once_with("deep-rules-v1")
