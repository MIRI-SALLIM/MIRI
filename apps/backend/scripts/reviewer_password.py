"""Create a reviewer password hash locally, without a DB connection or plaintext output."""
import argparse
import getpass
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate one Railway reviewer password hash; never pass a password as an argument.")
    parser.add_argument("role", choices=("a", "b"))
    parser.add_argument("--stdin", action="store_true", help="Read one password line from stdin (for a secure pipe).")
    args = parser.parse_args()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from auth.passwords import hash_password

    if args.stdin:
        password = sys.stdin.readline(1024).rstrip("\r\n")
    else:
        password = getpass.getpass("Reviewer password (16-128 characters): ")
        if password != getpass.getpass("Confirm password: "):
            print("Passwords do not match.", file=sys.stderr)
            return 1
    try:
        encoded = hash_password(password)
    except ValueError:
        print("Password must contain 16 to 128 characters.", file=sys.stderr)
        return 1
    print(f"REVIEWER_{args.role.upper()}_PASSWORD_HASH={encoded}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
