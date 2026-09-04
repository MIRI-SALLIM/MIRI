import importlib

import pytest


def item():
    return {"version": 1, "text": "공동비를 함께 정한다", "participants": ["user-a", "user-b"],
            "confirmations": [], "status": "proposed"}


def test_agreement_requires_both_and_edit_resets_confirmation():
    module = importlib.import_module("deep.agreements")
    original = item()
    first = module.confirm_agreement(original, "user-a", 1)
    assert first["status"] == "proposed"
    agreed = module.confirm_agreement(first, "user-b", 1)
    assert agreed["status"] == "agreed"
    changed = module.edit_agreement(agreed, 1, "다음 달 다시 정한다")
    assert changed["version"] == 2 and changed["confirmations"] == [] and changed["status"] == "proposed"
    assert original == item()


def test_defer_increments_version_so_old_confirmation_cannot_overwrite_it():
    module = importlib.import_module("deep.agreements")
    first = module.confirm_agreement(item(), "user-a", 1)
    deferred = module.defer_agreement(first, 1)
    assert deferred["version"] == 2 and deferred["confirmations"] == [] and deferred["status"] == "deferred"
    with pytest.raises(ValueError, match="VERSION_CONFLICT"):
        module.confirm_agreement(deferred, "user-b", 1)


def test_third_party_and_stale_version_are_rejected():
    module = importlib.import_module("deep.agreements")
    with pytest.raises(PermissionError):
        module.confirm_agreement(item(), "user-c", 1)
    with pytest.raises(ValueError, match="VERSION_CONFLICT"):
        module.edit_agreement(item(), 0, "새 기준")
