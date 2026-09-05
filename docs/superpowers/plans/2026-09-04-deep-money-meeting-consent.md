# 우리 돈의 기준회의 B단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Checkboxes record actual progress.

**Goal:** 추가 질문·본인 답변·명시적 동의를 저장하고 양측 동의가 유효한 준비 컨텍스트를 조회한다. 유료 생성은 하지 않는다.

**Architecture:** 기존 `deep_sessions` 문서의 `meeting` 필드에 현재 round/plan/report에 묶인 A/B 답변을 저장한다.
기존 DeepRepository의 멤버 검증·조건부 갱신(CAS)·만료 및 심사용 방 검증을 재사용한다.
새 컬렉션 없이 기존 세션 TTL을 따른다. 준비 컨텍스트는 매번 읽어 구성하고 저장/외부 전송하지 않는다.

**Tech Stack:** 기존 FastAPI/Pydantic/PyMongo, pytest. 새 의존성 없음.

**Spec:** [승인된 제품 설계](../specs/2026-09-04-deep-money-meeting-design.md), B단계 상세 계약 포함.

## Global Constraints

- 모르는 값은 0원이 아니다. 제안·본인 상한·지급 능력·합의는 별개다.
- 금액은 bool/float/string을 변환하지 않는 0~2**53-1 정수다.
- 기존 로그인/Origin/버전/Deep 기능 플래그를 우회하지 않는다.
- 원격 푸시·배포·비밀값 설정·유료 호출은 하지 않는다. 기존 A단계 미커밋 변경을 보존한다.
- 사용자 요청에 따라 순차 인라인 실행한다. 별도 구현 에이전트로 작업을 분산하지 않는다.

## Task 1: 본인 답변·동의 계약과 저장

Files: 새 `apps/backend/deep/meeting/contracts.py`, `questions.py`, `storage.py`.
Test: 새 `apps/backend/tests/integration/test_meeting.py`.

Interfaces:
- `MeetingAnswers(contributionMeaning, adjustableMonthlyWon=None)`.
- `SaveMeetingAnswers(expectedRound, planVersion, expectedRevision, answers)`.
- `SaveMeetingConsent(expectedRound, planVersion, expectedRevision, consentVersion, shareWithPartner, allowAiProcessing)`.
- `MeetingStorage(repo).save_answers(session_id, user_id, body, now) -> dict`, `save_consent(...) -> dict`,
  `revoke_consent(session_id, user_id, now) -> dict`, `get_own(...) -> dict`.

- [x] 기존 ready(client)로 실제 라우트→서비스→저장소→계산 흐름을 구성하는 테스트를 먼저 작성한다.
  외부 Mongo는 기존 MemoryDatabase 대역만 사용하며 권한 검사·계산·저장 코드는 실제 구현을 실행한다.

```python
mine = client.get(path + '/meeting/me').json()
assert mine['revision'] == 0 and mine['answers'] is None
assert client.get(path + '/meeting/context').json() == {'status': 'waiting'}
```

- [x] 테스트에서 새 경로 404 실패를 확인한다.
- [x] 본인 revision CAS, 답변 변경 시 본인 동의 삭제, 명시적 철회 시 revision 증가를 구현한다.
  별도 동의는 같은 round/plan/report의 본인 현재 답변에만 적용한다.

```python
if body.expectedRevision != mine['revision']:
    raise DeepError('REVISION_CONFLICT')
mine.update(revision=mine['revision'] + 1, answers=body.answers.model_dump(), consent=None)
```

## Task 2: 준비 컨텍스트 및 API

Files: 새 `deep/meeting/service.py`, `router.py`; 기존 `deep/v3_router.py`에 자식 라우터 연결.
Interfaces: `meeting_context(service: DeepService, session_id: str, user_id: str) -> dict`.
Routes: `/api/v1/deep/v3/sessions/{session_id}/meeting` 아래 GET/PATCH `/me`, POST/DELETE `/me/consent`, GET `/context`.

- [x] 한쪽 미입력/거부, 타인·미공개·만료, stale revision/round/plan, 잘못된 상한, 조회 중 철회를 테스트한다.
- [x] 양측 답변·동의 전 context는 `{status: waiting}`만 반환하고 파트너 답변·진행률을 보내지 않는다.
  유효하면 A단계 brief + 구조화 답변 A/B + `providerStatus: not_connected`를 반환한다.

```python
before = await repo.get_for_member(session_id, user_id, now)
# Read report/agreements only after both current consents pass.
after = await repo.get_for_member(session_id, user_id, fresh_now)
if before['version'] != after['version']:
    raise DeepError('REVISION_CONFLICT')
```

- [x] ready 응답은 서버의 현재 상태로 생성하며 브라우저가 제출한 권한 bool로 A단계 함수를 호출하지 않는다.
  현재 API는 AI 생성 요청이 아니다. 비용·잠금·출력 저장·실제 해설 품질은 C단계 게이트다.

## Task 3: 철회·재작성·계약 인계

Files: 기존 `deep/repository.py`의 withdraw/request_round에 `meeting=None` 추가.
새 `docs/deep-meeting-api.md`, 인계 Markdown, PROJECT_CONTEXT 갱신.
기존 OpenAPI 양쪽 사본과 프론트 생성 타입은 저장소 생성 명령으로 재생성한다.

- [x] 새 round에서 답변/동의가 초기화되고 withdraw가 추가 답변을 지우는 테스트를 먼저 작성한다.
- [x] 기존 세션 종료 및 재작성 갱신에 필드 초기화를 추가한다. 심사용 방 reset은 기존 논리적 접근 차단·TTL을 유지한다.
- [x] 테스트를 통과시킨 후 API 호출 순서·질문 문구·동의 취소·미구현 상태를 문서화한다.

## Task 4: 검증과 리뷰

- [x] `apps/backend`에서 `.venv/Scripts/python.exe scripts/test_local.py tests/integration/test_meeting.py tests/unit/test_meeting_storage.py tests/unit/test_meeting_brief.py tests/unit/test_meeting_comparison.py tests/unit/test_meeting_explanation.py tests/integration/test_deep_v3.py tests/unit/test_deep_v3_repository.py tests/test_deep_openapi.py -q`.
- [x] Ruff `deep/meeting deep/repository.py deep/v3_router.py tests/integration/test_meeting.py tests/unit/test_meeting_storage.py` 및 mypy `deep`.
- [x] API 스냅샷 일치 검사, 생성 타입 재생성, diff 공백/범위 검사와 읽기 전용 코드 리뷰.
- [x] 실제 테스트 결과와 실Mongo/실AI/배포 미검증 경계를 인계에 기록한다.

Self-review: B는 동의/질문 저장 및 준비 조회까지다. 유료 생성·원문 해설 저장·분담안 자동 합의는 포함하지 않는다.
기존 본문 DTO·Light/v2 API를 변경하지 않고 새 v3 하위 경로만 추가한다.
