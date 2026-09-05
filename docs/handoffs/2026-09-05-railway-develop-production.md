# Railway develop 운영 배포

2026-09-05 기준 운영 배포 기록이다. Railway 설정 변경과 운영 검증 결과를 기록하며 비밀값은 저장하지 않는다.

## 배포 구성

- Railway 서비스: `cozy-tenderness` / `production` / `mirisalim-backend`
- 배포 소스: `develop` (`e1dba26` 확인 시점)
- Root Directory: `/apps/backend`
- 백엔드: `https://mirisalim-backend-production.up.railway.app`
- 프론트: `https://miri-sallim.vercel.app`
- 운영 콜백: `https://miri-sallim.vercel.app/api/v1/auth/kakao/callback`

Railway에 `PUBLIC_APP_ORIGIN`, `DEEP_MODE_ENABLED`, `KAKAO_LOGIN_ENABLED`, `AUTH_SESSION_PEPPER`,
`KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`를 적용했다. 키·pepper 값은 Railway에만 저장하며 Git과 문서에 남기지 않았다.

## 운영 검증

- Railway `/health`: HTTP 200, 데이터베이스 `connected`
- Railway의 `/api/v1/auth/kakao/start`: HTTP 302
- Vercel 프록시의 `/api/v1/auth/kakao/start`: HTTP 302
- OAuth 요청의 `redirect_uri`: 위 운영 콜백과 일치
- Kakao authorize: 콜백 주소를 거부하지 않고 계정 로그인 화면까지 이동
- 비로그인 `/api/v1/auth/me`, `/api/v1/deep/questions`: HTTP 401. 404가 아니며 로그인 필수 경계가 적용됨

## 남은 경계

- 실제 Kakao 계정 승인 이후 콜백·세션 유지 전체 여정은 브라우저에서 한 번 더 확인한다.
- 운영 AI 생성 활성화와 비용 한도는 이번 배포 설정 범위에 포함하지 않았다.
- 로컬의 미커밋 프론트 체험 화면·추가 통합 테스트는 이번 운영 배포와 커밋에 포함하지 않는다.
