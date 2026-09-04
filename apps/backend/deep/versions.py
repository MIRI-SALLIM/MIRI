from datetime import datetime
from typing import Any

from pydantic import ValidationError

from deep.errors import DeepError
from deep.schemas import DeepInput, SharedPlan
from deep.v3_models import DeepInputV3, SharedPlanV3


def version_fields(version: str) -> dict[str, str]:
    if version == "deep-v2":
        return {"questionVersion": version, "ruleVersion": "deep-rules-v1", "copyVersion": "deep-copy-ko-v1", "consentVersion": "deep-sharing-v1"}
    if version == "deep-v3":
        return {"questionVersion": version, "ruleVersion": "deep-rules-v2", "copyVersion": "deep-copy-ko-v2", "consentVersion": "deep-sharing-v2"}
    raise DeepError("VERSION_UNSUPPORTED", 422)


def input_for_version(version: str, data: dict[str, Any] | None = None) -> DeepInput:
    version_fields(version)
    try:
        if version == "deep-v3":
            return DeepInputV3(inputVersion="deep-input-v3") if data is None else DeepInputV3.model_validate(data)
        return DeepInput() if data is None else DeepInput.model_validate(data)
    except ValidationError:
        raise DeepError("INPUT_VERSION_OR_DATA_INVALID", 422) from None


def plan_for_version(version: str, data: dict[str, Any] | None = None, now: datetime | None = None) -> SharedPlan:
    version_fields(version)
    try:
        if data is not None:
            return SharedPlanV3.model_validate(data) if version == "deep-v3" else SharedPlan.model_validate(data)
        if now is None:
            raise DeepError("PLAN_DATE_REQUIRED", 422)
        if version == "deep-v3":
            return SharedPlanV3(planSchemaVersion="deep-plan-v3", startMonth=now.strftime("%Y-%m"), fundingAsOf=now.date())
        return SharedPlan(startMonth=now.strftime("%Y-%m"))
    except ValidationError:
        raise DeepError("PLAN_VERSION_OR_DATA_INVALID", 422) from None
