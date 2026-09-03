import os
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, Request
from pymongo.errors import PyMongoError

from auth.dependencies import RepositoryDependency, require_account
from auth.models import Principal
from deep.errors import DeepError
from deep.repository import DeepRepository
from deep.service import DeepService

PrincipalDependency = Annotated[Principal, Depends(require_account)]


async def get_deep_service(
    request: Request, principal: PrincipalDependency, auth_repo: RepositoryDependency,
) -> DeepService:
    try:
        draft_days = int(os.environ.get("DEEP_DRAFT_TTL_DAYS", "30"))
        report_days = int(os.environ.get("DEEP_REPORT_TTL_DAYS", "90"))
        if not 1 <= draft_days <= 365 or not 1 <= report_days <= 365:
            raise ValueError
        cached = getattr(request.app.state, "deep_service", None)
        if cached and cached[0] is auth_repo and cached[1:3] == (draft_days, report_days):
            service: DeepService = cached[3]
            return service
        repo = DeepRepository(auth_repo.database, draft_days, report_days)
        await repo.ensure_indexes()
        service = DeepService(repo)
        request.app.state.deep_service = (auth_repo, draft_days, report_days, service)
        return service
    except (ValueError, PyMongoError):
        raise DeepError("DEEP_UNAVAILABLE", 503) from None


ServiceDependency = Annotated[DeepService, Depends(get_deep_service)]


async def require_session_version(request: Request, principal: PrincipalDependency, service: ServiceDependency) -> None:
    session_id = request.path_params.get("session_id")
    if session_id is None:
        return
    if request.method == "POST" and request.url.path.endswith("/withdraw"):
        actual = await service.repo.version_for_cleanup(session_id, principal.user_id)
    else:
        document = await service.repo.get_for_member(session_id, principal.user_id, datetime.now(timezone.utc))
        actual = document["questionVersion"]
    expected = "deep-v3" if request.url.path.startswith("/api/v1/deep/v3/") else "deep-v2"
    if actual != expected:
        raise DeepError("NOT_FOUND", 404)
