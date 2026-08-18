from fastapi.testclient import TestClient
from main import app


def _create_pair() -> tuple[TestClient, TestClient, str]:
    creator = TestClient(app)
    partner = TestClient(app)
    created = creator.post(
        "/api/v1/sessions",
        json={"nickname": "creator", "mode": "light"},
    )
    assert created.status_code == 201
    session_id = created.json()["id"]
    joined = partner.post(
        f"/api/v1/invitations/{created.json()['invitationCode']}/join",
        json={"nickname": "partner"},
    )
    assert joined.status_code == 200
    return creator, partner, session_id


def test_input_is_participant_scoped_and_accepts_nulls():
    creator, partner, session_id = _create_pair()
    try:
        creator_answers = [0, None, 2, 3, 1]
        partner_answers = [3, 2, None, 1, 0]
        saved_creator = creator.patch(
            f"/api/v1/sessions/{session_id}/me/input",
            json={"answers": creator_answers, "guesses": [1, 0, None, 2, 3]},
        )
        saved_partner = partner.patch(
            f"/api/v1/sessions/{session_id}/me/input",
            json={"answers": partner_answers, "guesses": [0, 1, 2, None, 3]},
        )

        assert saved_creator.status_code == 200
        assert saved_partner.status_code == 200
        assert creator.get(f"/api/v1/sessions/{session_id}/me/input").json() == {
            "answers": creator_answers,
            "guesses": [1, 0, None, 2, 3],
        }
        assert partner.get(f"/api/v1/sessions/{session_id}/me/input").json() == {
            "answers": partner_answers,
            "guesses": [0, 1, 2, None, 3],
        }
    finally:
        creator.close()
        partner.close()


def test_input_rejects_wrong_count_and_invalid_token_without_existence_leak():
    creator, partner, session_id = _create_pair()
    try:
        wrong_count = creator.patch(
            f"/api/v1/sessions/{session_id}/me/input",
            json={"answers": [0], "guesses": [0]},
        )
        assert wrong_count.status_code == 422
        assert wrong_count.json()["error"]["code"] == "QUESTION_COUNT_MISMATCH"

        invalid_value = creator.patch(
            f"/api/v1/sessions/{session_id}/me/input",
            json={"answers": [0, 1, 2, 3, 4]},
        )
        assert invalid_value.status_code == 422

        invalid_client = TestClient(app)
        invalid_client.cookies.set(
            "mrs_participant",
            f"{session_id}:invalid-token",
        )
        try:
            invalid = invalid_client.get(
                f"/api/v1/sessions/{session_id}/me/input"
            )
        finally:
            invalid_client.close()
        assert invalid.status_code == 401
        assert invalid.json()["error"]["code"] == "PARTICIPANT_UNAUTHORIZED"
    finally:
        creator.close()
        partner.close()
