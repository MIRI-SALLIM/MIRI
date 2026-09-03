import importlib
from copy import deepcopy
from datetime import datetime, timezone

import pytest

from tests.deep_factory import ready_document

NOW = datetime(2026, 9, 3, tzinfo=timezone.utc)


def state():
    return importlib.import_module("deep.state")


@pytest.mark.parametrize("mutate", [
    lambda d: d["members"]["B"].update(confirmedPlanVersion=0),
    lambda d: d["members"]["B"].update(submittedAt=None),
    lambda d: d["members"]["B"].update(consent=None),
    lambda d: d["members"]["B"]["consent"].update(version="old"),
    lambda d: d["members"]["B"]["consent"].update(submittedRevision=0),
    lambda d: d["members"]["B"]["consent"].update(round=0),
    lambda d: d["members"]["B"].update(userId="user-a"),
    lambda d: d.update(status="closed"),
    lambda d: d.update(status="collecting"),
    lambda d: d.update(expiresAt=NOW),
    lambda d: d["members"].update(B=None),
])
def test_matching_submissions_current_round_consent_and_plan_are_all_required(mutate):
    document = ready_document()
    assert state().can_publish(document, NOW)
    mutate(document)
    assert not state().can_publish(document, NOW)


def test_publication_stamp_is_deterministic_but_changes_with_every_authorization_dimension():
    stamp = state().publication_stamp(ready_document())
    assert stamp == state().publication_stamp(deepcopy(ready_document()))
    for path, value in [
        (("round",), 2), (("plan", "version"), 2), (("questionVersion",), "other"),
        (("ruleVersion",), "other"), (("copyVersion",), "other"), (("consentVersion",), "other"),
        (("members", "A", "revision"), 2), (("members", "B", "consent", "shareFinance"), False),
        (("members", "A", "consent", "shareValues"), False),
    ]:
        changed = ready_document()
        cursor = changed
        for key in path[:-1]:
            cursor = cursor[key]
        cursor[path[-1]] = value
        assert state().publication_stamp(changed) != stamp
