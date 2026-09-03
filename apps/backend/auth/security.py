import hashlib
import hmac
from urllib.parse import urlsplit


def token_digest(token: str, pepper: str) -> str:
    return hmac.new(pepper.encode(), token.encode(), hashlib.sha256).hexdigest()


def validate_return_to(path: str) -> str:
    if (path != path.strip() or "\\" in path or "%" in path or "?" in path or "#" in path
            or any(ord(char) < 32 or ord(char) == 127 for char in path)):
        raise ValueError("INVALID_RETURN_TO")
    parsed = urlsplit(path)
    valid_path = parsed.path in {"/", "/deep"} or parsed.path.startswith("/deep/")
    if (not valid_path or parsed.scheme or parsed.netloc or parsed.fragment or parsed.query
            or any(part in {".", ".."} for part in parsed.path.split("/"))):
        raise ValueError("INVALID_RETURN_TO")
    return path
