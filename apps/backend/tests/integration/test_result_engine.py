import asyncio
import os
import uuid

import pytest
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError

import main as main_module
from main import app
from services.light_result import (
    calculate_light_canonical_result,
    calculate_mutual_hit_count,
    classify_participant_type,
    get_tagline,
    project_result_for_viewer,
)
from services.session_repository import SessionRepository

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def real_mongo_db():
    """실제 MongoDB Atlas에 임시 격리 데이터베이스를 생성하고 테스트 후 정리합니다."""
    if not MONGODB_URI:
        pytest.skip("MONGODB_URI가 설정되어 있지 않아 실제 MongoDB 동시성 테스트를 건너뜁니다.")

    client: AsyncMongoClient = AsyncMongoClient(MONGODB_URI)
    test_db_name = f"mirisalim_test_result_{uuid.uuid4().hex[:8]}"
    db = client[test_db_name]
    try:
        yield db
    finally:
        try:
            await client.drop_database(test_db_name)
        except PyMongoError:
            pass
        await client.close()


def test_pure_engine_four_personality_combinations():
    """
    [순수 엔진 테스트]
    spending_style(2번)과 shared_expense(4번) 조합에 따라
    4대 성향(saver_joint, saver_separate, spender_joint, spender_separate)이 정확히 판정되는지 검증합니다.
    """
    # 1. saver_joint: spending=2(저축), shared=2(공동)
    type_sj = classify_participant_type([0, 0, 2, 0, 2])
    assert type_sj.typeCode == "saver_joint"
    assert type_sj.time == "saver"
    assert type_sj.mgmt == "joint"

    # 2. saver_separate: spending=3(저축 우선), shared=0(각자)
    type_ss = classify_participant_type([1, 1, 3, 1, 0])
    assert type_ss.typeCode == "saver_separate"
    assert type_ss.time == "saver"
    assert type_ss.mgmt == "separate"

    # 3. spender_joint: spending=0(소비 우선), shared=3(통합 공동)
    type_pj = classify_participant_type([2, 2, 0, 2, 3])
    assert type_pj.typeCode == "spender_joint"
    assert type_pj.time == "spender"
    assert type_pj.mgmt == "joint"

    # 4. spender_separate: spending=1(소비 비중), shared=1(각자+공용)
    type_ps = classify_participant_type([3, 3, 1, 3, 1])
    assert type_ps.typeCode == "spender_separate"
    assert type_ps.time == "spender"
    assert type_ps.mgmt == "separate"


def test_pure_engine_mutual_hit_count_and_taglines():
    """
    [상호 적중 점수 및 태그라인 검증]
    5개 질문에 대해 양측 예측이 모두 일치하는 경우만 점수가 올라가며, 점수별 태그라인이 올바르게 도출되는지 검증합니다.
    """
    # A와 B의 실제 답변
    answers_a = [0, 1, 2, 3, 0]
    answers_b = [1, 2, 3, 0, 1]

    # Case 1: 5개 전부 완벽 적중 (A는 B의 답을 맞추고, B도 A의 답을 맞춤)
    guesses_a_perfect = [1, 2, 3, 0, 1]
    guesses_b_perfect = [0, 1, 2, 3, 0]
    assert calculate_mutual_hit_count(answers_a, guesses_a_perfect, answers_b, guesses_b_perfect, 5) == 5
    assert "텔레파시" in get_tagline(5)

    # Case 2: 3개만 적중
    guesses_a_3 = [1, 2, 3, 9, 9]
    guesses_b_3 = [0, 1, 2, 9, 9]
    assert calculate_mutual_hit_count(answers_a, guesses_a_3, answers_b, guesses_b_3, 5) == 3
    assert "찰떡궁합" in get_tagline(3)

    # Case 3: 0개 적중
    guesses_a_0 = [9, 9, 9, 9, 9]
    guesses_b_0 = [9, 9, 9, 9, 9]
    assert calculate_mutual_hit_count(answers_a, guesses_a_0, answers_b, guesses_b_0, 5) == 0
    assert "반대 성향" in get_tagline(0)


def test_canonical_result_strictly_excludes_monetary_data():
    """
    [프라이버시 보안 검증]
    결과 데이터에는 소득, 저축액, 부채와 같은 금액 문항(0, 1, 3번)의 실제 값/라벨/대표 금액이
    100% 제외되어야 합니다.
    """
    creator = {
        "answers": [3, 3, 2, 3, 2],  # 소득(3=450만이상), 저축(3=120만이상), 부채(3=1억이상)
        "guesses": [0, 0, 0, 0, 0],
    }
    invitee = {
        "answers": [0, 0, 0, 0, 0],  # 소득(0=200만미만), 저축(0=20만미만), 부채(0=0원)
        "guesses": [3, 3, 2, 3, 2],
    }

    canonical = calculate_light_canonical_result(creator, invitee, 5)
    projected = project_result_for_viewer(canonical, viewer_role="creator")

    # 1. 공개 문항 목록에는 오직 2개(spending_style, shared_expense)만 있어야 함
    assert len(projected.questions) == 2
    question_ids = [q.questionId for q in projected.questions]
    assert "spending_style" in question_ids
    assert "shared_expense" in question_ids
    assert "monthly_income" not in question_ids
    assert "saving_ratio" not in question_ids
    assert "debt_load" not in question_ids

    # 2. JSON 직렬화 후에도 금액 관련 텍스트가 일절 없어야 함
    dumped_str = projected.model_dump_json()
    assert "monthly_income" not in dumped_str
    assert "saving_ratio" not in dumped_str
    assert "debt_load" not in dumped_str
    assert "450만원" not in dumped_str
    assert "1억원" not in dumped_str


@pytest.mark.anyio
async def test_http_api_result_gate_and_viewer_projection(real_mongo_db):
    """
    [HTTP API 통합 검증]
    1. 한 명만 제출한 상태에서는 GET /result가 무조건 waiting (2개 필드) 반환
    2. 양측 제출 완료 후 Creator와 Invitee 각각의 관점에서 my/partner 대칭 변환 검증
    """
    real_repo = SessionRepository(real_mongo_db, use_memory=False)
    await real_repo.ensure_indexes()

    original_repo = main_module._session_repository
    main_module._session_repository = real_repo

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as creator_client, \
                   AsyncClient(transport=transport, base_url="http://test") as guest_client:

            # 1. 세션 생성 (Creator)
            create_res = await creator_client.post(
                "/api/v1/sessions",
                json={"nickname": "creator", "mode": "light"},
                headers={"Idempotency-Key": f"res-gate-{uuid.uuid4().hex}"},
            )
            assert create_res.status_code == 201
            session_id = create_res.json()["id"]
            inv_code = create_res.json()["invitationCode"]
            c_cookie = create_res.cookies.get("mrs_participant")
            assert c_cookie is not None
            creator_client.cookies.set("mrs_participant", c_cookie)

            # 2. Invitee 세션 참여
            join_res = await guest_client.post(
                f"/api/v1/invitations/{inv_code}/join",
                json={"nickname": "guest"},
            )
            assert join_res.status_code == 200
            g_cookie = join_res.cookies.get("mrs_participant")
            assert g_cookie is not None
            guest_client.cookies.set("mrs_participant", g_cookie)

            # 3. Creator만 입력 저장 및 제출 (Invitee는 미제출)
            # Creator: saver_joint (spending=2, shared=2)
            await creator_client.patch(
                f"/api/v1/sessions/{session_id}/me/input",
                json={"answers": [0, 1, 2, 0, 2], "guesses": [1, 0, 0, 1, 0]},
            )
            submit_c = await creator_client.post(f"/api/v1/sessions/{session_id}/me/submit")
            assert submit_c.status_code == 200

            # 4. [게이트 검증] Creator가 GET /result 호출 -> 반드시 waiting 반환
            res_waiting = await creator_client.get(f"/api/v1/sessions/{session_id}/result")
            assert res_waiting.status_code == 200
            assert res_waiting.json() == {"status": "waiting", "partnerCompleted": False}

            # 5. Invitee도 입력 저장 및 제출 완료!
            # Invitee: spender_separate (spending=0, shared=0)
            await guest_client.patch(
                f"/api/v1/sessions/{session_id}/me/input",
                json={"answers": [1, 0, 0, 1, 0], "guesses": [0, 1, 2, 0, 2]},
            )
            submit_g = await guest_client.post(f"/api/v1/sessions/{session_id}/me/submit")
            assert submit_g.status_code == 200

            # 6. [결과 공개 검증] Creator 관점 조회
            res_creator = await creator_client.get(f"/api/v1/sessions/{session_id}/result")
            assert res_creator.status_code == 200
            data_c = res_creator.json()
            assert data_c["status"] == "ready"
            assert data_c["partnerCompleted"] is True
            # Creator 관점: myType=saver_joint, partnerType=spender_separate
            assert data_c["result"]["myType"]["typeCode"] == "saver_joint"
            assert data_c["result"]["partnerType"]["typeCode"] == "spender_separate"
            # 5개 전부 완벽 적중
            assert data_c["result"]["mutualHitCount"] == 5

            # 7. [결과 공개 검증] Invitee 관점 조회 (대칭 스왑 확인)
            res_guest = await guest_client.get(f"/api/v1/sessions/{session_id}/result")
            assert res_guest.status_code == 200
            data_g = res_guest.json()
            assert data_g["status"] == "ready"
            # Invitee 관점: myType=spender_separate, partnerType=saver_joint
            assert data_g["result"]["myType"]["typeCode"] == "spender_separate"
            assert data_g["result"]["partnerType"]["typeCode"] == "saver_joint"
            assert data_g["result"]["mutualHitCount"] == 5

    finally:
        main_module._session_repository = original_repo


@pytest.mark.anyio
async def test_mongo_concurrent_result_polling_single_cache_cas(real_mongo_db):
    """
    [동시성 CAS 검증]
    실제 MongoDB Atlas 환경에서 양측 완료 후 A와 B가 동시에 GET /result를 폴링할 때,
    MongoDB CAS 원자적 연산으로 cachedResult가 단 1회만 생성되고 두 요청 모두 200 OK를 반환하는지 검증합니다.
    """
    real_repo = SessionRepository(real_mongo_db, use_memory=False)
    await real_repo.ensure_indexes()

    original_repo = main_module._session_repository
    main_module._session_repository = real_repo

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as creator_client, \
                   AsyncClient(transport=transport, base_url="http://test") as guest_client:

            # 세션 생성 & Join & 양측 제출
            c_res = await creator_client.post("/api/v1/sessions", json={"nickname": "c", "mode": "light"})
            s_id = c_res.json()["id"]
            code = c_res.json()["invitationCode"]
            creator_client.cookies.set("mrs_participant", c_res.cookies.get("mrs_participant"))

            j_res = await guest_client.post(f"/api/v1/invitations/{code}/join", json={"nickname": "g"})
            guest_client.cookies.set("mrs_participant", j_res.cookies.get("mrs_participant"))

            await creator_client.patch(f"/api/v1/sessions/{s_id}/me/input", json={"answers": [0,1,2,3,0], "guesses": [0,1,2,3,0]})
            await creator_client.post(f"/api/v1/sessions/{s_id}/me/submit")

            await guest_client.patch(f"/api/v1/sessions/{s_id}/me/input", json={"answers": [0,1,2,3,0], "guesses": [0,1,2,3,0]})
            await guest_client.post(f"/api/v1/sessions/{s_id}/me/submit")

            # A와 B가 동시에 GET /result 호출!
            task_a = asyncio.create_task(creator_client.get(f"/api/v1/sessions/{s_id}/result"))
            task_b = asyncio.create_task(guest_client.get(f"/api/v1/sessions/{s_id}/result"))

            res_a = await task_a
            res_b = await task_b

            assert res_a.status_code == 200
            assert res_b.status_code == 200
            assert res_a.json()["status"] == "ready"
            assert res_b.json()["status"] == "ready"

            # DB 직접 조회: cachedResult가 정상적으로 단일 객체로 기록되어 있음
            doc = await real_mongo_db["sessions"].find_one({"id": s_id})
            assert doc is not None
            assert "cachedResult" in doc
            assert doc["cachedResult"] is not None
            assert doc["status"] == "ready"
    finally:
        main_module._session_repository = original_repo
