# 딥모드 하단 완료·해설 연결 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. 현재 격리 브랜치에서 순차 실행한다.

**Goal:** 프론트 디자인 변경 없이 답변·동의·해설을 하나의 명시적 완료 행동으로 연결한다.
**Architecture:** 기존 저장소 CAS와 AI 캐시/잠금을 재사용한다. 완료 API만 추가하고 기존 API는 보존한다.
**Tech Stack:** FastAPI/Pydantic/Mongo/pytest, 기존 의존성만 사용.
**Spec:** `docs/superpowers/specs/2026-09-05-deep-service-flow-design.md`

## Global Constraints

- 양측 최신 동의 전에 공유/전송하지 않는다. GET·로그인·페이지 진입으로 생성하지 않는다.
- 실제 유료 호출·운영 설정·커밋·푸시·develop 병합은 별도 요청 전 수행하지 않는다.
- 이전 로컬 Deep UI/Kakao 변경을 보존하며 이번에 화면을 재구축하지 않는다.
- 외부 전송 범위·동의 v2를 유지한다. 확장된 AI 근거는 다음 독립 단위다.

## Task 1: 답변·동의 원자 저장과 완료 연결

파일: `apps/backend/deep/meeting/{contracts,storage,completion,router,generation}.py`,
`apps/backend/tests/integration/test_meeting_completion.py`.

인터페이스: `CompleteMeeting(SaveMeetingAnswers, MeetingConsent)`;
`MeetingCompletion {own: OwnMeeting, explanation: MeetingExplanation}`;
`MeetingStorage.complete(session_id, user_id, body, now)`; `POST /meeting/complete`.

- [x] TestClient로 A 완료→waiting, B 완료→AI, 양측 GET 동일/호출 1회 실패 테스트.
  ```python
  first = client.post(path + '/meeting/complete', headers=headers(), json=body)
  assert first.status_code == 200
  assert first.json()['own']['revision'] == 1
  assert first.json()['explanation'] == {'status': 'waiting'}
  ```
- [x] 틀린 상한/동의 미선택/동시 완료/409/철회/저장 직후 수정의 실패 테스트 실행.
- [x] `complete`는 기존 offered/limit 검증을 공유하고 단일 CAS에서 answers+consent+revision(+1)를 저장한다.
  ```python
  mine.update(revision=mine['revision'] + 1, answers=body.answers.model_dump(mode='json'),
              consent=dict(consentVersion=body.consentVersion, shareWithPartner=body.shareWithPartner,
                           allowAiProcessing=body.allowAiProcessing, recordedAt=now))
  state.pop('generation', None)
  ```
- [x] 완료 응답에는 본인 저장 상태와 해설을 반환한다. AI 선택이면 저장 응답 revision을 생성 시작 시 검증한다.
  모의 공급자를 사용하고 기존 generation tests를 회귀 실행한다.

## Task 2: 누적 호출 예약

파일: `apps/backend/deep/meeting/{provider,ledger,generation}.py`, `tests/unit/test_meeting_budget.py`.

인터페이스: `AiSettings.total_micro_usd: int | None`, `prior_micro_usd: int`;
환경변수 `DEEP_MEETING_AI_TOTAL_MICRO_USD`, `DEEP_MEETING_AI_PRIOR_MICRO_USD`.

- [x] 하루 한도 이내여도 누적 상한 소진 후 다음 날 예약이 거절되는 실패 테스트.
  ```python
  settings = AiSettings(total_micro_usd=RESERVATION_MICRO_USD * 3,
                        prior_micro_usd=RESERVATION_MICRO_USD * 2)
  assert await reserve_budget(collection, settings, now)
  assert await reserve_budget(collection, settings, now + timedelta(days=1)) is None
  ```
- [x] 고정 ID `evaluation-total-v1`, TTL 없는 원장을 CAS 갱신한다. 일일 예약 뒤 누적 예약 실패 시 환급 없이 차단.
  저장된 이전 차감액/상한을 조용히 낮추거나 설정 제거로 원장을 우회하지 않는다.
- [x] 새 완료 경로는 누적 설정 전 유료 생성을 차단한다. 기존 수동 경로도 누적 설정 시 같은 원장을 사용한다.
- [x] 과다 사용량 감지 시 해당 일과 누적 원장을 모두 중단한다. 경합·설정 오류·설정 객체 재생성을 모의 테스트한다.

## Task 3: 답변별 질문·전달 계약

파일: `deep/meeting/{questions,templates,provider}.py`, `tests/unit/test_meeting_ceiling.py`,
`docs/deep-meeting-api.md`, `docs/deep-meeting-operations.md`, 생성 OpenAPI/프론트 타입.

- [x] 양측 조정 상한이 이미 주어졌을 때 같은 상한을 재질문하지 않는 분기 테스트.
  ```python
  answers = {r: {'contributionMeaning': 'initialProposal', 'adjustableMonthlyWon': 800000} for r in ('A', 'B')}
  gap = template_cards(build_brief(ready_result(), granted()), answers)[0]
  assert '줄일' in gap.question
  assert '확인할까요' not in gap.question
  ```
- [x] 질문 helpText로 제안/최대 금액/미정/합의 차이를 설명. 모델에도 서버가 정한 질문 방향 전달.
- [x] 문서에 하단 선택·완료 POST·GET 대기·원자 저장·오류 복구와 이번 외부 전송 범위를 명시.
- [x] 관련 pytest, Ruff, mypy, OpenAPI 타입 갱신, frontend typecheck; 변경 diff 리뷰.

## 진행 기록

- 현재 브랜치 `codex/deep-money-meeting`, 기존 linked worktree 사용.
- 기존 테스트 통과 기록은 직전 #51 handoff 참조. 이번 검증은 새 동작에 대해 다시 실행한다.
- 작업 간 공용 파일 provider/generation은 순차 수정한다. API 저장→생성 경계부터 검증한다.
- 2026-09-05 이번 구현 단위 완료: 백엔드 전체 591 passed / 23 skipped, Ruff/mypy/프론트 타입 검사 통과.
  별도 읽기 전용 리뷰에서 추가 P1/P2 지적 없음. 실제 외부 호출·실Mongo·운영 반영은 수행하지 않았다.
- 보완 결정: 같은 최신 답변/동의의 재완료는 no-op으로 기록 시각과 생성 캐시를 유지한다.
  오래된 revision은 여전히 충돌로 처리해 철회나 새 답변을 덮어쓰지 않는다.
