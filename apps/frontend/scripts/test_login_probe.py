"""Only the local probe's isolation boundary; auth rules already have backend tests."""
import importlib.util
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))
from auth.passwords import hash_password


def test_local_probe_verifies_both_accounts_without_loading_production_settings(tmp_path, monkeypatch):
    script = Path(__file__).with_name("login_probe.py")
    assert script.is_file(), "Local-only login probe is not implemented"
    spec = importlib.util.spec_from_file_location("login_probe", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setenv("MONGODB_URI", "mongodb+srv://must-never-connect.invalid/db")
    monkeypatch.setenv("KAKAO_REST_API_KEY", "must-not-inherit")
    # Restore the environment after the probe's child-process-style initialization.
    with monkeypatch.context() as isolated:
        for key, value in dict(os.environ).items():
            isolated.setenv(key, value)
        env_file = tmp_path / "railway.env"
        passwords = ("synthetic-password-a", "synthetic-password-b")
        env_file.write_text("\n".join([
            "REVIEWER_A_PASSWORD_HASH=" + hash_password(passwords[0]),
            "REVIEWER_B_PASSWORD_HASH=" + hash_password(passwords[1]),
            "AUTH_SESSION_PEPPER=" + "p" * 32,
        ]), encoding="utf-8")
        app = module.create_app(env_file)
        assert os.environ.get("MONGODB_URI") is None
        assert os.environ.get("KAKAO_REST_API_KEY") is None
        module.check_accounts(app, passwords)
        from fastapi.testclient import TestClient
        with TestClient(app) as client:
            bad = client.post("/api/v1/auth/reviewer/login", json={"username": "judge-a", "password": "SECRET" * 100}, headers={"Origin": module.ORIGIN})
            assert bad.status_code == 422 and "SECRET" not in bad.text
