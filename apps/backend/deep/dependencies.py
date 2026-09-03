import os
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
