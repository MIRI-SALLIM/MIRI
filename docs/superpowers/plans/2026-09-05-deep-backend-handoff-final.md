# 프론트 전달 전 딥모드 백엔드 완결

> 실행: superpowers:executing-plans. 기존 격리 작업 폴더에서 순차 구현·검증한다.

**Goal:** 공동 리포트→다음 질문→확장 해설→기준표를 프론트가 조합 가능한 API로 완결한다.
**Architecture:** 기존 계산/합의/동시성 보호를 재사용한다. 새 guide GET과 확장 동의 v3를 추가하고 v2는 월 분담으로 제한한다.
**Tech Stack:** 기존 FastAPI/Pydantic/pytest/Mongo. 새 의존성 없음.
**Spec:** `docs/superpowers/specs/2026-09-05-deep-service-flow-design.md`의 남은 2~4단계.

## 전역 제약

- Light/기존 Deep 저장·공유·합의 계약 유지. 프론트 디자인 수정 없음.
- 공개된 리포트의 수치와 고정 코드만 AI로 투영. 원장/메모/이름/계정/합의 원문은 전송하지 않는다.
- 동의 v2는 기존 월 분담만, v3는 주거 날짜별 공백·월 현금흐름·목표·조건 존재까지 허용.
  버전 혼합은 waiting이며 상대 선택을 공개하지 않는다. 실제 값/목적 확대 때 새 동의를 받는다.
- 확장 AI 실제 송신은 `DEEP_MEETING_AI_EXTENDED_ENABLED=true`와 누적 예산을 모두 요구한다.
  기본은 비활성. 운영 안내/계약 검토·실모델 품질 검증·실제 배포는 완료라고 표시하지 않는다.
- 합의는 기존 API의 양측 같은 버전 확인만 유효. 제안/보류/미정은 별개다.
- 커밋·푸시·유료 호출·운영 변수 변경·병합은 하지 않는다.

## 1. 대화 가이드와 기준표 연결

파일: `deep/meeting/guide.py`, `guide_contracts.py`, `router.py`, `tests/integration/test_meeting_guide.py`.

- [x] GET `/meeting/guide`: ready 공개 리포트의 전체 issues와 가치관 비교에서 가이드 생성.
  기존 우선순위와 상위 세 개 ID, 나머지 이슈, 결정할 topic/필드, 현재 agreements를 함께 제공.
  입력 금액을 바꾸려면 새 라운드라는 경계를 안내한다. 기초 입력과 합의는 GET으로 변경하지 않는다.
- [x] 부분 공유를 준수한다. AI 미동의도 guide는 사용하고, 재무 비공개 시 재무 유래 가이드는 없다.
- [x] 제안→양측 확인→수정 시 확인 해제→보류→GET 기준표를 통합 테스트한다.
  ```python
  guide = client.get(path + '/meeting/guide').json()
  assert guide['status'] == 'ready'
  assert guide['decisions'] == []
  assert guide['priorityIds'] == [row['id'] for row in guide['topics'][:3]]
  ```

## 2. 최소 근거 확장·동의·템플릿

파일: `deep/meeting/{models,plan_brief,contracts,questions,storage,service,templates,provider,generation,explanation}.py`.

- [x] `build_plan_brief(result, permissions, plan)`은 월 분담 외에 날짜별 첫 공백(누적 합산 금지), 월 여유/적자,
  목표 적립 부족, 확인할 조건 존재를 투영한다. 미정은 0원이 아니며 잘못된 산술/금액은 거부한다.
  ```python
  brief = build_plan_brief(result, granted(), plan)
  assert brief.scope == 'sharedPlan'
  assert brief.issues[0].id == 'housing_gap'
  assert 'SECRET' not in brief.model_dump_json()
  ```
- [x] `money-meeting-consent-v3` 안내와 허용 범위를 추가. `/me`는 최신 안내를 제공하되 v2 기록/요청 호환 유지.
  양측 v3일 때만 확장 투영. 새 완료·기존 생성 모두 확장 활성화 플래그/누적 설정이 없으면 템플릿.
- [x] 확장 템플릿·프롬프트는 실제 우선순위에 맞는 쟁점으로 시작한다. 숫자는 근거 필드로만 표시한다.
  누락/틀린 근거/낮은 우선순위만 설명하는 응답은 거부한다. 공급자는 모의 테스트한다.

## 3. 전달 문서·최종 검증

- [x] 사례별 guide/해설/기준표 통합 테스트와 기존 backend 전체 suite.
- [x] Ruff/mypy, OpenAPI 내보내기·프론트 타입 생성/typecheck.
- [x] `apps/backend/frontend-handoff`의 연결 가이드·OpenAPI와 최신 인계 갱신.
- [x] 별도 읽기 전용 코드 리뷰. 핵심 실패가 있으면 수정 후 관련 회귀 재검증.

## 진행 기록

현재 구현 기준 HEAD 537e99c와 이전 미커밋 완료 API 작업을 함께 보존한다. 기존 UI/Kakao 변경은 수정하지 않는다.
