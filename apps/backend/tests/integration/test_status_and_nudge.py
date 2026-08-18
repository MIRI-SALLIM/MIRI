from fastapi.testclient import TestClient

from main import app


def _create_pair() -> tuple[TestClient, TestClient, str]:
    creator = TestClient(app)
    guest = TestClient(app)
    created = creator.post(
        "/api/v1/sessions",
        json={"nickname": "creator", "mode": "light"},
    )
    assert created.status_code == 201
    joined = guest.post(
        f"/api/v1/invitations/{created.json()['invitationCode']}/join",
        json={"nickname": "guest"},
    )
    assert joined.status_code == 200
    return creator, guest, created.json()["id"]


def test_status_is_private_and_partner_observes_nudge_timestamp():
    creator, guest, session_id = _create_pair()
    try:
        initial = creator.get(f"/api/v1/sessions/{session_id}/status")
        assert initial.status_code == 200
        assert set(initial.json()) == {
            "meCompleted",
            "partnerJoined",
            "partnerCompleted",
            "partnerNudgedAt",
            "expiresAt",
        }
        assert initial.json()["partnerNudgedAt"] is None

        nudged = creator.post(f"/api/v1/sessions/{session_id}/nudge")
        assert nudged.status_code == 200
        repeated = creator.post(f"/api/v1/sessions/{session_id}/nudge")
        assert repeated.status_code == 429
        assert repeated.json()["error"]["code"] == "NUDGE_RATE_LIMITED"

        creator_view = creator.get(f"/api/v1/sessions/{session_id}/status")
        guest_view = guest.get(f"/api/v1/sessions/{session_id}/status")
        assert creator_view.json()["partnerNudgedAt"] is None
        assert guest_view.json()["partnerNudgedAt"] is not None
        assert "answers" not in guest_view.text
        assert "guesses" not in guest_view.text
    finally:
        creator.close()
        guest.close()


def test_nudge_requires_an_available_target():
    creator = TestClient(app)
    try:
        created = creator.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
        )
        assert created.status_code == 201
        session_id = created.json()["id"]

        before_join = creator.post(f"/api/v1/sessions/{session_id}/nudge")
        assert before_join.status_code == 409
        assert before_join.json()["error"]["code"] == "NUDGE_TARGET_UNAVAILABLE"
    finally:
        creator.close()


def test_nudge_is_unavailable_after_partner_submission():
    creator, guest, session_id = _create_pair()
    try:
        guest.patch(
            f"/api/v1/sessions/{session_id}/me/input",
            json={
                "answers": [0, 1, 2, 3, 2],
                "guesses": [1, 2, 3, 0, 1],
            },
        )
        submitted = guest.post(f"/api/v1/sessions/{session_id}/me/submit")
        assert submitted.status_code == 200

        response = creator.post(f"/api/v1/sessions/{session_id}/nudge")
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "NUDGE_TARGET_UNAVAILABLE"
    finally:
        creator.close()
        guest.close()
