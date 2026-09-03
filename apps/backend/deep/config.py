import json
from collections import Counter
from pathlib import Path
from typing import Any

CONFIG_DIR = Path(__file__).resolve().parents[1] / "config"
AREAS = ("jointManagement", "savings", "spending", "debt", "investment")
QUESTION_IDS = tuple(f"D{i}" for i in range(1, 11))


def validate_questions(data: dict[str, Any], version: str) -> None:
    questions = data.get("questions", [])
    expected_ids = set(QUESTION_IDS if version == "deep-v2" else QUESTION_IDS[:8])
    valid = (
        data.get("version") == version and data.get("scale") == {"min": 1, "max": 5}
        and len(questions) == len(expected_ids) and {q.get("id") for q in questions} == expected_ids
        and all(q.get("area") in AREAS and type(q.get("reverse")) is bool
                and all(isinstance(q.get(key), str) and q[key].strip() for key in ("text", "left", "right"))
                for q in questions)
    )
    if version == "deep-v2":
        valid = valid and Counter(q["area"] for q in questions) == {area: 2 for area in AREAS}
    if not valid:
        raise ValueError("INVALID_QUESTION_CONFIG")


def load_questions(version: str) -> dict[str, Any]:
    filenames = {"deep-v1": "deep_questions.v1.json", "deep-v2": "deep_questions.v2.json"}
    if version not in filenames:
        raise ValueError("QUESTION_SET_NOT_FOUND")
    data = json.loads((CONFIG_DIR / filenames[version]).read_text(encoding="utf-8"))
    validate_questions(data, version)
    return data


def load_rules(version: str) -> dict[str, Any]:
    if version != "deep-rules-v1":
        raise ValueError("RULE_SET_NOT_FOUND")
    data = json.loads((CONFIG_DIR / "deep_rules.v1.json").read_text(encoding="utf-8"))
    if (data.get("version") != version or data.get("cohabitationMultiplier") != "0.85"
            or data.get("areaOrder") != list(AREAS) or data.get("topicLimit") != 3
            or any(data.get(key) is not False for key in ("numericSayDoEnabled", "policyMatchingEnabled", "llmEnabled"))):
        raise ValueError("INVALID_RULE_CONFIG")
    return data


def normalize_answer(answer: int, reverse: bool) -> int:
    if type(answer) is not int or not 1 <= answer <= 5:
        raise ValueError("INVALID_ANSWER")
    return 6 - answer if reverse else answer


def validate_configuration() -> None:
    from deep.report import load_copy

    for version in ("deep-v1", "deep-v2"):
        load_questions(version)
    load_rules("deep-rules-v1")
    load_copy("deep-copy-ko-v1")
