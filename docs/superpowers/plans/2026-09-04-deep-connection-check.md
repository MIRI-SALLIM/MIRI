# 임시 딥모드 연결 화면 구현 계획

> 실행: 기존 격리 작업 브랜치에서 순차 구현한다. 사용자 승인 범위는 직전 대화의 임시 프론트 연결 점검이다.

**목표:** 완성형 디자인 없이 로그인→두 사람 참여→합성 입력/동의→공동 리포트/해설→철회·초기화까지 검증한다.
**구조:** 기존 LoginCheck에 DeepCheck를 연결한다. 브라우저는 실제 API·쿠키를 사용하고, 로컬 서버만 기존 MemoryDatabase 경계 대역을 쓴다. 사용자 인증을 우회하지 않는다.
**기술:** 기존 React/TypeScript/Vitest/FastAPI/pytest, 의존성 추가 없음.
**계약:** docs/deep-v3-api.md, docs/deep-meeting-api.md 및 생성 OpenAPI.

## 제약

- 비밀번호·방 코드·재무 결과를 localStorage/URL/로그에 저장하지 않는다.
- 체크박스는 기본 미선택. 실제 AI 생성 POST는 별도 사용자 클릭에서만 발생한다.
- 세션/로그인 변경·철회·오류 시 이전 리포트와 해설을 지운다. 자동 폴링·POST 재시도 없음.
- 샘플 적용은 현재 revision/planVersion/round를 GET한 뒤 진행하며 상대 데이터를 대신 제출하지 않는다.
- 기존 입력 교체는 합성 데이터 전용임을 명시한다. 운영 데이터 입력 도구가 아니다.
- 메모리 서버는 loopback만 바인드하며 AI·카카오·Atlas는 기본 꺼져 있다. production에서 실행 거부.
- 카카오는 시작 링크와 일반 계정 확인 경로를 연결하되, 실제 키/등록 콜백 없는 상태를 검증 완료로 표시하지 않는다.
- 커밋·푸시·운영 배포·유료 모델 호출은 이번 작업에 포함하지 않는다.

## 작업 1: 임시 화면과 호출 계약

파일: apps/frontend/src/pages/login-check/{api.ts,sample.json,ui/DeepCheck.tsx,ui/LoginCheck.tsx}, apps/frontend/src/app/DeepCheck.test.tsx.

- [x] 실패 테스트: 화면 진입에는 POST 없음, 명시 생성만 POST, 동의는 미선택, 철회 후 결과 제거, 409 이후 재조회 요구.
- [x] 세션 생성/초대 합류/세션 조회, 샘플 계획·본인 입력 적용, 양측 계획 확인·공유 제출을 버튼으로 분리.
- [x] 준비된 리포트에서 추가 질문/동의 v2를 표시하고 조회/AI 생성/철회를 분리.
- [x] 로그인 초기화 및 카카오 일반 계정 확인을 연결하고 기존 로그인 테스트 회귀 확인.

검증: `npm --workspace @mirisallim/frontend run test -- --run src/app/LoginCheck.test.tsx src/app/DeepCheck.test.tsx` 및 typecheck.

## 작업 2: 안전한 로컬 서버와 브라우저 점검

파일: apps/backend/tests/manual_server.py, apps/backend/tests/integration/test_manual_server.py, docs/handoffs/2026-09-04-deep-connection-check.md.

- [x] 실패 테스트: production 거부, 실제 reviewer 비밀번호 검증/쿠키 사용, 메모리 저장소, AI/카카오/DB 외부 접속 비활성.
- [x] 기존 auth repository를 메모리 저장소에 연결한 loopback 서버를 만든다. 합성 암호 synthetic-password-a / synthetic-password-b만 사용한다.
- [x] 백엔드/프론트를 시작하고 브라우저에서 A/B 로그인 및 전체 순서를 점검한다. CLI 브라우저 도구가 없어 제공된 브라우저 제어 도구를 대체 사용한다.
- [x] 화면/콘솔/최소 회귀를 확인하고 성공 범위와 실제 Mongo/HTTPS/카카오/AI 재평가 미완료를 인계한다.
