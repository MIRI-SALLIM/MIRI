import importlib

import pytest
from pydantic import ValidationError

from tests.deep_factory import asset, debt, known, sample_input, sample_plan


def schemas():
    return importlib.import_module("deep.schemas")


def test_zero_unknown_and_withheld_are_distinct_and_default_draft_does_not_assume_zero():
    module = schemas()
    assert module.Amount(**known(0)).value == 0
    for status in ("unknown", "withheld"):
        assert module.Amount(value=None, status=status, precision="exact").value is None
        with pytest.raises(ValidationError):
            module.Amount(value=0, status=status, precision="exact")
    draft = module.DeepInput()
    assert draft.income.monthlyNetIncome.value is None
    assert draft.debtsStatus == draft.assetsStatus == "unknown"
    assert draft.livingTogether is None
    assert draft.values == {}


@pytest.mark.parametrize("value", [True, False, -1, 1.2, "1000", None])
def test_known_amount_requires_nonnegative_integer_not_coerced_value(value):
    with pytest.raises(ValidationError):
        schemas().Amount(**known(value))


@pytest.mark.parametrize("question,value", [("D11", 3), ("D1", 0), ("D1", 6), ("D1", True)])
def test_values_require_known_question_and_one_to_five_or_null(question, value):
    data = sample_input()
    data["values"][question] = value
    with pytest.raises(ValidationError):
        schemas().DeepInput.model_validate(data)


@pytest.mark.parametrize("key", ["guesses", "partnerPredictions", "source"])
def test_untrusted_extra_fields_rejected(key):
    with pytest.raises(ValidationError):
        schemas().DeepInput.model_validate({**sample_input(), key: {}})


@pytest.mark.parametrize("problem", ["debt-duplicate", "asset-duplicate", "too-many-debts", "category",
                                     "importance", "note", "rate-nan", "rate-infinite", "zero-months",
                                     "huge-months", "month", "allocation", "unknown-allocation",
                                     "debt-status", "asset-status", "skipped-with-answer"])
def test_inconsistent_or_unbounded_input_is_rejected(problem):
    data = sample_input()
    if problem == "debt-duplicate":
        data["debts"] = [debt(), debt()]
    elif problem == "asset-duplicate":
        data["assets"] = [asset(), asset()]
    elif problem == "too-many-debts":
        data["debts"] = [debt(id=f"loan-{i}") for i in range(31)]
    elif problem == "category":
        data["fixedExpenses"]["debtPayment"] = known(100000)
    elif problem == "importance":
        data["importantAreas"] = ["savings", "savings"]
    elif problem == "note":
        data["contextNotes"] = {"D1": "x" * 301}
    elif problem in ("rate-nan", "rate-infinite"):
        data["debts"] = [debt(annualRate="NaN" if problem == "rate-nan" else "Infinity")]
    elif problem in ("zero-months", "huge-months"):
        data["debts"] = [debt(remainingMonths=0 if problem == "zero-months" else 100000000)]
    elif problem == "month":
        data["income"]["referenceMonth"] = "2026-13"
    elif problem == "allocation":
        data["assets"] = [asset(housingAllocationWon=6000000, goalAllocationWon=5000000)]
    elif problem == "unknown-allocation":
        data["assets"] = [asset(balance={"status": "unknown", "value": None, "precision": "estimate"},
                                housingAllocationWon=1)]
    elif problem == "debt-status":
        data.update(debts=[debt()], debtsStatus="withheld")
    elif problem == "asset-status":
        data.update(assets=[asset()], assetsStatus="unknown")
    else:
        data["skippedQuestionIds"] = ["D1"]
    with pytest.raises(ValidationError):
        schemas().DeepInput.model_validate(data)


def test_partial_categories_are_initialized_to_unknown_not_zero():
    data = schemas().DeepInput(fixedExpenses={"communication": known(0)})
    assert data.fixedExpenses["communication"].value == 0
    assert data.fixedExpenses["insurance"].value is None


def test_submit_accepts_skipped_and_unknown_finances_but_requires_every_question_decision():
    validate = importlib.import_module("deep.validation").validate_submission
    data = sample_input()
    data["values"]["D1"] = None
    model = schemas().DeepInput.model_validate(data)
    assert any(item["field"] == "values.D1" for item in validate(model))
    data["skippedQuestionIds"] = ["D1"]
    data["income"]["monthlyNetIncome"] = {"status": "unknown", "value": None, "precision": "exact"}
    assert validate(schemas().DeepInput.model_validate(data)) == []


def test_shared_plan_does_not_allow_a_settled_new_loan_or_loan_with_keep_housing():
    for overrides in ({"newHousingLoan": debt(disposition="settle")},
                      {"housingType": "keep", "newHousingLoan": debt()}):
        with pytest.raises(ValidationError):
            schemas().SharedPlan.model_validate({**sample_plan(), **overrides})
