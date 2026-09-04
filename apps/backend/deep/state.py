import hashlib
import json
from datetime import datetime, timezone
from typing import Any


def can_publish(document: dict[str, Any], now: datetime) -> bool:
    expiry = document.get("expiresAt")
    if not isinstance(expiry, datetime):
        return False
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    members = [document.get("members", {}).get(role) for role in ("A", "B")]
    if document.get("status") not in {"waiting", "ready"} or expiry <= now or not all(members):
        return False
    a, b = members
    if not a or not b or a.get("userId") == b.get("userId"):
        return False
    for member in (a, b):
        consent = member.get("consent") or {}
        if (member.get("submittedAt") is None
                or member.get("confirmedPlanVersion") != document["plan"]["version"]
                or consent.get("version") != document["consentVersion"]
                or consent.get("submittedRevision") != member["revision"]
                or consent.get("round") != document["round"]
                or type(consent.get("shareFinance")) is not bool or type(consent.get("shareValues")) is not bool):
            return False
    return True


def publication_stamp(document: dict[str, Any]) -> str:
    payload = {key: document[key] for key in ("id", "round", "questionVersion", "ruleVersion", "copyVersion", "consentVersion")}
    payload["planVersion"] = document["plan"]["version"]
    payload["members"] = {role: {"userId": member["userId"], "revision": member["revision"], "consent": member["consent"]}
                          for role, member in document["members"].items() if member}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
