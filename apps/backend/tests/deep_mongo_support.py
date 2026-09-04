"""Test-only, isolated Mongo access. Never consult the application Mongo URI."""

import os
import re
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError


def safe_test_uri(environment: Mapping[str, str]) -> str | None:
    uri = environment.get("DEEP_TEST_MONGODB_URI", "")
    if not uri:
        if environment.get("REQUIRE_DEEP_MONGO_TESTS") == "1":
            raise ValueError("DEEP_TEST_MONGODB_URI_REQUIRED")
        return None
    allowed = {"127.0.0.1", "localhost", "::1"}
    if environment.get("CI") == "true":
        allowed.add("mongodb")
    try:
        parsed = urlsplit(uri)
        valid = (parsed.scheme == "mongodb" and parsed.hostname in allowed and parsed.port in {None, 27017}
                 and parsed.username is None and parsed.password is None and parsed.path in {"", "/"}
                 and not parsed.query and not parsed.fragment and "," not in parsed.netloc)
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("UNSAFE_DEEP_TEST_MONGODB_URI")
    return uri


@asynccontextmanager
async def isolated_deep_database() -> AsyncIterator[Any]:
    uri = safe_test_uri(os.environ)
    if uri is None:
        pytest.skip("No isolated Deep Mongo configured; real database verification NOT executed.")
    client: AsyncMongoClient = AsyncMongoClient(uri, serverSelectionTimeoutMS=2000, tz_aware=True)
    name = "mirisalim_deep_test_" + uuid4().hex
    connected = False
    try:
        try:
            await client.admin.command("ping")
        except PyMongoError:
            if os.getenv("REQUIRE_DEEP_MONGO_TESTS") == "1":
                pytest.fail("Required isolated Mongo is unavailable.")
            pytest.skip("Isolated Mongo unavailable; database verification NOT executed.")
        connected = True
        yield client[name]
    finally:
        try:
            if connected:
                # Only the exact new UUID database generated above is ever removed.
                assert re.fullmatch(r"mirisalim_deep_test_[a-f0-9]{32}", name)
                await client.drop_database(name)
        finally:
            await client.close()
