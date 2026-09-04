# 미리살림 프론트엔드 F8 재개 handoff

작성일: 2026-08-18

이 문서는 다른 로컬 PC의 Orca에서 새 Codex CLI 세션으로 프론트엔드 F8 작업을 이어가기 위한 기준 문서다. Codex CLI의 로컬 대화 기록이나 `.superpowers/sdd` 임시 ledger가 없어도 아래 저장소 상태와 문서만으로 재개할 수 있어야 한다.

## 1. 현재 기준 상태

- 저장소: `hotpringles/MIRI`
- 통합 브랜치: `develop`
- F7 병합 기준 커밋: `b77d667` (`Merge pull request #21 from hotpringles/feature/20-share-result-card`)
- F7 PR: `#21 feat(web): add privacy-safe light result sharing` — `develop` 병합 완료
- 현재 단계: `Frontend: F7/8 completed, current F8`
- F8 이슈: `#22 [Frontend] F8: 릴리스 준비 및 배포 게이트`
- F8 브랜치: `chore/22-release-readiness`
- F8 구현은 최신 `develop`에서 분기한 위 브랜치에서 시작한다.

## 2. 반드시 읽을 문서

다음 순서로 끝까지 읽는다.

1. `docs/PROJECT_CONTEXT.md`
2. 이 handoff
3. `docs/superpowers/specs/2026-08-05-mirisallim-light-vertical-slice-design.md`
4. `docs/superpowers/plans/2026-08-18-mirisallim-light-release-readiness.md`
5. `docs/superpowers/plans/2026-08-06-mirisallim-light-coordination.md`

제품·디자인 판단은 spec이 우선이다. 계획과 handoff는 구현 컨텍스트이며, 실제 코드나 테스트와 다르면 현재 동작을 먼저 검증한다.

## 3. 완료된 프론트엔드 범위

F1~F7은 `develop`에 병합됐다.

- F1: Vite/FSD/디자인 시스템 기반
- F2: OpenAPI 타입과 API 클라이언트
- F3: 랜딩과 라이트 세션 시작
- F4: 가변 질문 입력·자동 저장·제출·완료
- F5: 초대 참여·대기·폴링·알림
- F6: 양측 제출 후 동시공개 결과
- F7: 여섯 필드 제한 공유 모델, 9:16·1:1 카드, 정확한 PNG 저장, 직접 접근 가능한 공유 페이지

F7 공유 모델의 공개 키는 정확히 다음 여섯 개다.

```text
leftType
rightType
tagline
mutualHitCount
questionCount
ratio
```

금액, 소득, 부채, 저축액, 원본 답변·예측 배열을 공유 모델, 카드 DOM, 파일명 또는 web storage에 추가하지 않는다. 결과 API가 `waiting`이면 공유 모델을 만들지 않는다.

## 4. F7 최종 검증 증거

PR #21 생성 전 supervisor 재검증과 Sol high 전체 브랜치 리뷰가 완료됐다.

- `api:check`: 통과
- lint: 통과
- typecheck: 통과
- Vitest 단일 워커: 26 files / 83 tests 통과
- production build: 통과
- `git diff --check`: 통과
- 최종 전체 브랜치 리뷰: `gpt-5.6-sol high` — `CLEAN`

병렬 Vitest에서 기존 lazy-route 타이밍 실패가 간헐적으로 있었으나 직렬 실행과 이후 병렬 재실행에서 전체 통과했다. F7의 실제 브라우저 PNG 다운로드와 시각 회귀는 F8 Playwright 범위에 남아 있다.

## 5. F8 실행 정책

`docs/superpowers/plans/2026-08-18-mirisallim-light-release-readiness.md`의 Task 1~6을 순서대로 실행한다.

- 각 Task 구현자: `gpt-5.6-luna`, reasoning effort `xhigh`
- 각 Task 리뷰어·재리뷰어·최종 전체 리뷰어: `gpt-5.6-sol`, reasoning effort `high`
- 현재 주 에이전트는 supervisor 역할만 맡고 프로덕션 구현 코드를 직접 작성하지 않는다.
- Task는 순차 실행한다. 앞 Task가 Sol 리뷰에서 `CLEAN`이거나 fix loop를 통과하기 전에는 다음 Task를 시작하지 않는다.
- 기능 또는 버그 수정은 TDD로 진행한다.
- 완료 주장은 새 검증 결과가 있을 때만 한다.

새 PC의 `.superpowers/sdd`에는 이전 로컬 ledger가 없다. F8 시작 시 계획 경로를 기준으로 새 ledger를 초기화하고, 각 Task brief/report/review package를 다시 만든다.

## 6. F8 작업 순서

1. Playwright 실행 기반과 FastAPI/Vite 서버 수명주기
2. 독립 BrowserContext A/B 전체 흐름과 waiting 응답 프라이버시
3. axe·키보드 접근성과 390/899/900/1280px 반응형 자동화
4. MongoDB service를 포함한 frontend GitHub Actions
5. 확인된 production backend origin을 사용하는 Vercel rewrite와 보안 헤더
6. 운영 문서, preview/production 배포, production smoke

Task별 파일, 인터페이스, RED/GREEN 명령과 커밋 메시지는 F8 계획을 그대로 따른다.

## 7. 외부 게이트와 중지 조건

- production backend HTTPS origin은 아직 이 handoff에서 확정하지 않았다. 실제 `/health` HTTP 200을 supervisor가 확인하기 전에는 `vercel.json`에 Render/Railway 주소를 추측해 넣지 않는다.
- Vercel 프로젝트 생성·환경 변수 변경·production 배포·도메인 변경은 사용자 승인 후 수행한다.
- backend `ALLOWED_ORIGINS` 변경은 백엔드 소유자의 승인된 절차로만 수행한다.
- 로컬 memory-mode E2E 통과는 MongoDB-backed GitHub Actions 통과를 대신하지 않는다.
- production evidence가 없으면 `F8/8 completed`라고 보고하지 않는다.
- 비밀값, 쿠키, participant token, 답변·예측·결과 payload를 CI 로그, artifact 또는 문서에 기록하지 않는다.

## 8. 저장소와 로컬 상태 주의사항

- 사용자 로컬 파일 `.claude/settings.local.json`은 저장소 변경에 포함하지 않는다.
- `apps/frontend/src/shared/api/schema.d.ts`가 Windows 줄바꿈 때문에 수정 표시만 보일 수 있다. 커밋 전 normalized diff를 확인하고 실질 변경이 없으면 포함하지 않는다.
- 원격 `origin/feature/15-light-result` 브랜치는 과거 F6 정리 잔여물이다. F8 구현과 무관하며 별도 삭제 요청 없이는 건드리지 않는다.
- 저장소 이미지 자산은 `apps/frontend/public/images`만 사용한다. 외부 Downloads 경로에 의존하지 않는다.

## 9. 다른 PC에서 시작하는 방법

```text
git clone https://github.com/hotpringles/MIRI.git
git fetch origin --prune
git switch chore/22-release-readiness
npm ci
```

이미 clone된 저장소라면 사용자 변경을 먼저 확인하고 `git pull --ff-only`만 사용한다.

Orca에서 새 Codex CLI 세션을 열고 다음 지시로 시작한다.

```text
docs/PROJECT_CONTEXT.md와 연결된 최신 handoff, F8 계획, 승인된 spec을 끝까지 읽어라.
Frontend F8 Task 1부터 진행하되 구현자는 gpt-5.6-luna xhigh, 리뷰어는 gpt-5.6-sol high를 사용하고 현재 에이전트는 supervisor 역할만 수행하라.
작업 전에 실제 브랜치·코드·테스트 상태를 검증하고 unrelated user changes를 보존하라.
```

## 10. 첫 재개 체크리스트

1. `git status --short --branch`와 `git log --oneline -5` 확인
2. `docs/PROJECT_CONTEXT.md`, 이 handoff, spec, F8 계획 완독
3. `chore/22-release-readiness`가 `b77d667` 이후 handoff 커밋을 가리키는지 확인
4. `npm ci` 후 F7 baseline인 api:check, lint, typecheck, Vitest, build 재검증
5. F8 SDD ledger와 Task 1 brief 생성
6. Luna xhigh Task 1 구현 → Sol high 리뷰 게이트 시작
