# 프론트 없이 수행하는 백엔드 HTTPS 검증 인계

## 사용자 요청 및 범위

develop의 Light 프론트를 확인하고, Deep 프론트/배포 주소가 없어도 가능한 백엔드 검증과 개발을 계속한다. 기존 [심사용 로그인 인계](2026-09-03-reviewer-login-progress.md)의 인증·배포 경계는 유지한다. 새 UI, AI, 정책 매칭, Railway/Atlas 운영 변경은 하지 않았다.

## develop 확인 결과

- 원격을 fetch해 `origin/develop`의 `bd9056c`를 읽기 전용으로 확인했다. 현재 fix2에 merge/checkout/copy하지 않았다.
- `apps/frontend/src/app/router/AppRoutes.tsx`: Light 질문/완료/초대/대기/결과/공유 화면 라우트가 있다.
- `src/shared/api/client.ts`: same-origin API와 credentials=include 사용. `vite.config.ts`는 `/api`를 `MIRISALLIM_API_PROXY_TARGET`(기본 http://127.0.0.1:8000)으로 전달한다.
- `src/pages/landing/ui/LandingPage.tsx`: Deep 시작 버튼은 disabled다. Deep/심사용 로그인 라우트는 없다.
- `e2e/production-smoke.spec.ts` 등 Light 브라우저 시험 코드도 있지만 이 작업에서는 실행하지 않았다. Light 검증 때 참고 가능하나 Deep UI E2E 대체물은 아니다.

## 구현

[검증 계획](../superpowers/plans/2026-09-03-backend-only-validation.md)에 따라 테스트 전용 코드를 추가했다.

- `tests/https_mongo_support.py`: 기존 Uvicorn 앱을 production 설정으로 별도 프로세스 실행. 임시 SAN 인증서와 명시적 CA 신뢰로 실제 loopback HTTPS 통신한다. verify=False, TestClient, 인증 dependency override, 메모리 DB를 쓰지 않는다.
- 환경변수 whitelist로 운영 URI/DB명/GitHub·카카오 토큰을 상속하지 않는다. dotenv 비활성, 테스트 난수 pepper/합성 비밀번호, 안전한 URI 및 정확한 UUID DB 이름만 허용한다.
- 기존 `isolated_deep_database`로 독립 DB 생성·정리. 서버는 loopback만 listen하고 proxy headers를 신뢰하지 않는다. 종료 시 해당 자식 프로세스만 종료하고 임시 TLS 파일을 제거한다. 이 컴퓨터에 Docker/Mongo/OpenSSL을 새로 설치하지 않았다.
- `test_reviewer_https_mongo.py`: A/B/다른 체험방/미로그인 클라이언트의 실제 cookie jar를 분리한다. Light 쿠키·실제 DB 저장, 로그인, Origin 및 위조 테스트 헤더 거부, 같은 방 참여, 타방 접근 차단, 비공개 초안, stale revision, 공동 계획, 한쪽 제출 waiting, 양측 동일 결과, 비공개 메모 제외, 합의, 재작성, 초기화 및 기존 양쪽 토큰 무효화를 검사한다.
- B의 동의 `(재무 true, 가치 true)`, `(false,true)`, `(true,false)` 세 사례를 기존 Mongo CI job에 추가했다. 거부 영역의 unavailable, 공유된 영역의 결과, 다른 방/Light 유지 여부를 검사한다.

## 재현한 문제 및 수정

첫 실제 CI `b52d933`에서 만료 시각 비교가 실패했다. PyMongo의 기본 UTC 날짜 디코딩에는 tzinfo가 없으며 reviewer context 응답도 시간대 없는 문자열을 그대로 반환했다. `auth/reviewer_router.py`의 context 직렬화 전에 UTC를 명시한다. naive UTC/aware UTC/UTC+9 단위 회귀 테스트에서 수정 전 naive 사례 실패를 확인했다. Mongo 전체 설정이나 데이터 보관 정책은 변경하지 않았다.

같은 CI에서 Windows 전용 subprocess 상수의 Linux mypy 오류가 발생했다. `mypy --platform linux`로 로컬 재현 후 안전한 getattr 분기를 적용했다.

코드 리뷰에서 python-dotenv 1.0/1.1은 `PYTHON_DOTENV_DISABLED`를 지원하지 않는다는 지적을 확인했다([공식 변경 이력 1.2.0](https://raw.githubusercontent.com/theskumar/python-dotenv/main/CHANGELOG.md)). 최소 의존성을 1.2.0으로 올리고 테스트 서버의 환경 생성 단계에서도 구버전을 거부한다. 구버전 차단 회귀 테스트 2개와 별도 프로세스에서 합성 `.env`를 실제로 읽지 않는 검사 1개를 추가했다. 새로운 검증 코드의 환경 격리 문제였으며 운영 DB로 접속한 증거는 없다. 별도 검토에서 추가 중요한 지적은 없었다.

## 검증과 남은 경계

- 수정 후 로컬: 306 passed / 16 skipped / 11 warnings, Ruff 통과, mypy 103개 파일 통과. Linux 대상 helper 타입 검사도 통과.
- 로컬 skip 16개는 DB13 + 새 HTTPS3이다. 원격 실제 DB/HTTPS job 결과를 따로 확인해야 하며 local pass 수에 합산하지 않는다.
- UTC 수정본 `4c7d4a0`의 [원격 CI](https://github.com/MIRI-SALLIM/MIRI/actions/runs/33734129510)는 quality/container/deep-mongo가 모두 성공했다. 새 HTTPS 동의3종이 초기화 단계까지 통과했다.
- 환경 격리 보완 `a9dce09`의 [최종 CI](https://github.com/MIRI-SALLIM/MIRI/actions/runs/33734406279)도 세 작업 전부 성공했다. quality **309 passed / 16 skipped / 12 warnings**, 별도 실제 Mongo/HTTPS job **20 passed / 0 skipped**(기존17 + HTTPS3), Ruff 통과 및 mypy 103개 파일 통과. Docker 합성 비밀 파일 제외 검사도 통과했다. 후속 문서 커밋은 검증한 실행 코드를 변경하지 않는다.
- 이것은 실제 HTTPS **API** 검증이지 브라우저 E2E가 아니다. 브라우저 SameSite/저장소/분석 로그, 실제 프론트 프록시, Railway forwarded IP/rate-limit, Kakao와 운영 배포 검증은 남는다.
- 프론트 URL 없이 진행할 수 있는 백엔드 작업을 중단하지 않는다. 새 기능/운영 활성화는 해당 범위와 승인에 맞춰 진행한다.
