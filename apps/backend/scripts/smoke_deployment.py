"""Smoke checks for an already deployed backend without logging secrets."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

Response = tuple[int, dict[str, str], dict[str, Any]]


class SmokeError(RuntimeError):
    """A deployment contract check failed without carrying secret data."""


def _request(method: str, url: str, payload: dict[str, str] | None = None) -> Response:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data is not None else {},
        method=method,
    )
    try:
        response = urlopen(request, timeout=15)
    except HTTPError as exc:
        response = exc
    except URLError as exc:
        raise SmokeError("request failed") from exc

    with response:
        status_code = response.status
        headers = {name.lower(): value for name, value in response.headers.items()}
        try:
            body = json.loads(response.read().decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SmokeError("response was not valid JSON") from exc

    if not isinstance(body, dict):
        raise SmokeError("response JSON was not an object")
    return status_code, headers, body


def _require(condition: bool, check_name: str) -> None:
    if not condition:
        raise SmokeError(f"{check_name} check failed")


def run_smoke(base_url: str) -> None:
    base_url = base_url.rstrip("/")

    health = _request("GET", f"{base_url}/health")
    _require(health[0] == 200, "health status")
    _require(health[2].get("status") == "ok", "health body")
    print("health: PASS")

    _require(health[2].get("database") == "connected", "database connection")
    print("database: PASS")

    questions = _request(
        "GET", f"{base_url}/api/v1/light/questions?version=light-v1"
    )
    _require(questions[0] == 200, "questions status")
    _require(questions[2].get("version") == "light-v1", "question version")
    question_items = questions[2].get("questions")
    _require(isinstance(question_items, list) and len(question_items) == 5, "question count")
    print("questions: PASS")

    session = _request(
        "POST",
        f"{base_url}/api/v1/sessions",
        {"nickname": "deployment-smoke", "mode": "light"},
    )
    _require(session[0] == 201, "session status")
    _require("mrs_participant=" in session[1].get("set-cookie", ""), "session cookie")
    print("session: PASS")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url", help="Railway or Vercel backend base URL")
    args = parser.parse_args()
    try:
        run_smoke(args.base_url)
    except SmokeError as exc:
        print(f"smoke failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
