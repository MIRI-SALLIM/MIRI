# Deep v3 실DB 검증·fix2 코드 배포

2026-09-03. 사용자는 딥모드 프론트가 아직 없으므로 새 화면을 만들지 않고 백엔드 검증·배포와 API 전달 자료까지만 진행하도록 범위를 줄였다.

## 완료

- `fix/gate2-openapi-contract`에 구현 `5857695`, 검증 수정 `acb5a69` 커밋·푸시. develop/main 병합이나 강제 푸시는 하지 않았다.
- [Backend CI](https://github.com/MIRI-SALLIM/MIRI/actions/runs/33763081943): 실Mongo/HTTPS **26 passed, 0 skipped**, quality **386 passed, 22 skipped**, Ruff/mypy·Docker build·빌드 컨텍스트 비밀파일 제외 검사 통과. 격리 mongo:7과 합성 계정만 사용했다.
- 최초 CI에서 새 reset 검증이 즉시 물리 삭제를 잘못 기대했다. 승인된 심사용 방 설계에 맞춰 접근 철회·이전 쿠키 무효화·보관 TTL 상한으로 테스트를 고친 뒤 전체 CI를 통과했다. 이 수정으로 운영 코드의 삭제 동작을 바꾸지 않았다.
- Railway `cozy-tenderness` / production / `mirisalim-backend`의 소스 브랜치를 fix1에서 fix2로 변경하고 배포했다. 검증한 코드 배포 ID: `fa96df35-c69e-4967-a6ff-f5a7ff1152fe` (`acb5a69`).
- [운영 백엔드](https://mirisalim-backend-production.up.railway.app)의 `/health`, DB 연결, Light 질문5개, Light 세션 생성 모두 PASS. 검증용 Light 세션1개는 기존 TTL 정책으로 만료된다.
- 운영 OpenAPI에 v3 경로15개가 반영됐다. Deep 질문/세션 질문 및 심사용 로그인 요청은 기능 비활성에 따른404를 확인했다.

## 코드 배포와 기능 활성화는 다르다

현재 Railway에 Deep/심사용 로그인 활성화 및 인증 필수 설정이 없어 **운영에서 Deep를 체험할 수는 없다**. 이번 작업은 secret 값 조회·등록, Atlas 변경, 카카오 설정 변경, 유료 요금제 전환을 하지 않았다. Serverless OFF를 유지했다.

향후 프론트 origin과 same-origin `/api` 프록시가 정해지면 [심사용 로그인 운영 가이드](../operations/reviewer-login.md)에 따라 `PUBLIC_APP_ORIGIN`, `AUTH_SESSION_PEPPER`, 심사 계정 비밀번호 해시와 활성화 플래그를 안전하게 설정하고 두 브라우저로 다시 검증한다. 실제 비밀번호나 pepper를 문서·Git·채팅에 넣지 않는다. 카카오 활성화는 별도다.

## 프론트에 전달할 것

- API 서버: `https://mirisalim-backend-production.up.railway.app`
- [Deep v3 호출 순서·입력/결과·공개 동의 계약](../deep-v3-api.md)
- [가상 요청 JSON](../../apps/backend/tests/fixtures/deep_v3_contract_examples.json)
- [OpenAPI](../../apps/backend/openapi.json), 프론트 사본 `apps/frontend/openapi.json`
- 화면 완성이나 운영 Deep 로그인 가능 상태로 안내하지 않는다. 운영 활성화 전에는 예제로 UI를 연결하고, Origin 확정 후 인증·쿠키 흐름을 검증한다.

앞선 [구현 상세 인계](2026-09-03-deep-v3-integration-progress.md)의 미배포·실DB 미검증 상태는 이 문서로 갱신한다. 전체 재무 질문 UI, AI 해설, 정책 매칭 등 이전 미구현 범위는 그대로다.
