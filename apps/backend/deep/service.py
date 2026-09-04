from datetime import datetime, timezone
from typing import Any

from deep.errors import DeepError
from deep.report import build_report
from deep.repository import DeepRepository, member_role
from deep.state import can_publish


class DeepService:
    def __init__(self, repo: DeepRepository) -> None:
        self.repo = repo

    @staticmethod
    def agreement_response(agreement: dict[str, Any], user_id: str) -> dict[str, Any]:
        partner_id = next(user for user in agreement["participants"] if user != user_id)
        return {key: agreement[key] for key in ("id", "version", "round", "text", "reviewOn", "status")} | {
            "myConfirmed": user_id in agreement["confirmations"], "partnerConfirmed": partner_id in agreement["confirmations"],
        } | ({key: agreement[key] for key in ("terms", "planVersion", "sourceReportId")} if "terms" in agreement else {})

    @staticmethod
    def session_response(document: dict[str, Any], user_id: str) -> dict[str, Any]:
        return {"id": document["id"], "round": document["round"], "role": member_role(document, user_id),
                "invitationCode": document["invitationCode"], "questionVersion": document["questionVersion"]}

    @staticmethod
    def own_input(document: dict[str, Any], user_id: str) -> dict[str, Any]:
        member = document["members"][member_role(document, user_id)]
        return {"revision": member["revision"], "input": member["input"]}

    @staticmethod
    def plan_response(document: dict[str, Any], user_id: str) -> dict[str, Any]:
        role = member_role(document, user_id)
        mine = document["members"][role]
        partner = document["members"].get("B" if role == "A" else "A")
        version = document["plan"]["version"]
        return {"version": version, "plan": document["plan"]["data"],
                "myConfirmed": mine["confirmedPlanVersion"] == version,
                "partnerConfirmed": bool(partner and partner["confirmedPlanVersion"] == version),
                "locked": any(member and member["submittedAt"] is not None for member in document["members"].values())}

    @staticmethod
    def status_response(document: dict[str, Any], user_id: str) -> dict[str, Any]:
        role = member_role(document, user_id)
        mine = document["members"][role]
        partner = document["members"].get("B" if role == "A" else "A")
        return {"status": "ready" if document["status"] == "ready" else "waiting",
                "mySubmitted": mine["submittedAt"] is not None,
                "partnerCompleted": bool(partner and partner["submittedAt"] is not None)}

    async def result(self, session_id: str, user_id: str) -> dict[str, Any]:
        for _ in range(5):
            now = datetime.now(timezone.utc)
            document = await self.repo.get_for_member(session_id, user_id, now)
            if not can_publish(document, now):
                return {"status": "waiting", "partnerCompleted": self.status_response(document, user_id)["partnerCompleted"]}
            if document["status"] == "ready" and document.get("reportId"):
                return {"status": "ready", "report": await self.repo.load_report_for_member(session_id, user_id, now)}
            snapshot = await self.repo.claim_publication(session_id, document["version"], now)
            if snapshot is None:
                continue
            report = build_report(snapshot)
            stamp = snapshot["publicationStamp"]
            report_id = await self.repo.store_report(session_id, stamp, report, snapshot["publicationExpiresAt"])
            try:
                if await self.repo.publish_report_pointer(session_id, snapshot["version"], stamp, report_id, datetime.now(timezone.utc)):
                    return {"status": "ready", "report": await self.repo.load_report_for_member(session_id, user_id, datetime.now(timezone.utc))}
            except DeepError:
                await self.repo.cleanup_obsolete_report(session_id, stamp, datetime.now(timezone.utc))
                raise
            await self.repo.cleanup_obsolete_report(session_id, stamp, datetime.now(timezone.utc))
            # A concurrent reader may have published this same immutable report. Never delete it here.
        raise DeepError("PUBLICATION_RETRY_REQUIRED")
