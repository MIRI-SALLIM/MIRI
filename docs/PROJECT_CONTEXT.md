# MIRI_FE 프로젝트 컨텍스트

이 폴더에는 `C:/Users/jhcho/Documents/미리살림`에서 작성했던 기획·구현 문서와 원본 이미지를 2026-08-10 기준으로 옮겨 두었습니다.

## 먼저 읽을 문서

### ⚠ 지금 진행 중인 작업 — 딥모드 프론트엔드 (2026-09-06)

**원본 계획서: [딥모드 프론트엔드 구현 계획](superpowers/plans/2026-09-06-mirisallim-deep-frontend.md).**
착수 전에 이 계획서와 `CLAUDE.md`의 Git flow를 읽는다. 각 F 단계 이슈는 계획서에서 파생시킨다.

계약 정본은 [프론트 전달용 가이드](../apps/backend/frontend-handoff/02-api-guide.md)다.
**`deep-v3-api.md`는 stale 사본이며 없는 경로를 참조한다. 읽지 마라.**

#### 단계 현황

| 단계 | 상태 | 이슈 | PR | 비고 |
| --- | --- | --- | --- | --- |
| F9 딥 기반 | ✅ 병합됨 | #81 | #83 | 병합 커밋 `ec81b0f`. 화이트리스트 딥 31 + 라이트 12, zod 미러, `/deep/*` 라우트 |
| #84 미러 누락 | 🔄 PR 열림 | #84 | #89 | 브랜치 `fix/84-deep-mirror-gaps`, HEAD `b4dfd30` |
| F10 세션 | 🔄 PR 열림 | #88 | #90 | 브랜치 `feature/88-deep-session`, HEAD `078aa3d` |
| F11~F18 | 대기 | — | — | 계획서 참조 |

**이 표가 실제 저장소 상태와 어긋나면 표를 신뢰하지 마라.**
`git log --oneline origin/develop`과 `gh pr list --state all`로 직접 확인한 뒤 갱신하라.

두 PR 모두 **3라운드 검증을 거쳐 병합 가능 판정**이다(1·2라운드는 워크트리 `codex-sol-high`,
3라운드는 레이트 리밋으로 코디네이터가 수행). 병합 전 Opus 5 독립 검증이 남아 있다.

워크트리는 `C:/Users/jhcho/orca/workspaces/MIRI_FE/{deep-84-mirror-gaps,deep-f10-session}`이다.

#### 다음 착수 지점

계획서의 2트랙 병렬을 따른다.

- **트랙 A:** #90 병합 후 **F11(공동 계획)**. `plan/confirm`을 빼면 F14가 영원히 제출 불가다
- **트랙 B:** #89 병합 후 **#85(AmountField) → F12a(기본 재무 입력)**

**#85는 F12a보다 먼저다.** `AmountField`에 id 충돌·상태 융합·0원 주입이 있고,
F12a가 그 컨트롤을 화면에 까는 단계라 나중에 고치면 호출부를 전부 손대야 한다.

#### 이 저장소에서 실제로 막혔던 것들

계약을 읽어서는 알 수 없고, 실제로 시간을 태운 것들이다.

- **저장이 검증으로 실패한다.** `deep/v3_models.py:85`의 `DeepInputV3` 검증자가 끝에
  `funding_request(date.max)`를 호출해 **자금 그래프 검증 전체가 모든 `PATCH me/input`마다** 돈다
  (`funding_models.py`의 `validate_funding_links` 하나에 검사 10개·고유 코드 9개).
  라이트의 "저장은 항상 성공, 409만 처리" 전제가 여기서 깨진다
- **필드 단위 오류가 오지 않는다.** `deep/router.py:66-67`이 v3의 모든 검증 실패를
  `422 INVALID_DEEP_INPUT` 하나로 뭉갠다. 그래서 zod 미러가 장식이 아니라 필수다.
  **미러가 서버보다 엄격하면 저장이 막히고, 느슨하면 이유 없는 422가 나간다 — 양쪽 다 결함이다**
- **`status: "ready"`는 "상대가 참여했다"가 아니다.** 리포트 발행 이후 상태이고
  `partnerCompleted`도 제출 여부다. 딥에는 라이트의 `partnerJoined`에 해당하는 것이 없다.
  대신 `update_plan`·`save_input`·`confirm_plan`이 파트너 없이 동작하므로 기다릴 이유가 없다
- **딥 e2e는 MongoDB를 요구한다.** 심사용 로그인이 세션을 DB에 쓰기 때문이다
  (`auth/dependencies.py:43-45`). 로컬에서 Mongo 없이 돌리면 이유를 밝히며 skip되고,
  CI는 `mongo:8` 서비스와 `MIRISALLIM_E2E_USE_MONGO=1`로 실제 실행한다.
  **로컬에서는 구조적으로 잡을 수 없는 회귀가 한 번 있었다.** 검증이 병합 전에 잡았고,
  놓쳤다면 CI 첫 실행에서야 드러났을 것이다 — e2e 선택자는 실행 대신 코드로 대조한다
- **오케스트레이션:** `run-create`가 코디네이터 바인딩을 새 Run으로 옮기고 이전 Run을 fence한다.
  읽기는 통과하고 변경만 막혀 늦게 드러난다. **병렬 트랙도 Run은 하나로 두고 태스크만 나눈다**
- **워크트리 codex는 정산 신호를 보내지 못한다.** Orca가 직접 띄운 에이전트만
  `ORCA_AGENT_LAUNCH_TOKEN`을 받는데, 승인 게이트를 없애려면 `-a never`로 직접 띄워야 해서
  둘이 양립하지 않는다. **완료는 상태가 아니라 산출물(`.agent/RESULT*.md` + `git status`)로 판정한다**
- codex 레이트 리밋 모달이 뜨면 Orca가 주입과 `terminal send`를 모두 거부한다
  (`agent_prompt_blocked`). `--interrupt`로 모달은 걷히지만 태스크는 `failed`로 떨어진다

#### 재원(funding)은 프론트 범위에서 제외한다 (2026-09-06, 이슈 #97)

재원 설계는 `docs/superpowers/specs/`에 있으나 그 명세들은 **백엔드 트랙이 작성**했고,
질문 파이프라인 명세는 재원 구현 커밋 `86c55fd`에 함께 들어왔다. 제출에도 필요하지 않다 —
`apps/backend/deep/validation.py`는 D1~D10만 검사한다.

**단, 타입·zod 미러에서 지우면 안 된다.** `PATCH me/input`이 전체 치환이고, 서버는 재원을
건드리지 않은 초안에도 `funding: {sourcesStatus:"unknown", sources:[], ...}`를 채워 GET으로
돌려준다. 미러가 그 키를 모르면 **되돌려 보내는 순간 저장이 막힌다.**
근거와 되살릴 때의 조건은 계획서의 F12b 절에 있다.

#### 열린 후속 이슈

- **#85** `AmountField` id 충돌·상태 융합·0원 주입 — F12a 선행
- **#86** `shared/api`·`lib` 정리(`codeKinds` 13줄이 전부 무의미)
- **#76** `login-check`가 인증 비활성에서도 카카오 링크를 렌더
- 백엔드: **#99** 초대 코드 재조회 경로 없음(생성자가 새로고침하면 초대 불가), **#70** submit 409 문서화 불일치,
  **#72** 합의 제안 중복 생성, **#74** 카카오 provider 가용성 미노출

딥에는 **초대 코드 재조회 경로가 없다**(라이트의 `/api/v1/me/session`에 해당하는 것이 없음).
새로고침으로 URL 쿼리를 잃으면 초대 링크를 복구할 수 없어 세션을 닫고 새로 만들어야 한다.
초대 코드는 capability라 저장하지 않기로 했다. 백엔드 계약 이슈로 남길 후보다.

#### 프로덕션 노출 통제

`develop`이 곧 Vercel 프로덕션 브랜치다. **결과 화면이 도착하는 F15 전까지 딥 진입 CTA를
어떤 화면에도 노출하지 않는다.** `/deep/*` 직접 URL만 살려 테스트에 쓴다.

현재 `develop` 상태를 정확히 구분해 둔다.

- 랜딩의 15분 CTA는 **`develop`에서 이미 disabled**다
- **로그인 기본 도착지는 `develop`에서 아직 `/deep`이다.** 랜딩으로 바꾸는 변경은
  **미병합 PR #90에만** 있다. 지금 프로덕션에서 로그인하면 `/deep`으로 가지만,
  거기에는 세션 생성 수단이 없고 하위 경로는 전부 "준비 중"이라 실피해는 없다.
  **#90이 병합되면 로그인 기본 도착지가 랜딩이 된다 — 그 뒤로는 되돌리지 마라.**
  되돌리면 사용자가 두 번의 클릭으로 실세션을 만들 수 있게 된다.

---


최신 백엔드 보완: [조정안·우리 돈의 기준표 인계](handoffs/2026-09-06-deep-proposal-flow.md). guide의 개인비/저축·합의 인식 질문, 읽기 전용 preview/standards API와 프론트 계약을 로컬 구현했다. 신규 18개 포함 관련 236개 테스트 통과. 기존 불변 리포트/AI 흐름은 유지하며 이번 변경의 커밋·푸시·배포·프론트 화면 연결은 아직 하지 않았다. 아래 이전 날짜의 운영 상태는 역사적 기록이므로 현재 배포 상태와 구분한다.

최신 운영 배포: [Railway develop 운영 배포](handoffs/2026-09-05-railway-develop-production.md). Railway 백엔드를 `develop`에 연결하고 운영 프론트 origin과 Kakao 인증 설정을 적용했다. `/health`, 운영 프론트의 `/api` 프록시, Kakao 로그인 시작·운영 콜백 이동을 검증했다. 로그인 이후 전체 사용자 여정과 운영 AI 활성화는 별도 검증 범위다.

최신 백엔드 완결: [프론트 전달 전 최종 인계](handoffs/2026-09-05-deep-backend-handoff-final.md). 전체 대화 가이드와 기준표 생명주기, 동의 v3, 주거/월 잔액/목표/조건 최소 근거 해설을 로컬 구현했다. 이전 [하단 완료 API](handoffs/2026-09-05-deep-service-completion.md)와 [승인된 방향](superpowers/specs/2026-09-05-deep-service-flow-design.md)을 잇는다. 프론트 E2E·실모델 품질 평가·운영 변수/배포·develop 병합은 아직 아니다.

최신 백엔드 수정: [Light 초대 참여 응답 유실 복구 — #51](handoffs/2026-09-05-light-join-recovery.md). 같은 요청 키의 join 복구와 프론트 재클릭 키 재사용을 구현했다. 원격 반영은 Git 이력으로 확인하며 운영 배포와 딥모드 UX 계획의 구현은 별도다.

최신 후속 작업: [중복 질문 보완·배포 준비](handoffs/2026-09-04-deep-meeting-release-preparation.md). 이미 받은 초기 제안을 재질문하지 않도록 기본 질문과 AI 지시문을 보완하고 프롬프트를 v3로 갱신했다. 실제 v3 유료 호출·운영 배포는 하지 않았다. Railway는 여전히 fix2를 자동 배포 대상으로 사용하며 심사용 로그인·Deep 활성화 설정은 별도 준비가 필요하다.

최신 실모델 확인: [AI 해설 v2 가상 3건 실호출](handoffs/2026-09-04-deep-money-meeting-v2-live-smoke.md). 3건 모두 HTTP 200·형식/근거 검사 통과, 사용량 기준 추정 $0.0057885. 상한 반영·미정 처리는 개선됐지만 이미 받은 답변의 재질문 등 품질 보완점이 남는다. 운영 활성화·배포는 하지 않았다.

최신 로컬 UI 검증: [임시 딥모드 연결 점검](handoffs/2026-09-04-deep-connection-check.md). 심사용 A/B → 샘플 입력·동의 → 공동 리포트 → 기본 해설·철회를 브라우저에서 확인했다. 실제 인증과 메모리 저장소를 사용하며 카카오 실인증·AI v2 유료 재평가·운영 배포 완료가 아니다.

최신 AI 기능 개발 인계: [우리 돈의 기준회의 C단계](handoffs/2026-09-04-deep-money-meeting-generation.md).
후속 [실제 API 합성 3건 확인](handoffs/2026-09-04-deep-money-meeting-live-smoke.md): 연결/형식은 3건 모두 성공, 추정 합산 $0.0056235. 상한 답변 반영이 약해 해설 품질 승인은 보류했다. 운영 활성화·배포는 하지 않았다.
이후 상한 누락 응답 거부·상한별 기본 해설·프롬프트 v2를 소규모 보완했다. 추가 유료 재평가는 하지 않았다.
`develop` PR #40 병합 이후 A/B 기반 위에 동의 v2·AI 생성/조회·캐시·중복 방지·일일 비용 예약·기본 해설 대체를 로컬 구현했다.
제품 목표는 [AI 해설 설계](superpowers/specs/2026-09-04-deep-money-meeting-design.md), 진행 범위는 [C단계 계획](superpowers/plans/2026-09-04-deep-money-meeting-generation.md), 프론트 계약은 [질문·동의·해설 API](deep-meeting-api.md), 설정은 [AI 운영 안내](deep-meeting-operations.md)를 따른다.
관련 179개 테스트 통과 기록은 C단계 인계를 따른다. 상한 보완 후 커밋 전 관련 159개 테스트를 재검증했다. 실제 합성 API 소량 호출만 추가 확인했으며 기본 AI 비활성·품질 승인 보류 상태다. 프론트 화면 연결·운영 배포는 미완료다. AI 변경은 로컬 작업이며 원격 푸시·배포 기록과 구분한다.

최신 배포·검증 상태: [Deep v3 실DB 검증·fix2 코드 배포](handoffs/2026-09-03-deep-v3-release-progress.md). 실제 Mongo/HTTPS 검증과 Railway fix2 코드 배포를 완료했다. 운영 Deep·심사용 로그인은 설정 전이라 비활성이고, 사용자 요청에 따라 프론트 UI 제작은 보류했다. 아래 구현 인계의 이전 미배포 상태는 이 문서로 갱신한다.

최신 백엔드 구현 인계: [딥모드 v3 입력·분담·공동 리포트 연결](handoffs/2026-09-03-deep-v3-integration-progress.md). 프론트 계약은 [Deep v3 API](deep-v3-api.md). **(2026-09-06: 이 문서는 stale이다. 위 딥모드 절 참고)** 승인된 방향은 [최종 질문 파이프라인](superpowers/specs/2026-09-03-deep-question-pipeline-final-design.md)이며 이번에는 저장→질문→공동 결과를 연결했다. 전체 재무 질문 UI·AI·실배포 완료는 아니다. 재원 기반은 [개인 미리보기 인계](handoffs/2026-09-03-deep-funding-progress.md), 이전 검증은 [프론트 없이 수행하는 HTTPS·실Mongo 검증](handoffs/2026-09-03-backend-https-progress.md), 인증 계약은 [심사용 로그인·독립 체험방·초기화](handoffs/2026-09-03-reviewer-login-progress.md), 이전 출시 경계는 [Deep MVP C 인계](handoffs/2026-09-03-deep-mvp-c-progress.md)를 참고한다. 이전 [A/B 인계](handoffs/2026-09-03-deep-mvp-ab-progress.md)는 과거 상태다. 기존 Light/프론트 문서는 아래에 보존한다.

1. [프론트엔드 F8 재개 handoff](handoffs/2026-08-18-mirisallim-frontend-f8-continuation.md)
2. [프론트엔드 개발 시작 프롬프트](handoffs/2026-08-10-mirisallim-frontend-start-prompt.md)
3. [3분 모드 프로덕션 수직 슬라이스 설계](superpowers/specs/2026-08-05-mirisallim-light-vertical-slice-design.md)
4. [F8 릴리스 준비 구현 계획](superpowers/plans/2026-08-18-mirisallim-light-release-readiness.md)
5. [프론트엔드 구현 계획](superpowers/plans/2026-08-06-mirisallim-light-frontend.md)
6. [프론트엔드·백엔드 조정 계획](superpowers/plans/2026-08-06-mirisallim-light-coordination.md)

필요할 때 [수직 슬라이스 전체 계획](superpowers/plans/2026-08-06-mirisallim-light-vertical-slice.md)과 [백엔드 구현 계획](superpowers/plans/2026-08-06-mirisallim-light-backend.md)을 참고합니다.

## 이미지 자산

- `apps/frontend/public/images/미리살림_사람.png`: 랜딩 히어로 이미지
- `apps/frontend/public/images/미리살림_3분_아이콘.png`: 3분 모드 카드 아이콘

과거 문서의 `C:/Users/jhcho/Downloads/...` 경로는 원본 위치를 기록한 것입니다. 새 프로젝트에서는 위 저장소 내부 경로를 사용합니다.

## 이관 원칙

- Markdown 원본은 이력 보존을 위해 내용을 바꾸지 않고 복사했습니다.
- ZIP 전달본 4개는 같은 Markdown의 이전 버전 또는 중복본이므로 복사하지 않았습니다.
- 현재 코드와 테스트가 문서 작성 이후 바뀌었을 수 있으므로 구현 전에는 반드시 실제 코드 상태를 확인합니다.
