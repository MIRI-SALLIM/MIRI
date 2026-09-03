from copy import deepcopy
from typing import Any


def confirm_agreement(agreement: dict[str, Any], user_id: str, version: int) -> dict[str, Any]:
    if user_id not in agreement["participants"]:
        raise PermissionError("NOT_FOUND")
    if agreement["version"] != version:
        raise ValueError("VERSION_CONFLICT")
    result = deepcopy(agreement)
    result["confirmations"] = sorted(set(result["confirmations"]) | {user_id})
    result["status"] = "agreed" if set(result["confirmations"]) == set(result["participants"]) else "proposed"
    return result


def edit_agreement(agreement: dict[str, Any], expected_version: int, text: str) -> dict[str, Any]:
    if agreement["version"] != expected_version:
        raise ValueError("VERSION_CONFLICT")
    result = deepcopy(agreement)
    result.update(version=expected_version + 1, text=text, confirmations=[], status="proposed")
    return result


def defer_agreement(agreement: dict[str, Any], expected_version: int) -> dict[str, Any]:
    result = edit_agreement(agreement, expected_version, agreement["text"])
    result["status"] = "deferred"
    return result
