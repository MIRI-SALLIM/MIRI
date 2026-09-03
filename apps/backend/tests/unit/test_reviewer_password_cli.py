import os
import subprocess
import sys

from auth.passwords import verify_password


def test_password_cli_prints_only_hash_and_rejects_short_password():
    env = {**os.environ, "MONGODB_URI": "", "DEEP_MODE_ENABLED": "false"}
    password = "cli-synthetic-password-only"
    command = [sys.executable, "scripts/reviewer_password.py", "a", "--stdin"]
    result = subprocess.run(command, input=password + "\n", text=True, capture_output=True, env=env, check=False)
    assert result.returncode == 0, result.stderr
    assert password not in result.stdout + result.stderr
    assert result.stdout.startswith("REVIEWER_A_PASSWORD_HASH=")
    assert verify_password(password, result.stdout.strip().split("=", 1)[1])
    failed = subprocess.run(command, input="short\n", text=True, capture_output=True, env=env, check=False)
    assert failed.returncode != 0 and "HASH=" not in failed.stdout
