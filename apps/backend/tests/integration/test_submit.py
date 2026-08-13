from fastapi.testclient import TestClient

from main import app


def test_submit_is_idempotent_and_locks_input():
    creator = TestClient(app)
    try:
        created = creator.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
        )
        assert created.status_code == 201
        session_id = created.json()["id"]
        payload = {
            "answers": [0, 1, None, 3, 2],
            "guesses": [1, 0, 2, 3, None],
        }

        first = creator.post(
            f"/api/v1/sessions/{session_id}/me/submit",
            json=payload,
            headers={"Idempotency-Key": "submit-a"},
        )
        assert first.status_code == 200

        import main as main_module

        completed_at = main_module._session_repository._memory[session_id]["participants"][0][
            "completedAt"
        ]
        second = creator.post(
            f"/api/v1/sessions/{session_id}/me/submit",
            json=payload,
            headers={"Idempotency-Key": "submit-b"},
        )
        assert second.status_code == 200
        assert (
            main_module._session_repository._memory[session_id]["participants"][0][
                "completedAt"
            ]
            == completed_at
        )

        locked = creator.patch(
            f"/api/v1/sessions/{session_id}/me/input",
            json={"answers": [3, 3, 3, 3, 3]},
        )
        assert locked.status_code == 409
        assert locked.json()["error"]["code"] == "SESSION_ALREADY_SUBMITTED"
    finally:
        creator.close()
