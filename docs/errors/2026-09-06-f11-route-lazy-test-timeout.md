# Lazy 라우트 테스트가 콜드 변환 중 fallback에서 실패한 문제

- 작성일: 2026-09-06
- 관련: 이슈 #94, PR 미정, 커밋 미정

## 무엇이 잘못됐나

`AppRoutes.test.tsx`의 라우트 표에 F11 경로가 빠져 있었고, 기존 경로 테스트는 React.lazy fallback을 기본 Testing Library 1초만 기다렸다. F11 계획 화면의 동적 모듈 그래프가 추가된 뒤 콜드 변환 시간이 1초를 넘으면 `/light/1`, `/waiting/session-a`, `/deep/plan/session-a` 중 실패 위치가 실행마다 달라지고 fallback에서 heading을 찾지 못했다.

F11 라우트를 추가한 뒤 기존 명령을 재현했고, `DeepPlanPage`를 placeholder로 되돌린 진단에서도 `/light/1`이 3회 연속 같은 제한에 걸리는 것을 확인했다. 따라서 프로덕션 라우팅 오류가 아니라 비결정적인 테스트 대기 제한이 원인이었다.

## 원인

- **설계적 원인**: 라우트 테스트가 lazy boundary의 초기 모듈 변환을 1초 이내에 끝난다고 가정했다. 테스트는 fallback을 사용자에게 보여 주는 시간을 검증하는 것이 아니라 최종 라우트 heading이 나타나는지만 검증하므로 이 가정이 불필요했다.

## 해결

- `routeCases`에 `/deep/plan/session-a`와 `함께 계산할 공동 계획`을 추가해 새 목적지를 같은 표에서 검증한다.
- 해당 테스트의 `findByRole`에 10초의 테스트 전용 `routeLoadTimeout`을 지정했다. 이는 앱 요청 timeout이나 lazy 로딩 자체를 늘린 것이 아니라, 콜드 개발/CI에서 fallback이 끝날 때까지 기다리는 검증 시간만 늘린 것이다.
- 계획 페이지의 loading/error 상태에도 stable한 주 제목을 렌더해 API가 없는 순수 라우트 테스트가 네트워크 성공을 요구하지 않도록 했다.

## 재발 방지

콜드 캐시 조건에서 라우트 테스트를 연속 3회 실행해 모두 10/10 통과하는지 확인했다. 새 lazy 목적지는 반드시 `routeCases`에 추가하고, 테스트는 일시적인 fallback이 아니라 최종 목적지의 안정적인 heading을 기다린다.
