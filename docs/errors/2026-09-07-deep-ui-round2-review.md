# Deep UI 검토 라운드 2 회귀

- 작성일: 2026-09-07
- 관련: `.agent/TASK-2.md` (커밋 없음)

## 무엇이 잘못됐나

딥 질문 척도 원의 실제 탭 영역이 시각 크기와 함께 36~40px로 줄었고, 선택 전에는 각 값의 의미를 확인할 수 없었다. 또한 `focus-visible:outline-purple-strong` 유틸리티는 전역 unlayered `:focus-visible` 규칙에 가려져 런타임 스타일과 코드 선언이 달랐으며, 선택 값 범위를 벗어나면 척도 문구에 `undefined`가 노출될 수 있었다.

## 원인

- **설계적 원인**: 시각적 원 크기를 그대로 버튼의 탭 영역으로 사용했고, 도메인 전용 이름을 shared UI에 부여해 재사용 경계를 흐렸다.
- **코드적 원인**: `@layer utilities`의 outline 유틸리티와 unlayered 전역 포커스 규칙의 우선순위를 확인하지 않았고, `scaleLabels[value - 1]`를 범위 확인 없이 렌더링했다. CSS 편집 과정에서 원본 EOL도 보존하지 못했다.

## 해결

무효한 outline 유틸리티를 제거하고 유효한 purple focus shadow와 기존 전역 초록 외곽선을 유지했다. shared 컴포넌트는 `NavigationLink`/`PageLoading`으로 중립화했으며, 척도 버튼은 44px `size-11` 히트 영역 안에 기존 시각 크기의 원을 배치하고 `title`을 항상 제공하도록 했다. 선택 문구에는 범위 가드와 점수 fallback을 추가하고, `globals.css`는 원본 EOL을 복원해 토큰 추가 한 줄만 남겼다.

## 재발 방지

정적 검색으로 무효 클래스와 이전 shared 경로가 남지 않았는지 확인하고, `aria-label`·`aria-pressed`·`role="group"` 계약은 변경하지 않았다. CSS 우선순위가 의심될 때는 생성 CSS에서 실제 selector 순서를 확인하며, 배열 인덱스 렌더링은 fallback을 먼저 마련하고, 디자인 토큰 파일은 원본 줄바꿈을 보존한다.
