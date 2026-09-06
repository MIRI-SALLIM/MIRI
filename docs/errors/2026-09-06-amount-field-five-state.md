# AmountField가 편집 중 상태와 금액 답변 상태를 융합함

- 작성일: 2026-09-06
- 관련: [이슈 #85](https://github.com/MIRI-SALLIM/MIRI/issues/85), PR/커밋 없음

## 무엇이 잘못됐나

`AmountField`가 빈 입력을 곧바로 `unknown`으로 저장하고, `known`을 선택했지만 금액이 없을 때 `0`을 주입했다. 그 결과 알려진 금액을 전체 선택해 바꾸는 순간의 편집 상태가 사용자의 금액 답변으로 저장될 수 있었고, 명시적으로 아는 0원과 아직 입력하지 않은 상태가 구분되지 않았다. 기본 입력 ID도 상수여서 같은 화면의 여러 금액 필드가 중복 ID를 만들었으며, `aria-label`과 sr-only label이 입력에 중복 이름을 제공했다.

## 원인

- **설계적 원인**: 원시 입력 문자열과 서버에 보낼 5상태 답변을 하나의 `AmountValue`로 즉시 표현했다. 편집 중 빈 문자열은 답변 상태가 아니며, `known`에는 숫자를 입력한 뒤에만 도달해야 한다는 경계가 없었다.
- **코드적 원인**: 고정 `amount-field` ID, `value.value ?? 0` 보정, 빈 입력에서의 `unknown` 콜백, 입력의 중복 `aria-label`이 `AmountField.tsx`에 함께 있었다.

## 해결

`AmountField` 내부에 원시 문자열·로컬 선택 상태(상태와 precision)를 두고, 현재 controlled props와 연결된 초안만 표시하도록 분리했다. 빈 입력과 숫자 범위를 벗어난 입력은 서버 콜백을 호출하지 않으며, 안전한 정수를 입력한 순간에만 `known`을 내보낸다(0도 명시적 입력일 때만 내보냄). `exact`/`estimate` precision 선택을 추가하고 `unknown`/`withheld`는 null 금액으로 유지했으며, `useId` 기반 fallback ID와 sr-only label 하나를 사용하도록 접근성 이름을 정리했다.

## 재발 방지

테스트에서 알려진 금액을 지우는 동안 `unknown`이 선택·저장되지 않는지, 숫자 전 `known`이 저장되지 않는지, 명시적 0·추정 precision·비공개 상태, 여러 필드의 고유 ID와 단일 입력 이름을 고정했다. 수정 전 focused 테스트는 기존 구현에서 5건이 의도대로 실패했으며(RED), 수정 후 7/7 통과했다(GREEN). 전체 51개 파일 324개 테스트와 lint/typecheck/build/API 타입 불변성 검사를 다시 실행했다.
