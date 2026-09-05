# 딥모드 조정안 구현 계획

> **For agentic workers:** Follow test-driven-development. User has authorized implementation in the existing isolated worktree; preserve pre-existing changes. No commit, push, deployment or paid AI call in this task.

**Goal:** 기존 딥모드 결과를 조정안 비교와 실제 기준표로 연결한다.

**Architecture:** FastAPI v3 meeting router에 읽기 전용 preview/standards를 추가한다. 기존 compare_budgets, 공개/동의 검사, guide, agreement 생명주기를 재사용한다. 불변 리포트와 AI 입력은 변경하지 않는다.

**Tech stack:** Python, FastAPI, Pydantic, pytest, existing Mongo fake integration fixture.

## Tasks

1. `tests/integration/test_meeting_planning_flow.py`에 공백 40→20→0, 비공유/미정/범위/버전/권한 경계, 상한 철회, 질문 반영, 기준표 생명주기와 읽기 전용 테스트를 추가한다. 실행하여 신규 API/가이드가 없어 실패하는지 확인한다.
2. `deep/meeting/planning_context.py`, `guide.py`에서 기준 참조와 개인비/저축 기준, 합의 인식 질문을 추가한다. 재무 공유 없이 노출하지 않고 리포트는 유지한다.
3. `deep/meeting/proposals.py`, `router.py`에서 미리보기 계약/계산/동의 검사/다음 행동을 연결한다. 클라이언트 원안을 신뢰하지 않으며 변경 예산을 합의로 자동 전환하지 않는다.
4. `deep/meeting/standards.py`, `router.py`에서 기존 기준표 상태 그룹과 재검토일, 전체 질문을 반환한다. 금액 공백은 원안과 운영 상태를 별도로 유지한다.
5. 신규 및 기존 meeting/v3 회귀 pytest, 관련 lint/type check를 실행한다. 실패 원인을 수정하고 diff를 검토한다.
6. OpenAPI/프론트 타입을 기존 생성기로 갱신하고 `docs/deep-meeting-api.md`, 프론트 인계 가이드에 연결 순서를 기록한다. 실제 프론트 연결과 운영 배포 여부는 별도로 명시한다.

## 완료 기록

1–6 구현/검증 완료. 신규 18개 포함 관련 236개 테스트, 변경 모듈 Ruff/mypy, 프론트 tsc, OpenAPI 결정성/전달본 일치 확인.
읽기 전용 리뷰에서 원안 미정의 반복 입력 안내를 발견해 `revise_inputs`로 보완했다.
현재 결과와 미배포 경계는 [인계](../../handoffs/2026-09-06-deep-proposal-flow.md)를 따른다.
