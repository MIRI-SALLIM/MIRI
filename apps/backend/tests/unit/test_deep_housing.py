import importlib

from tests.deep_factory import asset, debt, known, sample_input
from tests.unit.test_deep_cashflow import pair


def test_initial_funding_is_separate_and_settled_balance_is_subtracted_once():
    a = sample_input()
    a["assets"] = [asset(housingAllocationWon=8000000)]
    a["debts"] = [debt(balance=known(3000000), disposition="settle")]
    housing = importlib.import_module("deep.engine.housing")
    data = housing.calculate_housing(*pair(a=a))["data"]
    assert data["requiredWon"] == 10000000
    assert data["availableWon"] == 5000000
    assert data["fundingGapWon"] == 5000000


def test_late_or_unknown_asset_availability_is_not_counted_as_confirmed_funding():
    housing = importlib.import_module("deep.engine.housing")
    for available in (None, "2026-11-01", "2026-10-31"):
        a = sample_input()
        a["assets"] = [asset(availableOn=available, housingAllocationWon=8000000)]
        block = housing.calculate_housing(*pair(a=a))
        assert block["status"] == "partial"
        assert block["data"]["confirmedAssetFundingWon"] == 0
        assert block["data"]["fundingGapWon"] is None
        assert "a.assets.asset-1.availableOn" in block["missingFields"]


def test_unallocated_assets_are_not_automatically_spent_on_housing():
    housing = importlib.import_module("deep.engine.housing")
    a = sample_input()
    a["assets"] = [asset()]
    data = housing.calculate_housing(*pair(a=a))["data"]
    assert data["confirmedAssetFundingWon"] == 0
    assert data["fundingGapWon"] == 10000000
