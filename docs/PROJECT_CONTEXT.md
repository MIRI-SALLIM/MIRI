# MIRI_FE 프로젝트 컨텍스트

이 폴더에는 `C:/Users/jhcho/Documents/미리살림`에서 작성했던 기획·구현 문서와 원본 이미지를 2026-08-10 기준으로 옮겨 두었습니다.

## 먼저 읽을 문서

최신 AI 기능 개발 인계: [우리 돈의 기준회의 C단계](handoffs/2026-09-04-deep-money-meeting-generation.md).
후속 [실제 API 합성 3건 확인](handoffs/2026-09-04-deep-money-meeting-live-smoke.md): 연결/형식은 3건 모두 성공, 추정 합산 $0.0056235. 상한 답변 반영이 약해 해설 품질 승인은 보류했다. 운영 활성화·배포는 하지 않았다.
이후 상한 누락 응답 거부·상한별 기본 해설·프롬프트 v2를 소규모 보완했다. 추가 유료 재평가는 하지 않았다.
`develop` PR #40 병합 이후 A/B 기반 위에 동의 v2·AI 생성/조회·캐시·중복 방지·일일 비용 예약·기본 해설 대체를 로컬 구현했다.
제품 목표는 [AI 해설 설계](superpowers/specs/2026-09-04-deep-money-meeting-design.md), 진행 범위는 [C단계 계획](superpowers/plans/2026-09-04-deep-money-meeting-generation.md), 프론트 계약은 [질문·동의·해설 API](deep-meeting-api.md), 설정은 [AI 운영 안내](deep-meeting-operations.md)를 따른다.
관련 179개 테스트 통과 기록은 C단계 인계를 따른다. 상한 보완 후 커밋 전 관련 159개 테스트를 재검증했다. 실제 합성 API 소량 호출만 추가 확인했으며 기본 AI 비활성·품질 승인 보류 상태다. 프론트 화면 연결·운영 배포는 미완료다. AI 변경은 로컬 작업이며 원격 푸시·배포 기록과 구분한다.

최신 배포·검증 상태: [Deep v3 실DB 검증·fix2 코드 배포](handoffs/2026-09-03-deep-v3-release-progress.md). 실제 Mongo/HTTPS 검증과 Railway fix2 코드 배포를 완료했다. 운영 Deep·심사용 로그인은 설정 전이라 비활성이고, 사용자 요청에 따라 프론트 UI 제작은 보류했다. 아래 구현 인계의 이전 미배포 상태는 이 문서로 갱신한다.

최신 백엔드 구현 인계: [딥모드 v3 입력·분담·공동 리포트 연결](handoffs/2026-09-03-deep-v3-integration-progress.md). 프론트 계약은 [Deep v3 API](deep-v3-api.md). 승인된 방향은 [최종 질문 파이프라인](superpowers/specs/2026-09-03-deep-question-pipeline-final-design.md)이며 이번에는 저장→질문→공동 결과를 연결했다. 전체 재무 질문 UI·AI·실배포 완료는 아니다. 재원 기반은 [개인 미리보기 인계](handoffs/2026-09-03-deep-funding-progress.md), 이전 검증은 [프론트 없이 수행하는 HTTPS·실Mongo 검증](handoffs/2026-09-03-backend-https-progress.md), 인증 계약은 [심사용 로그인·독립 체험방·초기화](handoffs/2026-09-03-reviewer-login-progress.md), 이전 출시 경계는 [Deep MVP C 인계](handoffs/2026-09-03-deep-mvp-c-progress.md)를 참고한다. 이전 [A/B 인계](handoffs/2026-09-03-deep-mvp-ab-progress.md)는 과거 상태다. 기존 Light/프론트 문서는 아래에 보존한다.

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
