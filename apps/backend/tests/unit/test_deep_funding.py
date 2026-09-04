from copy import deepcopy
from importlib import import_module

import pytest
from pydantic import ValidationError

from tests.deep_factory import known


def funding_input():
    return {
        "asOf": "2026-09-03", "sourcesStatus": "known", "debtsStatus": "known", "settlementsStatus": "known",
        "sources": [{"id": "deposit", "kind": "rentalDeposit", "grossAmount": known(100_000_000),
                     "availableOn": "2026-10-01", "certainty": "confirmed", "housingAllocationWon": 20_000_000}],
        "debts": [{"id": "loan", "balance": known(80_000_000)}],
        "settlements": [{"id": "payoff", "debtId": "loan", "amount": known(80_000_000),
                         "dueOn": "2026-10-01", "parts": [{"sourceId": "deposit", "amountWon": 80_000_000}]}],
        "deadlines": [{"id": "housing", "dueOn": "2026-10-01", "amount": known(30_000_000)}],
    }


def calculate(payload):
    models = import_module("deep.funding_models")
    engine = import_module("deep.engine.funding")
    return engine.calculate_funding(models.FundingPreviewRequest.model_validate(payload))


def test_deposit_settlement_is_counted_once():
    report = calculate(funding_input())
    assert report.status == "available"
    assert report.sources[0].netAfterSettlementWon == 20_000_000
    assert report.timeline[0].availableForHousingWon == 20_000_000
    assert report.timeline[0].fundingGapWon == 10_000_000
    assert report.audience == "private_input_preview"
    assert any(issue.code == "FUNDING_GAP" and issue.amountWon == 10_000_000 for issue in report.issues)


def test_late_return_keeps_earlier_contract_gap_visible():
    payload = funding_input()
    payload["deadlines"] = [
        {"id": "contract", "dueOn": "2026-09-20", "amount": known(5_000_000)},
        {"id": "balance", "dueOn": "2026-10-01", "amount": known(15_000_000)},
    ]
    report = calculate(payload)
    assert [row.fundingGapWon for row in report.timeline] == [5_000_000, 0]
    assert any(issue.code == "FUNDING_GAP" for issue in report.issues)


def test_settlement_before_source_arrives_requires_bridge_funding():
    payload = funding_input()
    payload["settlements"][0]["dueOn"] = "2026-09-20"
    report = calculate(payload)
    assert report.timeline[0].availableForHousingWon == -80_000_000
    assert report.timeline[0].fundingGapWon == 80_000_000
    assert report.timeline[-1].fundingGapWon == 10_000_000


def test_underwater_deposit_does_not_erase_extra_payoff_need():
    payload = funding_input()
    payload["sources"][0].update(grossAmount=known(70_000_000), housingAllocationWon=0)
    report = calculate(payload)
    assert report.sources[0].netAfterSettlementWon == -10_000_000
    assert report.timeline[0].availableForHousingWon == -10_000_000
    assert report.timeline[0].fundingGapWon == 40_000_000


def test_unallocated_assets_are_not_spent_automatically():
    payload = funding_input()
    payload["sources"][0]["housingAllocationWon"] = 0
    assert calculate(payload).timeline[0].fundingGapWon == 30_000_000


def test_future_repayment_earmark_is_not_temporarily_available_for_housing():
    payload = funding_input()
    payload["settlements"][0]["dueOn"] = "2026-11-01"
    report = calculate(payload)
    assert [row.availableForHousingWon for row in report.timeline] == [20_000_000, 20_000_000]
    assert [row.fundingGapWon for row in report.timeline] == [10_000_000, 10_000_000]


def test_source_arriving_after_last_deadline_has_its_own_timeline_row():
    payload = funding_input()
    payload["sources"][0]["availableOn"] = "2026-11-01"
    report = calculate(payload)
    assert [row.date.isoformat() for row in report.timeline] == ["2026-10-01", "2026-11-01"]
    assert [row.fundingGapWon for row in report.timeline] == [110_000_000, 10_000_000]


@pytest.mark.parametrize("status", ["unknown", "withheld"])
def test_unknown_repayments_do_not_publish_source_gross_as_net(status):
    payload = funding_input()
    payload.update(settlementsStatus=status, settlements=[])
    report = calculate(payload)
    assert report.sources[0].netAfterSettlementWon is None
    assert all(row.availableForHousingWon is None for row in report.timeline)


def test_expected_source_is_only_in_explicit_scenario():
    payload = funding_input()
    payload["sources"][0]["certainty"] = "expected"
    report = calculate(payload)
    assert report.timeline[0].fundingGapWon == 110_000_000
    assert report.timeline[0].includingExpectedGapWon == 10_000_000
    assert any(issue.code == "EXPECTED_SOURCE" for issue in report.issues)


def test_past_unreceived_confirmation_is_not_available_cash():
    payload = funding_input()
    payload["sources"][0]["availableOn"] = "2026-09-01"
    report = calculate(payload)
    assert report.timeline[0].fundingGapWon == 110_000_000
    assert any(issue.code == "OVERDUE_SOURCE" for issue in report.issues)


@pytest.mark.parametrize("missing", ["source_date", "source_amount", "source_status"])
def test_uncertain_source_is_excluded_without_being_called_zero_assets(missing):
    payload = funding_input()
    source = payload["sources"][0]
    if missing == "source_date":
        source["availableOn"] = None
    elif missing == "source_amount":
        source["grossAmount"] = {"status": "unknown"}
    else:
        source["certainty"] = "unknown"
    report = calculate(payload)
    assert report.status == "partial"
    assert report.missingFields
    assert report.timeline[0].fundingGapWon == 110_000_000
    assert report.fundingBasis == "self_reported_confirmed_sources"


@pytest.mark.parametrize("field", ["amount", "dueOn"])
def test_unknown_required_obligation_prevents_exact_gap(field):
    payload = funding_input()
    payload["settlements"][0][field] = {"status": "unknown"} if field == "amount" else None
    if field == "amount":
        payload["settlements"][0]["parts"] = []
    report = calculate(payload)
    assert report.status == "partial"
    assert all(row.fundingGapWon is None for row in report.timeline)


def test_unknown_housing_amount_prevents_exact_gap():
    payload = funding_input()
    payload["deadlines"][0]["amount"] = {"status": "unknown"}
    assert calculate(payload).timeline[0].fundingGapWon is None


def test_unknown_future_payment_does_not_hide_known_earlier_gap():
    payload = funding_input()
    payload["deadlines"][0]["dueOn"] = "2026-09-20"
    payload["settlements"][0].update(amount={"status": "unknown"}, dueOn="2026-12-01", parts=[])
    report = calculate(payload)
    assert report.timeline[0].fundingGapWon == 30_000_000
    assert report.timeline[-1].fundingGapWon is None


def test_unknown_collection_is_not_complete_zero_and_empty_schedule_is_unavailable():
    report = calculate({"asOf": "2026-09-03"})
    assert report.status == "unavailable"
    assert report.timeline == []
    assert report.missingFields


def test_split_repayment_is_deducted_once_from_two_sources():
    payload = funding_input()
    payload["sources"][0].update(grossAmount=known(60_000_000), housingAllocationWon=10_000_000)
    payload["sources"].append({"id": "cash", "kind": "cashSavings", "grossAmount": known(40_000_000),
                               "availableOn": "2026-09-01", "certainty": "available", "housingAllocationWon": 10_000_000})
    payload["settlements"][0]["parts"] = [{"sourceId": "deposit", "amountWon": 50_000_000},
                                          {"sourceId": "cash", "amountWon": 30_000_000}]
    assert calculate(payload).timeline[0].availableForHousingWon == 20_000_000


@pytest.mark.parametrize("mutation", [
    "duplicate_source", "duplicate_settlement", "unknown_source", "unknown_debt", "duplicate_part",
    "split_mismatch", "overallocate", "pay_more_than_debt", "future_available", "unsafe_total", "unknown_collection_with_items",
])
def test_invalid_funding_links_and_double_counting_are_rejected(mutation):
    payload = funding_input()
    if mutation == "duplicate_source":
        payload["sources"].append(deepcopy(payload["sources"][0]))
    elif mutation == "duplicate_settlement":
        payload["settlements"].append(deepcopy(payload["settlements"][0]))
    elif mutation == "unknown_source":
        payload["settlements"][0]["parts"][0]["sourceId"] = "missing"
    elif mutation == "unknown_debt":
        payload["settlements"][0]["debtId"] = "missing"
    elif mutation == "duplicate_part":
        payload["settlements"][0]["parts"] *= 2
    elif mutation == "split_mismatch":
        payload["settlements"][0]["parts"][0]["amountWon"] = 1
    elif mutation == "overallocate":
        payload["sources"][0]["goalAllocationWon"] = 1
    elif mutation == "pay_more_than_debt":
        payload["debts"][0]["balance"] = known(79_999_999)
    elif mutation == "future_available":
        payload["sources"][0]["certainty"] = "available"
    elif mutation == "unsafe_total":
        payload["deadlines"][0]["amount"] = known(2**53 - 1)
    else:
        payload["sourcesStatus"] = "unknown"
    with pytest.raises(ValidationError):
        calculate(payload)


def test_multiple_partial_settlements_cannot_exceed_debt_balance():
    payload = funding_input()
    payload["settlements"].append({"id": "second", "debtId": "loan", "amount": known(1),
                                   "dueOn": "2026-11-01", "parts": []})
    with pytest.raises(ValidationError):
        calculate(payload)


def test_calculation_does_not_mutate_payload_and_is_deterministic():
    payload = funding_input()
    before = deepcopy(payload)
    assert calculate(payload) == calculate(payload)
    assert payload == before
