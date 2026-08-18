import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("ENVIRONMENT", "test")


@pytest.fixture(autouse=True)
def isolate_session_repository():
    import main as main_module

    main_module._session_repository = None
    yield
    main_module._session_repository = None
