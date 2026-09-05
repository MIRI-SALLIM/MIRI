# AI 중복 질문 보완 및 배포 준비

## 변경

- `templates.py`: A/B가 `initialProposal`이라고 답했다면 제안인지 상한인지 다시 묻지 않는다. 이미 받은 초기 제안과 상대 기대 기준의 차이를 조율하도록 질문한다.
- `unknown`은 기존 확인 질문을 유지한다. 본인 상한·양측 상한·조정 가능 범위 관련 안전 조건은 유지한다.
- `provider.py`: 상한 사례뿐 아니라 모든 사례에 답변을 반영한 서버 질문 방향을 전달한다. 설명은 서술문, 질문은 question 필드로 분리하도록 지시한다.
- 프롬프트 버전 `money-meeting-v3-known-answers`로 이전 캐시를 새 요청에 재사용하지 않는다. 모델·API 계약·계산·호출 한도는 그대로다.
- 임시 연결 화면·로컬 메모리 서버·가상 3건 실호출 기록도 이번 인계에 포함한다. 이 서버는 운영 실행 대상이 아니다.

회귀 테스트에서 기존 코드의 중복 질문/지시문 누락 5건 실패를 확인한 후 수정했다. 관련 단위 테스트 43개 통과. 미정 답변은 재확인하도록 별도 검사한다. 별도 코드 리뷰에서 수정이 필요한 회귀/보안 문제는 발견되지 않았다.

커밋 전 검증: 백엔드 로컬 전체 **547 passed / 22 skipped**(실DB 등 별도 조건), Ruff 통과, mypy 147개 파일 통과. 기존 deprecation 경고 11건은 남아 있다. 프론트 production build·TypeScript 검사·변경 파일 ESLint·로그인/딥 점검 테스트 10개 통과. 컨테이너 빌드는 로컬에서 실행하지 않았으며 GitHub Backend CI 결과를 별도로 확인한다.

**v3의 실제 모델 응답은 새로 호출하지 않았다.** 기본 질문과 전달 지시문을 검증한 것이며, 실모델이 중복 질문을 절대 하지 않는다는 보장은 아니다. v2의 실제 응답 3건 결과는 [이전 인계](2026-09-04-deep-money-meeting-v2-live-smoke.md)를 따른다.

## Railway 읽기 전용 확인 (2026-09-04)

| 항목 | 확인 내용 |
|---|---|
| 서비스 | mirisalim-backend / production |
| 저장소 | MIRI-SALLIM/MIRI |
| 현재 자동 배포 브랜치 | fix/gate2-openapi-contract |
| 이번 작업 브랜치 | codex/deep-money-meeting |
| Root Directory | /apps/backend |
| Builder | Dockerfile 자동 감지 |
| 현재 활성 배포 | b8adb596-9e61-448c-8a1e-b5885ac35521 |
| 현재 활성 배포 제목 | fix: synchronize frontend API types with deep v3 contract |
| Serverless | OFF |
| Wait for CI | OFF |
| Healthcheck Path | 설정 값 대신 추가 버튼이 표시됨. 실제 배포 전 /health 설정 여부 확인 필요 |

Variables 목록의 이름만 확인했다. 비밀값은 펼치지 않았다.

등록됨: `ALLOWED_ORIGINS`, `ENVIRONMENT`, `MONGODB_DB_NAME`, `MONGODB_URI`, `OPENAI_API_KEY`, `PARTICIPANT_TOKEN_PEPPER`, `SESSION_TTL_DAYS`.

아직 서비스 변수 목록에 없음: `DEEP_MODE_ENABLED`, `REVIEWER_LOGIN_ENABLED`, `KAKAO_LOGIN_ENABLED`, `PUBLIC_APP_ORIGIN`, `AUTH_SESSION_PEPPER`, `REVIEWER_A_PASSWORD_HASH`, `REVIEWER_B_PASSWORD_HASH`, `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `DEEP_MEETING_AI_ENABLED` 및 AI 일일 한도 변수. OpenAI 키 등록만으로 로그인·딥모드·AI가 활성화되지는 않는다. 공유 변수나 별도 주입 경로의 실제 런타임 값까지 검증한 것은 아니다.

## 운영 반영 전 순서

1. 현재 작업 브랜치의 커밋·푸시 및 Backend CI 확인. 현재 develop도 추가 변경이 있으므로 팀 작업을 덮어쓰지 않고 PR로 통합한다. 이번 작업에서 병합은 하지 않는다.
2. 사용자와 최종 배포 브랜치를 결정한다. 현재 fix2에 병합하면 자동 배포가 시작되므로 별도 승인 전에 병합하거나 Railway 브랜치를 변경하지 않는다.
3. 초기에는 `DEEP_MEETING_AI_ENABLED=false`, `KAKAO_LOGIN_ENABLED=false`로 심사용 로그인부터 검증할 수 있다. Deep·reviewer 활성화 시 유효한 공개 프론트 origin·인증 pepper·A/B 해시를 함께 설정해야 한다. 로컬 합성 암호를 운영에 사용하지 않는다.
4. 실제 프론트 주소가 정해지면 동일 출처 /api 프록시, 쿠키, `PUBLIC_APP_ORIGIN`, 카카오 등록 callback을 맞춘다. 콜백 경로는 `/api/v1/auth/kakao/callback`이다.
5. 승인된 커밋을 배포하고 /health·심사용 로그인·양측 동의·공동 리포트·철회를 운영 환경에서 점검한다. 실제 AI를 켜기 전 실DB 원장/경쟁·동의·품질 검증 및 비용 한도를 확인한다.

이번 단계는 배포 **준비**다. Railway 변수·연결 브랜치·활성 배포는 변경하지 않았다. 커밋·푸시 결과와 최종 회귀 결과는 작업 응답 및 Git 이력으로 확인한다.
