"""Small Mongo boundary double. Production repositories and their filters remain real.

Only implements operators used by these tests; unknown operators fail loudly.
Concurrency semantics must additionally be verified against Mongo in CI.
"""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

MISSING = object()


def read_path(document, path):
    current = document
    for part in path.split("."):
        if isinstance(current, list) and part.isdigit():
            index = int(part)
            if index >= len(current):
                return MISSING
            current = current[index]
            continue
        if not isinstance(current, dict) or part not in current:
            return MISSING
        current = current[part]
    return current


def write_path(document, path, value):
    parts = path.split(".")
    for part in parts[:-1]:
        document = document.setdefault(part, {})
    document[parts[-1]] = deepcopy(value)


def matches(document, query):
    for key, expected in query.items():
        if key in ("$or", "$and"):
            checks = [matches(document, item) for item in expected]
            if not (any(checks) if key == "$or" else all(checks)):
                return False
            continue
        actual = read_path(document, key)
        if isinstance(expected, dict) and any(k.startswith("$") for k in expected):
            for operator, value in expected.items():
                if operator == "$gt":
                    ok = actual is not MISSING and actual > value
                elif operator == "$in":
                    ok = actual in value
                elif operator == "$ne":
                    ok = actual != value
                elif operator == "$exists":
                    ok = (actual is not MISSING) == value
                else:
                    raise AssertionError(f"Unsupported fake operator: {operator}")
                if not ok:
                    return False
        elif not (actual == expected or (expected is None and actual is MISSING)):
            return False
    return True


class MemoryCollection:
    def __init__(self):
        self.documents = []
        self.unique = [("_id",)]

    async def create_index(self, keys, **kwargs):
        if kwargs.get("unique"):
            fields = (keys,) if isinstance(keys, str) else tuple(key for key, _ in keys)
            if fields not in self.unique:
                self.unique.append(fields)

    def check_unique(self, candidate, excluded=None):
        for fields in self.unique:
            for existing in self.documents:
                if existing is not excluded and all(read_path(existing, f) == read_path(candidate, f) for f in fields):
                    raise DuplicateKeyError("Test duplicate")

    async def insert_one(self, document):
        await asyncio.sleep(0)
        candidate = deepcopy(document)
        candidate.setdefault("_id", str(uuid4()))
        self.check_unique(candidate)
        self.documents.append(candidate)
        return SimpleNamespace(inserted_id=candidate["_id"])

    async def find_one(self, query):
        await asyncio.sleep(0)
        return next((deepcopy(d) for d in self.documents if matches(d, query)), None)

    async def find_one_and_update(self, query, update, *, upsert=False, return_document=ReturnDocument.BEFORE):
        await asyncio.sleep(0)
        existing = next((d for d in self.documents if matches(d, query)), None)
        if existing is None and not upsert:
            return None
        candidate = deepcopy(existing) if existing is not None else {k: v for k, v in query.items() if not k.startswith("$")}
        candidate.setdefault("_id", str(uuid4()))
        for operator, fields in update.items():
            if operator == "$setOnInsert" and existing is not None:
                continue
            for path, value in fields.items():
                if operator in ("$set", "$setOnInsert"):
                    write_path(candidate, path, value)
                elif operator == "$inc":
                    previous = read_path(candidate, path)
                    write_path(candidate, path, (0 if previous is MISSING else previous) + value)
                elif operator == "$addToSet":
                    previous = read_path(candidate, path)
                    values = [] if previous is MISSING else list(previous)
                    if value not in values:
                        values.append(value)
                    write_path(candidate, path, values)
                elif operator == "$push":
                    previous = read_path(candidate, path)
                    values = [] if previous is MISSING else list(previous)
                    values.append(value)
                    write_path(candidate, path, values)
                else:
                    raise AssertionError(f"Unsupported fake update: {operator}")
        self.check_unique(candidate, existing)
        before = deepcopy(existing)
        if existing is None:
            self.documents.append(candidate)
        else:
            existing.clear()
            existing.update(candidate)
        return deepcopy(candidate) if return_document == ReturnDocument.AFTER else before

    async def delete_many(self, query):
        await asyncio.sleep(0)
        remaining = [document for document in self.documents if not matches(document, query)]
        count = len(self.documents) - len(remaining)
        self.documents[:] = remaining
        return SimpleNamespace(deleted_count=count)

    async def delete_one(self, query):
        await asyncio.sleep(0)
        for index, document in enumerate(self.documents):
            if matches(document, query):
                self.documents.pop(index)
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    def find(self, query):
        collection = self

        class Cursor:
            async def to_list(self, length=None):
                await asyncio.sleep(0)
                values = [deepcopy(document) for document in collection.documents if matches(document, query)]
                return values if length is None else values[:length]

        return Cursor()


class MemoryDatabase:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, name):
        return self.collections.setdefault(name, MemoryCollection())
