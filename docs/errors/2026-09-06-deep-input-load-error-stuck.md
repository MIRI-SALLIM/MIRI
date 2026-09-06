# 초기 재무 입력 조회 실패가 로딩 화면에 고정됨

- 작성일: 2026-09-06
- 관련: 이슈 #101, PR 미생성, 커밋 없음

## 무엇이 잘못됐나

`/deep/input/:sessionId`의 초기 `GET me/input`이 실패해도 사용자에게 오류와 재시도 버튼을 보여 주지 않고 로딩 화면에 계속 머물렀다. `DeepInputPage.test.tsx`에서 조회 API를 거부하는 회귀 테스트를 추가해 발견했다.

## 원인

- **코드적 원인**: `DeepInputPage`가 `inputQuery.isError`보다 `!isHydrated`를 먼저 검사했다. 첫 조회 실패 시 스토어가 hydrate되지 않는 것이 정상인데, 이 조건이 오류 분기보다 먼저 참이 되어 오류 UI에 도달할 수 없었다.

## 해결

조회 오류 분기를 로딩 분기보다 앞에 두어 서버 오류 상태와 재시도 동작을 즉시 노출한다. 로딩 조건은 오류가 아닌 요청이 진행 중이거나 아직 hydrate되지 않은 경우에만 적용한다.

## 재발 방지

조회 실패를 재현하는 `shows the load error instead of staying on the loading screen` 테스트를 추가하고 focused 테스트를 통과시켰다. 비동기 화면에서는 `pending`·`error`·`hydrated` 상태의 우선순위를 함께 검토한다.
