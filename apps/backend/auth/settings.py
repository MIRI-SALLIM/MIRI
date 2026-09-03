from collections.abc import Mapping
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from auth.reviewer_settings import load_reviewer_settings


@dataclass(frozen=True)
class AuthSettings:
    enabled: bool
    public_app_origin: str
    rest_api_key: str = field(repr=False)
    client_secret: str = field(repr=False)
    session_pepper: str = field(repr=False)
    secure_cookie: bool
    kakao_enabled: bool = True
    reviewer_enabled: bool = False

    @property
    def callback_uri(self) -> str:
        return self.public_app_origin + "/api/v1/auth/kakao/callback"


def load_auth_settings(environ: Mapping[str, str]) -> AuthSettings:
    enabled = environ.get("DEEP_MODE_ENABLED", "false").lower() == "true"
    kakao_enabled = environ.get("KAKAO_LOGIN_ENABLED", "true").lower() == "true"
    reviewer_enabled = environ.get("REVIEWER_LOGIN_ENABLED", "false").lower() == "true"
    production = environ.get("ENVIRONMENT", "development").lower() in {"production", "prod"}
    origin = environ.get("PUBLIC_APP_ORIGIN", "")
    key = environ.get("KAKAO_REST_API_KEY", "")
    secret = environ.get("KAKAO_CLIENT_SECRET", "")
    pepper = environ.get("AUTH_SESSION_PEPPER", "")
    if enabled:
        if not kakao_enabled and not reviewer_enabled:
            raise RuntimeError("At least one login provider is required")
        required = [("AUTH_SESSION_PEPPER", pepper, 32)]
        if kakao_enabled:
            required.extend([("KAKAO_REST_API_KEY", key, 1), ("KAKAO_CLIENT_SECRET", secret, 1)])
        for name, value, minimum in required:
            if len(value.strip()) < minimum:
                raise RuntimeError(f"Invalid {name}")
        if reviewer_enabled:
            load_reviewer_settings(environ)
        try:
            parsed = urlsplit(origin)
            valid_origin = (
                parsed.scheme in {"https", "http"} and bool(parsed.hostname)
                and not parsed.username and not parsed.password and not parsed.path
                and not parsed.query and not parsed.fragment and parsed.port != 0
                and origin == f"{parsed.scheme}://{parsed.netloc}"
                and origin == origin.strip() and "\\" not in origin
                and not any(ord(char) < 33 or ord(char) == 127 for char in origin)
                and (not production or parsed.scheme == "https")
            )
        except ValueError:
            valid_origin = False
        if not valid_origin:
            raise RuntimeError("Invalid PUBLIC_APP_ORIGIN")
    return AuthSettings(enabled, origin, key, secret, pepper, production or origin.startswith("https://"),
                        kakao_enabled, reviewer_enabled)
