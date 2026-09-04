from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Principal:
    user_id: str
    authenticated_at: datetime | None = None
    provider: str = "kakao"
    reviewer_run_id: str | None = None
    reviewer_role: str | None = None
    reviewer_version: str | None = None
