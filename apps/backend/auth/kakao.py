from urllib.parse import urlencode

import httpx

from auth.errors import AuthError
from auth.settings import AuthSettings


class KakaoClient:
    def __init__(self, http: httpx.AsyncClient, settings: AuthSettings) -> None:
        self.http = http
        self.settings = settings

    def authorization_url(self, state: str) -> str:
        return "https://kauth.kakao.com/oauth/authorize?" + urlencode({
            "response_type": "code", "client_id": self.settings.rest_api_key,
            "redirect_uri": self.settings.callback_uri, "state": state,
        })

    async def exchange_identity(self, code: str) -> str:
        try:
            response = await self.http.post(
                "https://kauth.kakao.com/oauth/token", timeout=5.0,
                data={"grant_type": "authorization_code", "client_id": self.settings.rest_api_key,
                      "client_secret": self.settings.client_secret,
                      "redirect_uri": self.settings.callback_uri, "code": code},
            )
            response.raise_for_status()
            access_token = response.json()["access_token"]
            if not isinstance(access_token, str) or not access_token:
                raise ValueError("invalid token")
            profile = await self.http.get(
                "https://kapi.kakao.com/v2/user/me", timeout=5.0,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            profile.raise_for_status()
            kakao_id = profile.json()["id"]
            if type(kakao_id) is not int or kakao_id <= 0:
                raise ValueError("invalid identity")
            return str(kakao_id)
        except httpx.HTTPStatusError as exc:
            unavailable = exc.response.status_code >= 500 or exc.response.status_code == 429
            raise AuthError("AUTH_PROVIDER_UNAVAILABLE" if unavailable else "AUTH_RESTART_REQUIRED",
                            503 if unavailable else 401) from None
        except httpx.RequestError:
            raise AuthError("AUTH_PROVIDER_UNAVAILABLE", 503) from None
        except (ValueError, KeyError, TypeError):
            raise AuthError("AUTH_RESTART_REQUIRED") from None
