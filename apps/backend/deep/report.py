import json
from datetime import datetime, timezone
from typing import Any

from deep.config import AREAS, CONFIG_DIR, load_questions
from deep.engine.analysis import analyze_finances
from deep.engine.topics import select_topics
from deep.engine.values import value_gaps
from deep.errors import DeepError
from deep.schemas import DeepInput, SharedPlan
from deep.state import can_publish


def load_copy(version: str) -> dict[str, Any]:
    if version != "deep-copy-ko-v1":
        raise DeepError("COPY_VERSION_UNSUPPORTED", 503)
    data = json.loads((CONFIG_DIR / "deep_copy.ko.v1.json").read_text(encoding="utf-8"))
    def text(value: Any) -> bool:
        return isinstance(value, str) and bool(value.strip())

    def texts(value: Any) -> bool:
        return isinstance(value, list) and bool(value) and all(text(item) for item in value)

    try:
        valid = (data.get("version") == version and set(data.get("areas", {})) == set(AREAS)
                 and text(data.get("observation")) and text(data.get("notice")) and texts(data.get("commonPrompts"))
                 and set(data.get("scaleLabels", {})) == {"1", "2", "3", "4", "5"}
                 and all(text(label) and text(label.format(left="L", right="R")) for label in data["scaleLabels"].values())
                 and all(all(text(area.get(key)) for key in ("title", "question", "agreementPrompt"))
                         and texts(area.get("options")) for area in data["areas"].values()))
    except (AttributeError, KeyError, TypeError, ValueError, IndexError):
        valid = False
    if not valid:
        raise DeepError("INVALID_COPY_CONFIGURATION", 503)
    return data


def render_topic(area: str, a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    copy = load_copy("deep-copy-ko-v1")
    template = copy["areas"][area]
    comparisons = []
    for question in load_questions("deep-v2")["questions"]:
        key = question["id"]
        answer_a, answer_b = a.get("values", {}).get(key), b.get("values", {}).get(key)
        if question["area"] != area or answer_a is None or answer_b is None or answer_a == answer_b:
            continue
        comparisons.append({"questionId": key, "questionText": question["text"],
                            "a": {"answer": answer_a, "label": copy["scaleLabels"][str(answer_a)].format(**question)},
                            "b": {"answer": answer_b, "label": copy["scaleLabels"][str(answer_b)].format(**question)}})
    return {"area": area, "title": template["title"], "observation": copy["observation"], "comparisons": comparisons,
            "question": template["question"], "options": template["options"], "agreementPrompt": template["agreementPrompt"]}


def unavailable(reason: str) -> dict[str, Any]:
    return {"status": "unavailable", "reason": reason, "missingFields": [], "assumptions": [], "data": None}


def build_report(snapshot: dict[str, Any]) -> dict[str, Any]:
    if not can_publish(snapshot, datetime.now(timezone.utc)):
        raise DeepError("PUBLICATION_NOT_READY")
    if snapshot["questionVersion"] != "deep-v2" or snapshot["ruleVersion"] != "deep-rules-v1":
        raise DeepError("REPORT_VERSION_UNSUPPORTED", 503)
    copy = load_copy(snapshot["copyVersion"])
    a, b = snapshot["members"]["A"], snapshot["members"]["B"]
    allow_finance = all(member["consent"]["shareFinance"] for member in (a, b))
    allow_values = all(member["consent"]["shareValues"] for member in (a, b))
    finances = {key: unavailable("sharing_not_authorized") for key in ("cashflow", "housing", "goal")}
    warnings = []
    if allow_finance:
        analysis = analyze_finances(DeepInput.model_validate(a["input"]), DeepInput.model_validate(b["input"]),
                                    SharedPlan.model_validate(snapshot["plan"]["data"]))
        finances = {key: analysis[key] for key in ("cashflow", "housing", "goal")}
        warnings = analysis["warnings"]
    values = unavailable("sharing_not_authorized")
    topics = []
    if allow_values:
        gaps = value_gaps(a["input"]["values"], b["input"]["values"], load_questions(snapshot["questionVersion"])["questions"])
        missing = [area for area, data in gaps.items() if data["status"] != "complete"]
        values = {"status": "partial" if missing else "available", "missingFields": missing, "assumptions": [], "data": gaps}
        if all(data["status"] == "unavailable" for data in gaps.values()):
            values["status"] = "unavailable"
        areas = select_topics(gaps, a["input"]["importantAreas"], b["input"]["importantAreas"])
        topics = [render_topic(area, a["input"], b["input"]) for area in areas]
    versions = {key: snapshot[key] for key in ("questionVersion", "ruleVersion", "copyVersion", "consentVersion", "round")}
    versions["planVersion"] = snapshot["plan"]["version"]
    if allow_finance and snapshot["plan"]["data"]["startMonth"] < datetime.now(timezone.utc).strftime("%Y-%m"):
        warnings.append({"code": "PLAN_START_MONTH_IN_PAST", "field": "plan.startMonth"})
    return {"versions": versions, **finances, "values": values, "topics": topics,
            "agreementPrompts": [topic["agreementPrompt"] for topic in topics] or copy["commonPrompts"],
            "limitations": {"policyMatching": "unavailable", "explanation": "templates_only", "notice": copy["notice"]},
            "warnings": warnings}
