import importlib

from deep.config import load_questions


def gaps(a, b, questions=None):
    return importlib.import_module("deep.engine.values").value_gaps(a, b, questions or load_questions("deep-v2")["questions"])


def topics(result, a=None, b=None):
    return importlib.import_module("deep.engine.topics").select_topics(result, a or [], b or [])


def test_equal_answers_do_not_create_conflict_topics():
    answers = {f"D{i}": 3 for i in range(1, 11)}
    result = gaps(answers, answers)
    assert all(item["gap"] == 0 for item in result.values())
    assert topics(result) == []


def test_tie_uses_explicit_importance_then_fixed_order():
    result = {k: {"gap": 0.5, "status": "complete"} for k in ["savings", "spending", "investment", "debt", "jointManagement"]}
    assert topics(result, ["debt"], ["debt"]) == ["debt", "jointManagement", "savings"]


def test_skipped_partial_and_unavailable_are_not_middle_answers_or_full_topics():
    a = {f"D{i}": 1 for i in range(1, 11)}
    b = {f"D{i}": 5 for i in range(1, 11)}
    a["D1"] = None
    a["D3"] = a["D4"] = None
    result = gaps(a, b)
    assert result["savings"]["status"] == "partial"
    assert result["savings"]["comparedQuestionIds"] == ["D2"]
    assert result["spending"]["gap"] is None
    assert result["spending"]["status"] == "unavailable"
    assert topics(result) == ["jointManagement", "debt", "investment"]


def test_question_order_and_reverse_do_not_change_absolute_gaps():
    a = {f"D{i}": 1 for i in range(1, 11)}
    b = {f"D{i}": 5 for i in range(1, 11)}
    original = load_questions("deep-v2")["questions"]
    reversed_questions = [{**q, "reverse": not q["reverse"]} for q in reversed(original)]
    assert gaps(a, b) == gaps(a, b, reversed_questions) == gaps(b, a)


def test_only_one_different_area_yields_only_one_topic():
    a = {f"D{i}": 3 for i in range(1, 11)}
    b = {**a, "D3": 4}
    assert topics(gaps(a, b)) == ["spending"]
