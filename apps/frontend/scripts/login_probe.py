"""Local reviewer auth only. No Atlas, .env loading, Kakao, or production server."""
import argparse
import json
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
ORIGIN = "http://127.0.0.1:5173"
sys.path.insert(0, str(BACKEND))


def create_app(env_file: Path):
    allowed = {"REVIEWER_A_PASSWORD_HASH", "REVIEWER_B_PASSWORD_HASH", "AUTH_SESSION_PEPPER"}
    values = {}
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        key, separator, value = line.partition("=")
        if separator and key in allowed:
            if key in values:
                raise ValueError("Duplicate credential setting")
            values[key] = value
    if values.keys() != allowed:
        raise ValueError("Missing local credential settings")
    inherited = {key: value for key, value in os.environ.items()
                 if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "LANG"}}
    os.environ.clear()
    os.environ.update(inherited)
    os.environ.update(values, ENVIRONMENT="test", PYTHON_DOTENV_DISABLED="1",
                      DEEP_MODE_ENABLED="true", REVIEWER_LOGIN_ENABLED="true", KAKAO_LOGIN_ENABLED="false",
                      PUBLIC_APP_ORIGIN=ORIGIN)
    from auth.dependencies import get_auth_repository
    from auth.errors import AuthError
    from auth.repository import AuthRepository
    from auth.reviewer_router import router as reviewer_router
    from auth.router import error_response, router
    from auth.settings import load_auth_settings
    from fastapi import FastAPI
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse
    from tests.mongo_fakes import MemoryDatabase

    load_auth_settings(os.environ)
    repo = AuthRepository(MemoryDatabase())

    @asynccontextmanager
    async def lifespan(app):
        await repo.ensure_indexes()
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.include_router(router)
    app.include_router(reviewer_router)
    app.dependency_overrides[get_auth_repository] = lambda: repo

    @app.exception_handler(AuthError)
    async def safe_auth_error(request, exc):
        return error_response(exc)

    @app.exception_handler(RequestValidationError)
    async def safe_validation_error(request, exc):
        return JSONResponse({"error": {"code": "VALIDATION_ERROR", "message": "입력 형식을 확인하세요."}}, status_code=422)

    return app


def check_accounts(app, passwords):
    from fastapi.testclient import TestClient
    origin = {"Origin": ORIGIN}
    with TestClient(app) as a, TestClient(app) as b:
        response = a.post("/api/v1/auth/reviewer/login", json={"username": "judge-a", "password": passwords[0]}, headers=origin)
        assert response.status_code == 200
        assert "httponly" in response.headers["set-cookie"].lower()
        first = response.json()
        response = b.post("/api/v1/auth/reviewer/login", json={"username": "judge-b", "password": passwords[1], "roomCode": first["roomCode"]}, headers=origin)
        assert response.status_code == 200
        second = response.json()
        assert first["role"] == "A" and second["role"] == "B"
        assert first["userId"] != second["userId"] and first["roomCode"] == second["roomCode"]
        assert a.get("/api/v1/auth/reviewer/context").json()["userId"] == first["userId"]
        assert a.post("/api/v1/auth/logout", json={}, headers={"Origin": "https://untrusted.invalid"}).status_code == 403
        assert a.post("/api/v1/auth/logout", json={}, headers=origin).status_code == 204
        assert a.get("/api/v1/auth/me").status_code == 401
        assert b.get("/api/v1/auth/me").status_code == 200
        assert a.get("/api/v1/auth/kakao/start").status_code == 404


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the local accounts without printing credentials")
    args = parser.parse_args()
    bundle = BACKEND / ".reviewer-credentials.local"
    app = create_app(bundle / "railway.env")
    if args.check:
        records = json.loads((bundle / "accounts.json").read_text(encoding="utf-8-sig"))
        passwords = {record["username"]: record["password"] for record in records}
        check_accounts(app, (passwords["judge-a"], passwords["judge-b"]))
        print("PASS: A/B login, separate identities, shared room, restore, logout and Origin rejection. Local memory only.")
        return
    import uvicorn
    print("LOCAL MEMORY AUTH ONLY: http://127.0.0.1:8011; no Atlas or Kakao. Stop to discard test data.")
    uvicorn.run(app, host="127.0.0.1", port=8011, access_log=False, proxy_headers=False, log_level="warning")


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 - never expose credential-related values in a CLI traceback
        print("Local login probe failed; no credentials displayed. Check files, settings and port availability.", file=sys.stderr)
        sys.exit(1)
