from importlib import import_module

from deep.v3_models import DeepInputV3, SharedPlanV3
from tests.deep_factory import debt, known
from tests.v3_factory import v3_input, v3_plan


def pair(a=None, b=None, plan=None):
    return (DeepInputV3.model_validate(a or v3_input()), DeepInputV3.model_validate(b or v3_input()),
            SharedPlanV3.model_validate(plan or v3_plan()))


def test_common_budget_gap_and_expectation_gaps_are_not_summed():
    block = import_module("deep.v3_planning").analyze_planning(*pair())
    assert block["data"]["contributionGapWon"] == 400_000
    assert [item["differenceWon"] for item in block["data"]["expectationDifferences"]] == [400_000, 400_000]
    assert block["data"]["basis"] == "submitted_intentions_not_agreement"


def test_unknown_personal_contribution_is_not_zero():
    a = v3_input()
    a["contribution"]["ownMonthly"] = {"status": "withheld"}
    block = import_module("deep.v3_planning").analyze_planning(*pair(a=a))
    assert block["data"]["contributionGapWon"] is None


def test_same_asset_ids_from_two_people_do_not_collide_or_duplicate_housing_cost():
    block = import_module("deep.v3_finances").joint_funding(*pair())
    row = block["data"]["timeline"][-1]
    assert row["requiredHousingWon"] == 10_000_000
    assert row["availableForHousingWon"] == 20_000_000
    assert "asset-1" not in str(block)
    assert "private_input_preview" not in str(block)


def test_unknown_partner_funding_keeps_known_funds_but_flags_partial():
    a = v3_input()
    a["funding"] = {"sourcesStatus": "unknown", "settlementsStatus": "known"}
    block = import_module("deep.v3_finances").joint_funding(*pair(a=a))
    assert block["status"] == "partial"
    assert block["data"]["timeline"][-1]["availableForHousingWon"] == 10_000_000


def test_new_cashflow_does_not_automatically_reduce_variable_spending():
    a, b = v3_input(), v3_input()
    a["variableExpenses"]["food"] = known(500_000)
    b["variableExpenses"]["food"] = known(500_000)
    block = import_module("deep.v3_finances").v3_cashflow(*pair(a=a, b=b))
    assert block["data"]["scenarioMonthlySurplusWon"] == 4_000_000
    assert "0.85" not in str(block)


def test_condition_overrun_uses_explicit_limit_not_value_score():
    a = v3_input()
    a["constraints"] = [{"id": "limit", "kind": "housingCost", "scope": "household", "strength": "required", "amount": known(900_000)}]
    block = import_module("deep.v3_planning").analyze_planning(*pair(a=a))
    conflict = next(item for item in block["data"]["issues"] if item["code"] == "CONDITION_EXCEEDED")
    assert conflict["amountWon"] == 100_000


def test_question_catalog_maps_contributions_and_does_not_need_partner_input():
    questions = import_module("deep.v3_questions").questions_for_input(pair()[0], pair()[2])
    assert {q["id"] for q in questions["planningQuestions"]} >= {"C1", "C2", "C3", "C4", "C5", "C6"}
    assert next(q for q in questions["planningQuestions"] if q["id"] == "C1")["bindings"] == ["contribution.ownMonthly"]
    assert len(questions["valueQuestions"]) == 10
    assert "개인 지출" in str(questions)


def settlement_input():
    data = v3_input()
    data["debts"] = [debt()]
    data["funding"]["sources"][0].update(housingAllocationWon=0, goalAllocationWon=1000000)
    data["funding"]["settlements"] = [{"id": "repay", "debtId": "loan-1", "amount": known(3000000),
                                       "dueOn": "2026-09-15", "parts": [{"sourceId": "asset-1", "amountWon": 3000000}]}]
    return data


def test_partial_settlement_affects_planned_not_current_monthly_payment():
    a = settlement_input()
    a["afterSettlementMonthlyPayments"] = {"loan-1": known(50000)}
    block = import_module("deep.v3_finances").v3_cashflow(*pair(a=a))
    assert block["data"]["currentMonthlySurplusWon"] == 5900000
    assert block["data"]["scenarioMonthlySurplusWon"] == 4950000


def test_unknown_settlement_never_frees_goal_money():
    a = settlement_input()
    a["funding"]["settlements"][0].update(amount={"status": "unknown"}, parts=[])
    plan = v3_plan()
    plan["target"] = {"title": "비상금", "amountWon": 12000000, "targetMonth": "2027-10"}
    aa, bb, pp = pair(a=a, plan=plan)
    module = import_module("deep.v3_finances")
    result = module.v3_goal(aa, bb, pp, module.v3_cashflow(aa, bb, pp))
    assert result["data"]["allocatedWon"] is None


def test_housing_cost_with_missing_deadlines_is_not_zero_requirement():
    plan = v3_plan()
    plan["fundingDeadlines"] = []
    result = import_module("deep.v3_finances").joint_funding(*pair(plan=plan))
    assert result["status"] == "unavailable" and result["data"] is None


def test_unknown_housing_cost_cannot_claim_complete_schedule():
    plan = v3_plan()
    plan["housingPriceWon"] = {"status": "unknown"}
    result = import_module("deep.v3_finances").joint_funding(*pair(plan=plan))
    assert result["status"] != "available"
    assert result["data"]["timeline"][-1]["fundingGapWon"] is None


def test_joint_overflow_is_unavailable_not_unsafe_json_number():
    a, b = v3_input(), v3_input()
    for person in (a, b):
        person["income"]["monthlyNetIncome"] = known(2**53 - 1)
        person["contribution"]["ownMonthly"] = known(2**53 - 1)
    aa, bb, pp = pair(a=a, b=b)
    for block in (import_module("deep.v3_finances").v3_cashflow(aa, bb, pp), import_module("deep.v3_planning").analyze_planning(aa, bb, pp)):
        assert block["status"] == "unavailable" and block["data"] is None


def test_monthly_deficit_precedes_expectation_differences():
    from deep.v3_report import build_v3_report
    from deep.versions import version_fields
    from tests.deep_factory import ready_document

    document = ready_document()
    document.update(version_fields("deep-v3"))
    document["plan"]["data"] = v3_plan()
    for member in document["members"].values():
        member["input"] = v3_input()
        member["input"]["income"]["monthlyNetIncome"] = known(100000)
        member["consent"]["version"] = "deep-sharing-v2"
    report = build_v3_report(document)
    assert report["topics"][0]["code"] == "MONTHLY_DEFICIT"
    assert len(report["issues"]) >= 4


def test_earlier_monthly_deficit_precedes_three_later_housing_gaps():
    from deep.v3_report import build_v3_report
    from deep.versions import version_fields
    from tests.deep_factory import ready_document

    document = ready_document()
    document.update(version_fields("deep-v3"))
    document["plan"]["data"] = v3_plan()
    document["plan"]["data"]["fundingDeadlines"] = [
        {"id": str(index), "dueOn": day, "amount": known(amount)}
        for index, (day, amount) in enumerate([("2026-11-01", 3000000), ("2026-12-01", 3000000), ("2027-01-01", 4000000)])]
    for member in document["members"].values():
        member["input"] = v3_input()
        member["input"]["income"]["monthlyNetIncome"] = known(100000)
        member["input"]["funding"]["sources"][0]["housingAllocationWon"] = 0
        member["consent"]["version"] = "deep-sharing-v2"
    report = build_v3_report(document)
    assert report["topics"][0]["code"] == "MONTHLY_DEFICIT"
    assert len([issue for issue in report["issues"] if issue["code"] == "FUNDING_GAP"]) >= 3


def test_missing_monthly_and_housing_calculation_have_explicit_questions():
    from deep.v3_report import build_v3_report
    from deep.versions import version_fields
    from tests.deep_factory import ready_document

    document = ready_document()
    document.update(version_fields("deep-v3"))
    document["plan"]["data"] = v3_plan()
    document["plan"]["data"]["fundingDeadlines"] = []
    for member in document["members"].values():
        member["input"] = v3_input()
        member["input"]["income"]["monthlyNetIncome"] = {"status": "unknown"}
        member["consent"]["version"] = "deep-sharing-v2"
    report = build_v3_report(document)
    assert {"CASHFLOW_UNCERTAIN", "HOUSING_UNCERTAIN"} <= {item["code"] for item in report["issues"]}
