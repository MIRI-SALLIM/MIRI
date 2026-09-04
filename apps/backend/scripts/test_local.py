"""Run local tests without ever inheriting an Atlas connection from .env."""

import os
import sys
from pathlib import Path


def main() -> int:
    os.environ.update(ENVIRONMENT="test", MONGODB_URI="", DEEP_TEST_MONGODB_URI="", DEEP_MODE_ENABLED="false",
                      REVIEWER_LOGIN_ENABLED="false", KAKAO_LOGIN_ENABLED="true")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import pytest

    return int(pytest.main(sys.argv[1:] or ["-q"]))


if __name__ == "__main__":
    raise SystemExit(main())
