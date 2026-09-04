from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from auth.models import Principal
from deep.errors import DeepError

if TYPE_CHECKING:
    from auth.repository import AuthRepository
    from deep.repository import DeepRepository


def require_recent_login(principal: Principal, now: datetime) -> None:
    authenticated = principal.authenticated_at
    if authenticated is None:
        raise DeepError("RECENT_LOGIN_REQUIRED", 401)
    if authenticated.tzinfo is None:
        authenticated = authenticated.replace(tzinfo=timezone.utc)
    if not timedelta(0) <= now - authenticated <= timedelta(minutes=10):
        raise DeepError("RECENT_LOGIN_REQUIRED", 401)


async def delete_account(principal: Principal, deep_repo: "DeepRepository", auth_repo: "AuthRepository", now: datetime) -> None:
    require_recent_login(principal, now)
    # A durable tombstone denies partner reads before potentially fallible cleanup.
    # Keep login available for retry until personal/shared data cleanup has succeeded.
    await deep_repo.delete_account_data(principal.user_id, now)
    await auth_repo.delete_user(principal.user_id)
    await deep_repo.complete_account_deletion(principal.user_id, now)
