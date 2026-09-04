import pytest

from tests.integration.test_deep_sessions import create, headers
from tests.v3_factory import v3_input, v3_plan

BASE = "/api/v1/deep/v3"


def start(client):
    response = client.post(BASE + "/sessions", json={}, headers=headers())
    assert response.status_code == 201, response.text
    created = response.json()
    joined = client.post(f'{BASE}/invitations/{created["invitationCode"]}/join', json={}, headers=headers("user-b"))
    assert joined.status_code == 200, joined.text
    return f'{BASE}/sessions/{created["id"]}'


def ready(client, finance=True, values=True):
    path = start(client)
    assert client.patch(path + "/plan", json={"expectedVersion": 1, "plan": v3_plan()}, headers=headers()).status_code == 200
    for user in ("user-a", "user-b"):
        data = v3_input()
        data["contextNotes"] = {"D1": "SECRET-PRIVATE-NOTE"}
        response = client.patch(path + "/me/input", json={"expectedRevision": 0, "input": data}, headers=headers(user))
        assert response.status_code == 200, response.text
        assert client.post(path + "/plan/confirm", json={"planVersion": 2}, headers=headers(user)).status_code == 200
        response = client.post(path + "/me/submit", json={"expectedRevision": 1, "planVersion": 2,
            "consentVersion": "deep-sharing-v2", "shareFinance": finance if user == "user-b" else True,
            "shareValues": values if user == "user-b" else True}, headers=headers(user))
        assert response.status_code == 200, response.text
        if user == "user-a":
            assert client.get(path + "/result").json()["status"] == "waiting"
            assert client.patch(path + "/plan", json={"expectedVersion": 2, "plan": v3_plan()}, headers=headers()).status_code == 409
    response = client.get(path + "/result")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "ready"
    return path, response.json()


@pytest.mark.parametrize("finance,values", [(True, True), (True, False), (False, True), (False, False)])
def test_v3_joint_result_consent_and_immutable_report(deep_context, finance, values):
    client, _, _ = deep_context
    path, result = ready(client, finance, values)
    assert "SECRET-PRIVATE-NOTE" not in str(result)
    report = result["report"]
    assert report["versions"]["questionVersion"] == "deep-v3"
    for key in ("cashflow", "housing", "goal", "planning"):
        if not finance:
            assert report[key]["data"] is None
    if finance:
        assert report["planning"]["data"]["contributionGapWon"] == 400000
    if not values:
        assert report["values"]["data"] is None
    assert client.get(path + "/result").json() == result
    assert client.get(path + "/result", headers=headers("user-c")).status_code == 404


def test_version_guards_and_draft_question_privacy(deep_context):
    client, _, db = deep_context
    path = start(client)
    oldpath = path.replace("/v3", "")
    assert client.get(oldpath + "/me/input").status_code == 404
    assert client.post(oldpath + "/withdraw", json={}, headers=headers()).status_code == 404
    response = client.get(path + "/me/questions")
    assert response.status_code == 200
    assert len(response.json()["planningQuestions"]) == 6
    assert "partner" not in response.json()
    legacy = create(client, key="old")
    assert client.get(f'{BASE}/sessions/{legacy["id"]}/me/input').status_code == 404
    assert client.post(f'{BASE}/invitations/{legacy["invitationCode"]}/join', json={}, headers=headers("user-b")).status_code == 404
    stored = next(row for row in db["deep_sessions"].documents if row["id"] == legacy["id"])
    assert stored["members"]["B"] is None
    data = v3_input()
    response = client.patch(path + "/me/input", json={"expectedRevision": 0, "input": data}, headers=headers())
    assert response.status_code == 200
    assert client.patch(path + "/me/input", json={"expectedRevision": 0, "input": data}, headers=headers()).status_code == 409
    bad = client.patch(path + "/me/input", json={"expectedRevision": 1, "input": {"PRIVATE-JSON-KEY": "secret"}}, headers=headers())
    assert bad.status_code == 422 and "PRIVATE-JSON-KEY" not in bad.text
    assert client.post(path + "/me/submit", json={"expectedRevision": 1, "planVersion": 1,
        "consentVersion": "deep-sharing-v1", "shareFinance": True, "shareValues": True}, headers=headers()).status_code == 422


def terms(a=1000000, b=1000000):
    return {"topic": "monthlyContribution", "scope": "주거비와 식비", "owner": "both", "startMonth": "2026-10",
            "dueDay": 1, "monthlyContributions": {"A": a, "B": b}, "commonScope": ["housing", "food"], "exceptions": "소득이 바뀌면 재논의"}


def test_structured_agreement_lifecycle_and_round_reset(deep_context):
    client, _, _ = deep_context
    path, original = ready(client)
    proposal = {"expectedRound": 1, "text": "공동 생활비를 함께 낸다", "terms": terms()}
    response = client.post(path + "/agreements", json=proposal, headers=headers())
    assert response.status_code == 201, response.text
    agreement_path = path + "/agreements/" + response.json()["id"]
    assert client.get(path + "/result").json()["operatingStatus"]["status"] == "proposed"
    for user in ("user-a", "user-b"):
        assert client.post(agreement_path + "/confirm", json={"expectedVersion": 1}, headers=headers(user)).status_code == 200
    current = client.get(path + "/result").json()
    assert current["report"] == original["report"]
    assert current["operatingStatus"]["status"] == "agreed"
    assert current["operatingStatus"]["contributionGapWon"] == 0
    changed = client.patch(agreement_path, json={"expectedVersion": 1, "text": "분담 수정", "terms": terms(900000)}, headers=headers()).json()
    assert changed["version"] == 2 and not changed["myConfirmed"] and not changed["partnerConfirmed"]
    assert client.post(agreement_path + "/confirm", json={"expectedVersion": 1}, headers=headers("user-b")).status_code == 409
    assert client.post(agreement_path + "/defer", json={"expectedVersion": 2}, headers=headers()).status_code == 200
    assert client.get(path + "/result").json()["operatingStatus"]["status"] == "deferred"
    for user in ("user-a", "user-b"):
        assert client.post(path + "/rounds", json={"expectedRound": 1}, headers=headers(user)).status_code == 200
    assert client.get(path + "/result").json()["status"] == "waiting"
    assert client.get(path + "/me/input").json()["input"]["inputVersion"] == "deep-input-v3"
    assert client.get(path + "/agreements").status_code == 409
    assert client.post(path + "/withdraw", json={}, headers=headers()).status_code == 200
    assert client.post(path + "/withdraw", json={}, headers=headers()).status_code == 200
    assert client.get(path + "/result").status_code == 410


def test_legacy_withdrawal_remains_retryable(deep_context):
    client, _, _ = deep_context
    created = create(client)
    path = f'/api/v1/deep/sessions/{created["id"]}/withdraw'
    assert client.post(path, json={}, headers=headers()).status_code == 200
    assert client.post(path, json={}, headers=headers()).status_code == 200
    assert client.post(path, json={}, headers=headers("user-c")).status_code == 404


def test_only_explicit_same_budget_and_month_agreement_is_comparable(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client)
    decision = terms()
    decision.update(scope="식비만", startMonth="2027-10", commonScope=["food"])
    response = client.post(path + "/agreements", json={"expectedRound": 1, "text": "식비만 합의", "terms": decision}, headers=headers())
    agreement_path = path + "/agreements/" + response.json()["id"]
    for user in ("user-a", "user-b"):
        assert client.post(agreement_path + "/confirm", json={"expectedVersion": 1}, headers=headers(user)).status_code == 200
    operating = client.get(path + "/result").json()["operatingStatus"]
    assert operating["status"] == "agreed"
    assert operating["contributionGapWon"] is None


def test_multiple_agreed_contribution_proposals_are_not_silently_combined(deep_context):
    client, _, _ = deep_context
    path, _ = ready(client)
    for number in range(2):
        response = client.post(path + "/agreements", json={"expectedRound": 1, "text": f"분담안{number}", "terms": terms()}, headers=headers())
        agreement_path = path + "/agreements/" + response.json()["id"]
        for user in ("user-a", "user-b"):
            assert client.post(agreement_path + "/confirm", json={"expectedVersion": 1}, headers=headers(user)).status_code == 200
    result = client.get(path + "/result").json()
    assert result["operatingStatus"]["status"] == "conflicting"
    assert result["operatingStatus"]["contributionGapWon"] is None
