from importlib import import_module

import pytest
from pydantic import ValidationError

from tests.deep_factory import asset, known, sample_input, sample_plan


def test_v3_input_keeps_unknown_contribution_separate_from_zero():
    models = import_module("deep.v3_models")
    data = models.DeepInputV3.model_validate({**sample_input(), "inputVersion": "deep-input-v3"})
    assert data.contribution.ownMonthly.value is None
    data = models.DeepInputV3.model_validate({**data.model_dump(), "contribution": {"ownMonthly": known(0)}})
    assert data.contribution.ownMonthly.value == 0


@pytest.mark.parametrize("problem", ["legacy_allocation", "missing_asset", "exceeds_asset", "external_alias"])
def test_v3_rejects_duplicate_funding_ledgers(problem):
    models = import_module("deep.v3_models")
    payload = {**sample_input(), "inputVersion": "deep-input-v3"}
    payload["assets"] = [asset()]
    if problem == "legacy_allocation":
        payload["assets"][0]["housingAllocationWon"] = 1
    else:
        source = {"id": "asset-1", "kind": "cashSavings", "grossAmount": known(10_000_000)}
        if problem == "missing_asset":
            source["id"] = "missing"
        elif problem == "exceeds_asset":
            source["grossAmount"] = known(10_000_001)
        else:
            source["kind"] = "support"
        payload["funding"] = {"sourcesStatus": "known", "sources": [source]}
    with pytest.raises(ValidationError):
        models.DeepInputV3.model_validate(payload)


def test_v3_schedule_must_not_omit_known_part_of_housing_cost():
    models = import_module("deep.v3_models")
    with pytest.raises(ValidationError):
        models.SharedPlanV3.model_validate({**sample_plan(), "planSchemaVersion": "deep-plan-v3", "fundingAsOf": "2026-09-03",
                                           "fundingDeadlines": [{"id": "price", "dueOn": "2026-10-01", "amount": known(1)}]})


def test_monthly_decision_requires_both_concrete_contributions():
    models = import_module("deep.v3_models")
    with pytest.raises(ValidationError):
        models.DecisionTerms(topic="monthlyContribution", scope="식비", owner="both", startMonth="2026-10")
