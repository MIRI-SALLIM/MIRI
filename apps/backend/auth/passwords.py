"""Bounded PBKDF2 encoding for the two provisioned reviewer credentials."""
import hashlib
import hmac
import re
import secrets

ITERATIONS = 600000
FORMAT = re.compile(r"pbkdf2_sha256\$600000\$([0-9a-f]{32})\$([0-9a-f]{64})\Z")


def valid_password_hash(encoded: str) -> bool:
    return FORMAT.fullmatch(encoded) is not None


def hash_password(password: str) -> str:
    if not 16 <= len(password) <= 128:
        raise ValueError("Password must contain 16 to 128 characters")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    match = FORMAT.fullmatch(encoded)
    if match is None or not 1 <= len(password) <= 128:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(match[1]), ITERATIONS)
    return hmac.compare_digest(digest.hex(), match[2])
