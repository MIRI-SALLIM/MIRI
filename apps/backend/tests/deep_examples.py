"""Synthetic frontend contract examples; no application credentials or database."""

from deep.report import build_report
from deep.schemas import DeepInput, ReadyDeepResult, SharedPlan
from tests.deep_factory import ready_document, sample_input, sample_plan


def build_examples():
    document = ready_document()
    document["plan"]["version"] = 2
    for member in document["members"].values():
        member["confirmedPlanVersion"] = 2
    document["members"]["B"]["input"]["values"]["D1"] = 5
    shared = ReadyDeepResult(status="ready", report=build_report(document)).model_dump(mode="json")
    document["members"]["B"]["consent"]["shareFinance"] = False
    opt_out = ReadyDeepResult(status="ready", report=build_report(document)).model_dump(mode="json")
    payload = DeepInput.model_validate(sample_input()).model_dump(mode="json")
    plan = SharedPlan.model_validate(sample_plan()).model_dump(mode="json")
    return {
        "note": "합성 시험 데이터입니다. 실제 계정·자격증명·운영 데이터가 아닙니다.",
        "createRequest": {},
        "session": {"id": "example-session", "round": 1, "role": "A", "invitationCode": "INV-example-not-live", "questionVersion": "deep-v2"},
        "saveRequest": {"expectedRevision": 0, "input": payload},
        "ownInput": {"revision": 1, "input": payload},
        "planUpdateRequest": {"expectedVersion": 1, "plan": plan},
        "plan": {"version": 2, "plan": plan, "myConfirmed": False, "partnerConfirmed": False, "locked": False},
        "planConfirmRequest": {"planVersion": 2},
        "submitRequest": {"expectedRevision": 1, "planVersion": 2, "consentVersion": "deep-sharing-v1", "shareFinance": True, "shareValues": True},
        "waiting": {"status": "waiting", "partnerCompleted": False},
        "ready": shared,
        "financeOptOut": opt_out,
        "agreementCreateRequest": {"expectedRound": 1, "text": "월 공동비 기준을 다음 달 다시 이야기한다", "reviewOn": "2026-10-01"},
        "agreement": {"id": "example-agreement", "version": 1, "round": 1, "text": "월 공동비 기준을 다음 달 다시 이야기한다",
                      "reviewOn": "2026-10-01", "status": "proposed", "myConfirmed": False, "partnerConfirmed": False},
        "agreementConfirmRequest": {"expectedVersion": 1},
        "agreementEditRequest": {"expectedVersion": 1, "text": "월 공동비와 예외 지출을 함께 정한다", "reviewOn": None},
        "roundRequest": {"expectedRound": 1},
        "roundState": {"round": 1, "myRequested": False, "partnerRequested": True},
        "roundResponse": {"round": 1, "pending": True},
        "withdrawRequest": {}, "closed": {"status": "closed"},
        "revisionConflict": {"error": {"code": "REVISION_CONFLICT", "message": "상태가 변경되었습니다. 본인의 최신 입력을 다시 확인해 주세요.", "fieldErrors": {}}},
    }
