from collections.abc import Mapping
from dataclasses import dataclass, field

from auth.passwords import valid_password_hash
from auth.security import token_digest


@dataclass(frozen=True)
class ReviewerSettings:
    a_hash: str = field(repr=False)
    b_hash: str = field(repr=False)
    version: str = field(repr=False)


def load_reviewer_settings(environ: Mapping[str, str]) -> ReviewerSettings:
    a, b = environ.get("REVIEWER_A_PASSWORD_HASH", ""), environ.get("REVIEWER_B_PASSWORD_HASH", "")
    for name, value in (("REVIEWER_A_PASSWORD_HASH", a), ("REVIEWER_B_PASSWORD_HASH", b)):
        if not valid_password_hash(value):
            raise RuntimeError(f"Invalid {name}")
    if a == b:
        raise RuntimeError("Reviewer credentials must be distinct")
    version = token_digest("reviewer-version:" + a + ":" + b, environ.get("AUTH_SESSION_PEPPER", ""))
    return ReviewerSettings(a, b, version)
