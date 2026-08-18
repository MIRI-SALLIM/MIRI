import asyncio
import os
import uuid
from typing import Any

import main as main_module
import pytest
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from main import app
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError
from services.session_repository import (
    SessionRepository,
    digest_participant_token,
    utc_now,
)

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
PEPPER = os.getenv("PARTICIPANT_TOKEN_PEPPER", "test_pepper_at_least_32_bytes_long_secret")


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def real_mongo_db():
    """실제 MongoDB Atlas에 임시 격리 데이터베이스를 생성하고 테스트 후 정리합니다."""
    if not MONGODB_URI:
        pytest.skip("MONGODB_URI가 설정되어 있지 않아 실제 MongoDB 동시성 테스트를 건너뜁니다.")

    client: AsyncMongoClient = AsyncMongoClient(MONGODB_URI, serverSelectionTimeoutMS=2000)
    try:
        await client.admin.command("ping")
    except (PyMongoError, Exception):  # noqa: BLE001
        await client.close()
        pytest.skip("MongoDB 서버에 연결할 수 없어 실제 DB 동시성 테스트를 건너뜁니다.")

    test_db_name = f"mirisalim_test_concurrency_{uuid.uuid4().hex[:8]}"
    db = client[test_db_name]
    try:
        yield db
    finally:
        try:
            await client.drop_database(test_db_name)
        except PyMongoError:
            pass
        await client.close()


@pytest.mark.anyio
async def test_mongo_repository_patch_vs_submit_concurrency(real_mongo_db):
    """
    [저장소 레벨 검증]
    실제 MongoDB 컬렉션에서 update_input(PATCH)과 submit(POST)이 동시 실행될 때,
    원자적 조건부 갱신(CAS)에 의해 제출 완료 후 입력 오염이 100% 방지되는지 검증합니다.
    """
    repo = SessionRepository(real_mongo_db, use_memory=False)
    await repo.ensure_indexes()

    now = utc_now()
    initial_answers: list[int | None] = [0, 1, 2, 3, 0]
    initial_guesses: list[int | None] = [1, 0, 2, 3, 1]
    polluting_answers: list[int | None] = [3, 3, 3, 3, 3]
    polluting_guesses: list[int | None] = [0, 0, 0, 0, 0]

    for round_idx in range(5):
        # 1. 신규 세션 생성 및 초기 정상 답변 저장
        doc, token = await repo.create(
            nickname="tester",
            mode="light",
            question_set_version="light-v1",
            question_count=5,
            idempotency_key=f"conc-key-{round_idx}-{uuid.uuid4().hex[:6]}",
            pepper=PEPPER,
            now=now,
            ttl_days=7,
        )
        session_id = doc["id"]
        token_hash = digest_participant_token(token, PEPPER)

        # 초기 완전한 입력 저장
        save_status, _saved_doc = await repo.update_input(
            session_id=session_id,
            token_hash=token_hash,
            answers=initial_answers,
            guesses=initial_guesses,
            now=now,
        )
        assert save_status == "ok"

        # 2. update_input(오염 시도)과 submit을 동시에 비동기 발사!
        submit_task = asyncio.create_task(
            repo.submit(
                session_id=session_id,
                token_hash=token_hash,
                now=utc_now(),
            )
        )
        patch_task = asyncio.create_task(
            repo.update_input(
                session_id=session_id,
                token_hash=token_hash,
                answers=polluting_answers,
                guesses=polluting_guesses,
                now=utc_now(),
            )
        )

        submit_status, _submit_doc = await submit_task
        patch_status, _patch_doc = await patch_task

        assert submit_status in ("ok", "already_submitted")
        # patch는 submit보다 먼저 도달하면 "ok", submit 이후 도달하면 "submitted" 또는 "already_submitted"
        assert patch_status in ("ok", "submitted", "already_submitted")

        # 3. 최종 DB 상태 직접 조회 검증
        final_doc: dict[str, Any] | None = await real_mongo_db["sessions"].find_one({"id": session_id})
        assert final_doc is not None
        final_participant = final_doc["participants"][0]

        # completedAt은 반드시 기록되어 있어야 함
        assert final_participant["completedAt"] is not None

        # 만약 patch가 submit 이후에 처리되었다면,
        # DB의 answers는 결코 polluting_answers로 덮어씌워지지 않고 initial_answers여야 함!
        if patch_status in ("submitted", "already_submitted"):
            assert final_participant["answers"] == initial_answers, (
                f"경합 발생 시 제출 완료 후 answers가 오염되었습니다! 현재 값: {final_participant['answers']}"
            )


@pytest.mark.anyio
async def test_mongo_http_api_patch_vs_submit_concurrency(real_mongo_db):
    """
    [HTTP API 레벨 검증]
    실제 MongoDB 환경에서 AsyncClient를 통해 PATCH /me/input과 POST /me/submit을
    동시에 호출했을 때, 409 Conflict 및 무결성이 유지되는지 검증합니다.
    """
    real_repo = SessionRepository(real_mongo_db, use_memory=False)
    await real_repo.ensure_indexes()

    # 앱에 실제 MongoDB 저장소 주입
    original_repo = main_module._session_repository
    main_module._session_repository = real_repo

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. 세션 생성
            create_res = await client.post(
                "/api/v1/sessions",
                json={"nickname": "creator", "mode": "light"},
                headers={"Idempotency-Key": f"http-conc-{uuid.uuid4().hex}"},
            )
            assert create_res.status_code == 201
            session_id = create_res.json()["id"]
            cookie_value = create_res.cookies.get("mrs_participant")
            assert cookie_value is not None
            client.cookies.set("mrs_participant", cookie_value)

            # 2. 초기 완전한 답변 저장
            initial_payload = {
                "answers": [0, 1, 2, 3, 0],
                "guesses": [1, 0, 2, 3, 1],
            }
            save_res = await client.patch(
                f"/api/v1/sessions/{session_id}/me/input",
                json=initial_payload,
            )
            assert save_res.status_code == 200

            # 3. submit과 오염 patch를 동시 전송
            polluting_payload = {
                "answers": [3, 3, 3, 3, 3],
                "guesses": [0, 0, 0, 0, 0],
            }
            submit_task = asyncio.create_task(
                client.post(
                    f"/api/v1/sessions/{session_id}/me/submit",
                    headers={"Idempotency-Key": "http-conc-submit"},
                )
            )
            patch_task = asyncio.create_task(
                client.patch(
                    f"/api/v1/sessions/{session_id}/me/input",
                    json=polluting_payload,
                )
            )

            submit_resp = await submit_task
            patch_resp = await patch_task

            # submit은 반드시 200 성공
            assert submit_resp.status_code == 200
            assert submit_resp.json()["status"] == "submitted"
            assert "completedAt" in submit_resp.json()

            # patch는 200(submit 이전 도달) 또는 409(submit 이후 도달)
            assert patch_resp.status_code in (200, 409)
            if patch_resp.status_code == 409:
                assert patch_resp.json()["error"]["code"] == "SESSION_ALREADY_SUBMITTED"

            # 4. 제출 완료 후 추가 PATCH 시도 -> 무조건 409 확인
            after_locked = await client.patch(
                f"/api/v1/sessions/{session_id}/me/input",
                json=polluting_payload,
            )
            assert after_locked.status_code == 409
            assert after_locked.json()["error"]["code"] == "SESSION_ALREADY_SUBMITTED"
    finally:
        main_module._session_repository = original_repo


@pytest.mark.anyio
async def test_mongo_join_concurrency_two_guests_exact_one_winner(real_mongo_db):
    """
    [Task 6 동시 Join 검증]
    동일한 초대 링크에 대해 2명의 게스트가 동시에 POST /join을 호출할 때,
    MongoDB 조건부 $push에 의해 정확히 1명만 참여(200)하고 나머지 1명은 차단(404)되며
    세션 문서 참여자 수는 정확히 2명(A 1명, B 1명)임을 검증합니다.
    """
    real_repo = SessionRepository(real_mongo_db, use_memory=False)
    await real_repo.ensure_indexes()

    original_repo = main_module._session_repository
    main_module._session_repository = real_repo

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as creator_client:
            create_res = await creator_client.post(
                "/api/v1/sessions",
                json={"nickname": "creator", "mode": "light"},
                headers={"Idempotency-Key": f"join-conc-create-{uuid.uuid4().hex}"},
            )
            assert create_res.status_code == 201
            session_id = create_res.json()["id"]
            invitation_code = create_res.json()["invitationCode"]

            # 2명의 게스트 클라이언트 준비
            async with AsyncClient(transport=transport, base_url="http://test") as guest1_client, \
                       AsyncClient(transport=transport, base_url="http://test") as guest2_client:

                # 동시에 join 요청 발사!
                join_task1 = asyncio.create_task(
                    guest1_client.post(
                        f"/api/v1/invitations/{invitation_code}/join",
                        json={"nickname": "guest1"},
                    )
                )
                join_task2 = asyncio.create_task(
                    guest2_client.post(
                        f"/api/v1/invitations/{invitation_code}/join",
                        json={"nickname": "guest2"},
                    )
                )

                resp1 = await join_task1
                resp2 = await join_task2

                status_codes = [resp1.status_code, resp2.status_code]
                # 둘 중 정확히 1개는 200 성공, 1개는 409 실패여야 함
                assert status_codes.count(200) == 1, f"정확히 1명의 게스트만 성공해야 합니다: {status_codes}"
                assert status_codes.count(409) == 1, f"초과 게스트는 409 실패해야 합니다: {status_codes}"

                # 성공한 게스트는 쿠키가 발급되어 있어야 함
                winner_resp = resp1 if resp1.status_code == 200 else resp2
                loser_resp = resp2 if resp1.status_code == 200 else resp1
                assert "mrs_participant" in winner_resp.cookies
                assert loser_resp.json()["error"]["code"] == "SESSION_ALREADY_JOINED"

            # DB 직접 확인: 세션의 participants는 정확히 2명
            final_doc = await real_mongo_db["sessions"].find_one({"id": session_id})
            assert final_doc is not None
            assert len(final_doc["participants"]) == 2
            assert final_doc["participants"][0]["role"] == "creator"
            assert final_doc["participants"][1]["role"] == "invitee"
    finally:
        main_module._session_repository = original_repo


@pytest.mark.anyio
async def test_mongo_nudge_concurrency_exact_one_allowed(real_mongo_db):
    """
    [Task 6 넛지 동시성 검증]
    A와 B가 참여한 상태에서 A가 넛지 버튼을 더블 클릭(동시 호출)했을 때,
    원자적 조건부 갱신에 의해 정확히 1건만 200 성공하고, 1건은 429 NUDGE_RATE_LIMITED가 반환되는지 검증합니다.
    """
    real_repo = SessionRepository(real_mongo_db, use_memory=False)
    await real_repo.ensure_indexes()

    original_repo = main_module._session_repository
    main_module._session_repository = real_repo

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as creator_client, \
                   AsyncClient(transport=transport, base_url="http://test") as guest_client:

            # 1. 세션 생성 및 B 참여
            create_res = await creator_client.post(
                "/api/v1/sessions",
                json={"nickname": "creator", "mode": "light"},
                headers={"Idempotency-Key": f"nudge-conc-{uuid.uuid4().hex}"},
            )
            assert create_res.status_code == 201
            session_id = create_res.json()["id"]
            inv_code = create_res.json()["invitationCode"]
            c_cookie = create_res.cookies.get("mrs_participant")
            assert c_cookie is not None
            creator_client.cookies.set("mrs_participant", c_cookie)

            join_res = await guest_client.post(
                f"/api/v1/invitations/{inv_code}/join",
                json={"nickname": "guest"},
            )
            assert join_res.status_code == 200

            # 2. creator가 2개의 넛지 요청을 동시에 발사!
            nudge_task1 = asyncio.create_task(
                creator_client.post(f"/api/v1/sessions/{session_id}/nudge")
            )
            nudge_task2 = asyncio.create_task(
                creator_client.post(f"/api/v1/sessions/{session_id}/nudge")
            )

            nudge1 = await nudge_task1
            nudge2 = await nudge_task2

            status_codes = [nudge1.status_code, nudge2.status_code]
            assert status_codes.count(200) == 1, f"정확히 1건의 넛지만 성공해야 합니다: {status_codes}"
            assert status_codes.count(429) == 1, f"중복 넛지는 429 Rate Limit이어야 합니다: {status_codes}"

            rate_limited_resp = nudge1 if nudge1.status_code == 429 else nudge2
            assert rate_limited_resp.json()["error"]["code"] == "NUDGE_RATE_LIMITED"
    finally:
        main_module._session_repository = original_repo

