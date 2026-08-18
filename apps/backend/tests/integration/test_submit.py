from fastapi.testclient import TestClient
from main import app


def test_submit_rejects_incomplete_input():
    creator = TestClient(app)
    try:
        created = creator.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
        )
        assert created.status_code == 201
        session_id = created.json()["id"]

        # 1. 초기 미입력 상태에서 제출 시도 -> 422 INPUT_INCOMPLETE
        empty_submit = creator.post(f"/api/v1/sessions/{session_id}/me/submit")
        assert empty_submit.status_code == 422
        assert empty_submit.json()["error"]["code"] == "INPUT_INCOMPLETE"

        # 2. 일부만 입력(null 포함)된 상태에서 제출 시도 -> 422 INPUT_INCOMPLETE
        creator.patch(
            f"/api/v1/sessions/{session_id}/me/input",
            json={
                "answers": [0, 1, None, 3, 2],
                "guesses": [1, 0, 2, 3, 0],
            },
        )
        partial_submit = creator.post(f"/api/v1/sessions/{session_id}/me/submit")
        assert partial_submit.status_code == 422
        assert partial_submit.json()["error"]["code"] == "INPUT_INCOMPLETE"
    finally:
        creator.close()


def test_submit_is_idempotent_and_locks_input():
    creator = TestClient(app)
    try:
        created = creator.post(
            "/api/v1/sessions",
            json={"nickname": "creator", "mode": "light"},
        )
        assert created.status_code == 201
        session_id = created.json()["id"]

        # 1. 완전한 답변 및 예측 저장
        save_res = creator.patch(
            f"/api/v1/sessions/{session_id}/me/input",
            json={
                "answers": [0, 1, 2, 3, 0],
                "guesses": [1, 0, 2, 3, 1],
            },
        )
        assert save_res.status_code == 200

        # 2. Body 없이 최초 제출
        first = creator.post(
            f"/api/v1/sessions/{session_id}/me/submit",
            headers={"Idempotency-Key": "submit-a"},
        )
        assert first.status_code == 200
        first_data = first.json()
        assert first_data["status"] == "submitted"
        assert "completedAt" in first_data
        completed_at = first_data["completedAt"]

        # 3. 동일 참여자 중복 제출 시 멱등성 검증 (동일 completedAt 반환)
        second = creator.post(
            f"/api/v1/sessions/{session_id}/me/submit",
            headers={"Idempotency-Key": "submit-b"},
        )
        assert second.status_code == 200
        assert second.json()["status"] == "submitted"
        assert second.json()["completedAt"] == completed_at

        # 4. 제출 완료 후 입력 수정 시도 -> 409 SESSION_ALREADY_SUBMITTED
        locked = creator.patch(
            f"/api/v1/sessions/{session_id}/me/input",
            json={
                "answers": [3, 3, 3, 3, 3],
                "guesses": [0, 0, 0, 0, 0],
            },
        )
        assert locked.status_code == 409
        assert locked.json()["error"]["code"] == "SESSION_ALREADY_SUBMITTED"
    finally:
        creator.close()
