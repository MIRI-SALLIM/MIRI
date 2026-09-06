# 오래된 자동저장 응답이 최신 hydrate revision을 되돌림

- 작성일: 2026-09-06
- 관련: 이슈 #101, PR 미생성, 커밋 없음

## 무엇이 잘못됐나

자동저장 PATCH가 진행 중인 동안 더 최신 서버 문서를 hydrate하면, 먼저 시작한 PATCH의 늦은 성공 응답이 `baseRevision`과 기준 문서를 낮은 revision으로 되돌릴 수 있었다. inflight PATCH와 서버 재조회 순서를 재현하는 스토어 회귀 테스트에서 발견했다.

## 원인

- **코드적 원인**: PATCH 성공 처리기가 응답 revision을 현재 스토어 revision과 비교하지 않고 무조건 `baseline`과 `baseRevision`에 적용했다. 창 포커스 재조회나 충돌 복구가 먼저 최신 문서를 반영한 경우에도 응답 순서만 믿는 구조였다.

## 해결

현재 `baseRevision`이 PATCH 응답보다 높으면 해당 응답을 stale로 무시하고 최신 hydrate 상태를 유지한다. 요청 상태만 `idle`로 정리하며, 더 최신 문서에 남아 있는 trailing 변경은 기존 큐가 계속 처리한다.

## 재발 방지

`does not let an older patch response overwrite a newer hydrated revision` 회귀 테스트를 추가해 revision 3 hydrate 뒤 revision 2 응답이 revision 3 상태를 덮지 못하게 고정했다. CAS 문서를 다루는 비동기 상태는 요청 시작 순서가 아니라 응답의 revision 순서를 검증한다.
