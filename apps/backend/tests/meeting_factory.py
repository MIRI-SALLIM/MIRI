from importlib import import_module

from deep.v3_report import build_v3_report
from deep.versions import version_fields
from tests.deep_factory import ready_document
from tests.v3_factory import v3_input, v3_plan


def ready_result(a=None, b=None):
    document = ready_document()
    document.update(version_fields("deep-v3"))
    document["plan"]["data"] = v3_plan()
    for role, data in (("A", a), ("B", b)):
        member = document["members"][role]
        member["input"] = v3_input() if data is None else data
        member["consent"]["version"] = document["consentVersion"]
    return {"status": "ready", "report": build_v3_report(document),
            "agreements": [], "operatingStatus": {"status": "notProposed"}}


def granted(**overrides):
    return import_module("deep.meeting.models").MeetingPermissions(
        **{"aiA": True, "aiB": True, "financeA": True, "financeB": True, **overrides})


def option(budget, a, b, **overrides):
    return import_module("deep.meeting.models").BudgetOption(
        **{"commonScope": ["housing", "food"], "startMonth": "2026-10",
           "budgetWon": budget, "aWon": a, "bWon": b, **overrides})


def explanation(issue="contribution_gap", facts=None, **overrides):
    model = import_module("deep.meeting.models").ExplanationDraft
    return model.model_validate({"cards": [{"issueId": issue,
        "factIds": ["contribution_gap"] if facts is None else facts,
        "explanation": "제시한 분담액과 공동 예산 사이에 공백이 있습니다.",
        "question": "각자의 제안 금액과 공동 예산 중 무엇을 조정할까요?", **overrides}]})
