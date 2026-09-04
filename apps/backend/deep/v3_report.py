from datetime import datetime, timezone
from typing import Any

from deep.config import AREAS, load_questions
from deep.engine.values import value_gaps
from deep.errors import DeepError
from deep.service import DeepService
from deep.state import can_publish
from deep.v3_finances import joint_funding, unavailable, v3_cashflow, v3_goal
from deep.v3_models import DeepInputV3, SharedPlanV3
from deep.v3_planning import analyze_planning
from deep.versions import version_fields


def topic_priority(item: dict[str, Any], important: list[str]) -> tuple[int, str, int, str]:
    code = item["code"]
    if code in {"FUNDING_GAP", "MONTHLY_DEFICIT"}:
        priority = 0
    elif code in {"INCOMPLETE_FUNDING", "GAP_UNAVAILABLE", "CONTRIBUTION_UNKNOWN", "CONDITION_NEEDS_DISCUSSION", "CASHFLOW_UNCERTAIN", "HOUSING_UNCERTAIN", "GOAL_UNCERTAIN"}:
        priority = 1
    elif code in {"CONTRIBUTION_GAP", "CONDITION_EXCEEDED", "BORROWING_CONDITION"}:
        priority = 2
    elif code == "VALUE_DIFFERENCE":
        priority = 4
    else:
        priority = 3
    return priority, item.get("date") or "9999-12-31", -important.count(item.get("area", "")), code + item.get("area", "")


def build_v3_report(snapshot: dict[str, Any]) -> dict[str, Any]:
    if not can_publish(snapshot, datetime.now(timezone.utc)):
        raise DeepError("PUBLICATION_NOT_READY")
    if any(snapshot[key] != value for key, value in version_fields("deep-v3").items()):
        raise DeepError("REPORT_VERSION_UNSUPPORTED", 503)
    a, b = snapshot["members"]["A"], snapshot["members"]["B"]
    finances = {key: unavailable("sharing_not_authorized") for key in ("cashflow", "housing", "goal", "planning")}
    issues: list[dict[str, Any]] = []
    if all(member["consent"]["shareFinance"] for member in (a, b)):
        first, second = DeepInputV3.model_validate(a["input"]), DeepInputV3.model_validate(b["input"])
        plan = SharedPlanV3.model_validate(snapshot["plan"]["data"])
        cashflow = v3_cashflow(first, second, plan)
        finances = {"cashflow": cashflow, "housing": joint_funding(first, second, plan),
                    "goal": v3_goal(first, second, plan, cashflow), "planning": analyze_planning(first, second, plan)}
        for key in ("housing", "planning"):
            issues.extend((finances[key].get("data") or {}).get("issues", []))
        if not finances["housing"].get("data"):
            issues.append({"code": "HOUSING_UNCERTAIN", "category": "uncertain", "observation": "납부 일정이나 재원 정보를 확인해야 주거자금 공백을 계산할 수 있습니다.",
                           "question": "납부할 금액·날짜와 각자의 재원 입력을 확인해 주세요."})
        if (cashflow.get("data") or {}).get("scenarioMonthlySurplusWon") is None:
            issues.append({"code": "CASHFLOW_UNCERTAIN", "category": "uncertain", "observation": "월 소득·지출 또는 변경 후 상환 조건이 미정이라 계획의 월 여유자금을 확정할 수 없습니다.",
                           "question": "각자 확인할 수 있는 수치와 상환 후 월 납입액을 보완할까요?"})
        if plan.target:
            saving_gap = (finances["goal"].get("data") or {}).get("monthlySavingShortfallWon")
            if saving_gap is None:
                issues.append({"code": "GOAL_UNCERTAIN", "category": "uncertain", "observation": "목표에 사용할 재원·일정·월 적립 여력을 확인해야 합니다.",
                               "question": "목표 금액과 기한을 유지할지, 먼저 확인할 수치를 정할까요?"})
            elif saving_gap:
                issues.append({"code": "GOAL_SAVING_GAP", "category": "fundingGap", "amountWon": saving_gap,
                               "observation": f"입력한 목표를 맞추려면 월 적립액이 {saving_gap:,}원 더 필요합니다.",
                               "question": "목표 금액·기한·월 지출 중 어느 것을 조정할까요?"})
        if cashflow.get("data") and cashflow["data"]["scenarioMonthlySurplusWon"] is not None and cashflow["data"]["scenarioMonthlySurplusWon"] < 0:
            issues.append({"code": "MONTHLY_DEFICIT", "category": "fundingGap", "observation": "현재 지출을 유지하면 계획 주거비와 상환액 반영 후 월 적자입니다.",
                           "date": plan.startMonth + "-01", "amountWon": -cashflow["data"]["scenarioMonthlySurplusWon"], "question": "어떤 지출이나 주거 계획을 조정할까요?"})
    values = unavailable("sharing_not_authorized")
    value_topics = []
    if all(member["consent"]["shareValues"] for member in (a, b)):
        questions = load_questions("deep-v3")["questions"]
        gaps = value_gaps(a["input"]["values"], b["input"]["values"], questions)
        missing = [area for area, data in gaps.items() if data["status"] != "complete"]
        values = {"status": "unavailable" if all(row["status"] == "unavailable" for row in gaps.values()) else "partial" if missing else "available",
                  "missingFields": missing, "assumptions": ["답변 차이는 미합의나 갈등의 확정 판정이 아닙니다."], "data": gaps}
        for area in AREAS:
            if gaps[area]["status"] != "complete" or gaps[area]["gap"] <= 0:
                continue
            comparisons = [{"questionId": q["id"], "questionText": q["text"], "leftLabel": q["left"], "rightLabel": q["right"],
                            "a": a["input"]["values"].get(q["id"]), "b": b["input"]["values"].get(q["id"])}
                           for q in questions if q["area"] == area and a["input"]["values"].get(q["id"]) is not None
                           and b["input"]["values"].get(q["id"]) is not None and a["input"]["values"][q["id"]] != b["input"]["values"][q["id"]]]
            value_topics.append({"code": "VALUE_DIFFERENCE", "area": area, "comparisons": comparisons,
                                 "observation": "답변의 차이를 확인하고 실제 생활에 적용할 기준을 정해 주세요.",
                                 "question": "어떤 상황에서는 양보할 수 있고, 어떤 기준은 지키고 싶나요?"})
    versions = {key: snapshot[key] for key in (*version_fields("deep-v3"), "round")}
    versions["planVersion"] = snapshot["plan"]["version"]
    important = (a["input"]["importantAreas"] + b["input"]["importantAreas"]) if all(member["consent"]["shareValues"] for member in (a, b)) else []
    topics = sorted(issues + value_topics, key=lambda item: topic_priority(item, important))[:3]
    return {"versions": versions, **finances, "values": values, "issues": issues, "topics": topics,
            "limitations": {"explanation": "templates_only", "policyMatching": "unavailable", "agreementBasis": "submitted_intentions_not_current_agreement",
                            "notice": "입력한 수치에 따른 참고 계산이며 자산·대출 승인 여부를 검증하지 않습니다. 차이 자체를 관계 평가나 합의로 판정하지 않습니다."}}


def operating_status(agreements: list[dict[str, Any]], report: dict[str, Any]) -> dict[str, Any]:
    monthly = [item for item in agreements if item["terms"]["topic"] == "monthlyContribution"]
    confirmed = [item for item in monthly if item["status"] == "agreed"]
    result: dict[str, Any] = {"basis": "current_mutually_confirmed_terms", "status": "notProposed", "contributionGapWon": None}
    if len(confirmed) > 1:
        result["status"] = "conflicting"
    elif confirmed:
        agreement = confirmed[0]
        result.update(status="agreed", agreementId=agreement["id"], version=agreement["version"], terms=agreement["terms"])
        planning = report["planning"].get("data") or {}
        budget = planning.get("commonBudgetWon")
        same_scope = bool(agreement["terms"].get("commonScope")) and sorted(agreement["terms"]["commonScope"]) == planning.get("commonScope")
        comparable = budget is not None and same_scope and agreement["terms"]["startMonth"] == planning.get("startMonth")
        result["comparisonStatus"] = "same_scope_and_month" if comparable else "scope_or_month_unconfirmed"
        result["contributionGapWon"] = max(0, budget - sum(agreement["terms"]["monthlyContributions"].values())) if comparable else None
    elif monthly:
        result["status"] = "proposed" if any(item["status"] == "proposed" for item in monthly) else "deferred"
    return result


async def result_with_agreements(service: DeepService, session_id: str, user_id: str) -> dict[str, Any]:
    result = await service.result(session_id, user_id)
    if result["status"] != "ready":
        return result
    before = await service.repo.get_for_member(session_id, user_id, datetime.now(timezone.utc))
    agreements = await service.repo.list_agreements(session_id, user_id, datetime.now(timezone.utc))
    current = await service.repo.get_for_member(session_id, user_id, datetime.now(timezone.utc))
    if (not can_publish(current, datetime.now(timezone.utc)) or current.get("reportId") != before.get("reportId")
            or current["round"] != result["report"]["versions"]["round"]):
        raise DeepError("ROUND_VERSION_CONFLICT")
    responses = [service.agreement_response(item, user_id) for item in agreements
                 if item.get("sourceReportId") == current["reportId"] and item.get("planVersion") == current["plan"]["version"]]
    return {**result, "agreements": responses, "operatingStatus": operating_status(responses, result["report"])}
