# 기준회의 동의 체크박스 currentTarget 수명

- 작성일: 2026-09-07
- 관련: 이슈 #108, PR 없음, 커밋 없음

## 무엇이 잘못됐나

기준회의에서 AI 처리 체크박스를 변경할 때 React의 `currentTarget`을 함수형 상태 갱신 안에서 읽어 이벤트가 이미 정리된 뒤 접근하는 문제가 있었다. 테스트에서 공유 동의를 켠 다음 AI 동의를 선택하면 `TypeError`가 발생해 완료 화면까지 진행하지 못하는 것으로 발견했다.

## 원인

- **코드적 원인**: `apps/frontend/src/pages/deep-meeting/ui/DeepMeetingPage.tsx:191`의 체크박스 `onChange`가 `event.currentTarget.checked`를 `setConsent` 함수형 갱신 내부에서 읽었다. 이벤트의 `currentTarget`은 핸들러 실행 중에만 안전하므로 갱신 함수가 실행되는 시점에는 이미 `null`이 될 수 있었다.

## 해결

이벤트 핸들러가 실행되는 동안 `const checked = event.currentTarget.checked`로 원시 불리언을 먼저 추출하고, 함수형 갱신에는 그 값만 전달하도록 변경했다. 함수형 갱신은 이전 공유 상태를 보존하면서 AI 선택만 갱신해야 하므로 유지했다.

## 재발 방지

기준회의 화면 테스트에서 공유 동의와 AI 동의의 종속 상태를 실제 사용자 이벤트로 확인하고, AI를 켠 뒤 공유를 해제할 때 AI도 해제되는지 검증한다. React 이벤트 값을 비동기 콜백이나 함수형 상태 갱신에서 사용할 때는 핸들러 안에서 필요한 원시 값을 먼저 캡처한다.
