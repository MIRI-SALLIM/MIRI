import importlib

from tests.deep_factory import asset, sample_input, sample_plan
from tests.unit.test_deep_cashflow import pair


def test_goal_requirement_ceils_shortfall_and_handles_past_or_already_funded():
    requirement = importlib.import_module("deep.engine.goals").goal_requirement
    assert requirement(10000000, 4000000, 12) == 500000
    assert requirement(10000001, 4000000, 12) == 500001
    assert requirement(10000000, 4000000, 0) is None
    assert requirement(10000000, 10000000, 0) == 0


def test_goal_uses_only_exclusive_available_allocation_and_reports_shortfall():
    goals = importlib.import_module("deep.engine.goals")
    a = sample_input()
    a["assets"] = [asset(housingAllocationWon=4000000, goalAllocationWon=4000000)]
    plan = {**sample_plan(), "target": {"title": "우리 목표", "amountWon": 10000000, "targetMonth": "2027-10"}}
    data = goals.calculate_goal(*pair(a=a, plan=plan))["data"]
    assert data["allocatedWon"] == 4000000
    assert data["requiredMonthlySavingWon"] == 500000
    assert data["monthlySavingShortfallWon"] == 0
    plan["target"]["targetMonth"] = "2026-09"
    block = goals.calculate_goal(*pair(a=a, plan=plan))
    assert block["status"] == "unavailable"
    assert block["data"]["requiredMonthlySavingWon"] is None
