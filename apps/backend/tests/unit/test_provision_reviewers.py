import json
import subprocess
import sys

from auth.passwords import verify_password


def test_provision_creates_private_bundle_without_echo_or_overwrite(tmp_path):
    destination = tmp_path / "reviewers.local"
    command = [sys.executable, "scripts/provision_reviewers.py", str(destination)]
    result = subprocess.run(command, text=True, capture_output=True, check=False)
    assert result.returncode == 0, result.stderr
    accounts = json.loads((destination / "accounts.json").read_text(encoding="utf-8"))
    env_text = (destination / "railway.env").read_text(encoding="utf-8")
    values = dict(line.split("=", 1) for line in env_text.splitlines() if line)
    assert {a["username"] for a in accounts} == {"judge-a", "judge-b"}
    assert accounts[0]["password"] != accounts[1]["password"]
    for account in accounts:
        password = account["password"]
        role = account["username"][-1].upper()
        assert len(password) >= 24
        assert password not in result.stdout + result.stderr + env_text
        assert verify_password(password, values[f"REVIEWER_{role}_PASSWORD_HASH"])
    assert len(values["AUTH_SESSION_PEPPER"]) >= 32
    repeated = subprocess.run(command, text=True, capture_output=True, check=False)
    assert repeated.returncode != 0
    assert (destination / "railway.env").read_text(encoding="utf-8") == env_text


def test_provision_refuses_non_local_destination(tmp_path):
    destination = tmp_path / "public-folder"
    result = subprocess.run([sys.executable, "scripts/provision_reviewers.py", str(destination)],
                            text=True, capture_output=True, check=False)
    assert result.returncode != 0
    assert not destination.exists()
