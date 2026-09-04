"""Loopback-only browser check: real auth/Deep services, disposable in-memory DB.

Run from apps/backend: .venv/Scripts/python -m tests.manual_server
Never deploy this module. The two published passwords are synthetic test fixtures.
"""
import os
import secrets


def create_app():
    if os.environ.get("ENVIRONMENT", "").lower() in {"production", "prod"} or os.environ.get("RAILWAY_PROJECT_ID"):
        raise RuntimeError("This server is local-only; production is forbidden")

    from auth.passwords import hash_password

    os.environ.update({
        "ENVIRONMENT": "development", "DEEP_MODE_ENABLED": "true",
        "KAKAO_LOGIN_ENABLED": "false", "REVIEWER_LOGIN_ENABLED": "true",
        "DEEP_MEETING_AI_ENABLED": "false", "OPENAI_API_KEY": "",
        "KAKAO_REST_API_KEY": "", "KAKAO_CLIENT_SECRET": "",
        "MONGODB_URI": "", "DEEP_TEST_MONGODB_URI": "",
        "PUBLIC_APP_ORIGIN": "http://127.0.0.1:5173",
        "AUTH_SESSION_PEPPER": secrets.token_hex(32),
        "REVIEWER_A_PASSWORD_HASH": hash_password("synthetic-password-a"),
        "REVIEWER_B_PASSWORD_HASH": hash_password("synthetic-password-b"),
    })
    from auth.dependencies import get_auth_repository
    from auth.repository import AuthRepository
    from main import app
    from tests.mongo_fakes import MemoryDatabase

    repository = AuthRepository(MemoryDatabase())

    async def memory_repository():
        await repository.ensure_indexes()
        return repository

    app.dependency_overrides[get_auth_repository] = memory_repository
    return app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(create_app(), host="127.0.0.1", port=8000, access_log=False)
