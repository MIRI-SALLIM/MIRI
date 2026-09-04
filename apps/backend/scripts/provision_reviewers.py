"""One-time local credential bundle. No database/network and no secret stdout."""
import argparse
import csv
import json
import os
import secrets
import subprocess
import sys
from pathlib import Path


def private_directory(destination: Path) -> None:
    if not destination.name.endswith(".local"):
        raise ValueError("Destination must end with .local so the repository ignores it")
    destination.mkdir(mode=0o700)  # Exclusive: never overwrite a previous bundle.
    if os.name == "nt":
        identity = subprocess.run(["whoami", "/user", "/fo", "csv", "/nh"],
                                  capture_output=True, text=True, check=True)
        sid = next(csv.reader(identity.stdout.strip().splitlines()))[1]
        if not sid.startswith("S-1-"):
            raise ValueError("Cannot determine current Windows user")
        # Set ACL before writing any secret. Only current user inherits full control.
        subprocess.run(["icacls", str(destination), "/inheritance:r", "/grant:r", f"*{sid}:(OI)(CI)F"],
                       capture_output=True, text=True, check=True)


def provision(destination: Path) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from auth.passwords import hash_password

    private_directory(destination)
    accounts = [{"username": f"judge-{role}", "password": secrets.token_urlsafe(24)} for role in ("a", "b")]
    rows = [f"REVIEWER_{account['username'][-1].upper()}_PASSWORD_HASH={hash_password(account['password'])}"
            for account in accounts]
    rows.append("AUTH_SESSION_PEPPER=" + secrets.token_urlsafe(32))
    artifacts = {"accounts.json": json.dumps(accounts, indent=2) + "\n", "railway.env": "\n".join(rows) + "\n"}
    for name, content in artifacts.items():
        fd = os.open(destination / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a private, Git-ignored local reviewer credential bundle once.")
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    try:
        provision(args.directory)
    except (OSError, ValueError, subprocess.SubprocessError):
        print("Provisioning refused or failed. Use a NEW .local directory with private write access. No overwrite is allowed.",
              file=sys.stderr)
        return 1
    print("Reviewer credentials prepared locally. No secrets printed. Do not commit or share the entire bundle.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
