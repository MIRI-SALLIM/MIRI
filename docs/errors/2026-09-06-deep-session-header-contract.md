# 딥 세션 멱등 헤더의 OpenAPI 전달 위치 불일치

- 작성일: 2026-09-06
- 관련: 이슈 #88, PR 미정, 커밋 미정

## 무엇이 잘못됐나

딥 세션 생성·참여 API의 `Idempotency-Key`를 openapi-fetch 호출의 최상위 `headers`에 넣어 구현했다. `typecheck`가 딥 OpenAPI 계약의 필수 `params.header`가 누락됐다고 실패하면서 발견했다.

## 원인

- **설계적 원인**: 라이트 호출 관용구를 딥 v3 생성·참여 계약에 그대로 일반화했다. 생성된 타입은 딥 v3의 필수 헤더를 `params.header`로 표현하고 있었고, 최상위 옵션과 동일하지 않았다.

## 해결

`entities/deep-session`의 생성·참여 요청을 `params: { header: { "Idempotency-Key": key }, ... }` 형태로 바꿨다. 실제 `Request` 헤더와 빈 JSON 본문을 API 테스트에서 확인했으며, 별도의 API 클라이언트 추상화나 타입 우회는 추가하지 않았다.

## 재발 방지

딥 세션 API 테스트가 메서드·경로·멱등 헤더·본문을 검사하고, `typecheck`와 `api:check`가 생성된 계약의 필수 파라미터를 계속 검증한다. 앞으로 필수 헤더가 있는 새 경로는 기존 호출 예제를 복사하기 전에 생성된 operation 타입의 `parameters.header` 위치부터 확인한다.
