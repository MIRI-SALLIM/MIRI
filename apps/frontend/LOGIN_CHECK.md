# 최소 로그인 연결 점검

`/deep/login-check`는 기존 홈과 별개인 인증 점검 화면이다. develop 전체 병합, 딥모드 제품 UI, 운영 로그인 활성화를 포함하지 않는다. 카카오 버튼은 실제 키·콜백 설정 전이라 비활성이다.

## 로컬 실행 (저장소 루트, PowerShell)

의존성 설치가 처음이면 `npm.cmd ci --ignore-scripts --no-audit --no-fund`를 실행한다. 기존 `apps/backend/.venv`와 Git에서 제외된 `.reviewer-credentials.local/railway.env`가 필요하다. 비밀번호를 코드나 `.env.example`에 적지 않는다.

터미널1:

```powershell
.\apps\backend\.venv\Scripts\python.exe apps/frontend/scripts/login_probe.py
```

터미널2:

```powershell
npm.cmd --workspace @mirisallim/frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

[로그인 점검 화면](http://127.0.0.1:5173/deep/login-check)을 연다. Origin이 고정되어 있어 `localhost`로 바꾸거나 다른 포트로 실행하지 않는다. 충돌 시 먼저 해당 포트를 사용하는 본인 점검 서버를 종료한다.

1. `judge-a`와 로컬 계정 파일의 비밀번호로 로그인한다. 처음에는 체험방 코드를 비운다.
2. 표시되는 체험방 코드를 복사한다. 별도 브라우저 또는 시크릿 창에서 `judge-b`·B 비밀번호·같은 코드를 입력한다.
3. A/B 역할과 서로 다른 계정 식별자, 같은 방 코드를 확인한다. 새로고침과 로그인 상태 확인, 로그아웃을 시험할 수 있다.
4. 같은 브라우저의 탭끼리는 쿠키를 공유하므로 A/B 동시 시험용으로 쓰지 않는다. 체험방 코드는 Deep 진단 초대 코드와 다르다.

점검 서버는 **기존 인증 코드·비밀번호 해시 검증을 사용하되 저장소만 메모리 대역**이다. Atlas·외부 네트워크·카카오를 사용하지 않고, 두 서버 모두 루프백에만 바인딩한다. 종료하면 세션·방은 사라진다. HTTP 로컬 쿠키 시험은 운영 HTTPS/Secure 쿠키·실Mongo 검증을 대체하지 않는다. 서버2개는 각각 Ctrl+C로 종료한다.

## 이번 변경의 제한 검증

- `src/app/LoginCheck.test.tsx` 6개 + 기존 홈 테스트1개 통과: A/B 요청, 비밀번호 비움, 안전한 오류, 쿠키 기반 복구·만료·로그아웃.
- `scripts/test_login_probe.py` 1개 통과: 운영 환경변수 상속 차단, 계정 분리, Origin 검사, 비밀값을 포함하지 않는 입력 오류.
- `login_probe.py --check`로 로컬 계정 파일의 두 비밀번호 확인. 실제 Vite 프록시를 거친 A/B HTTP 로그인·쿠키·복구·로그아웃도 확인.
- 타입 검사·변경 파일 lint·프론트 build 통과. 브라우저에서 화면 로드와 잘못된 비밀번호 거절·입력값 비움을 확인. 실제 비밀번호를 브라우저에 자동 입력하지는 않았다.

운영 Railway 설정, 카카오 실제 로그인, 딥모드 전체 화면·전체 회귀 테스트는 이번 점검 범위가 아니다. 운영 API로 바꿀 때는 프론트 origin/프록시와 인증 변수를 먼저 확정한다. 로컬 점검 서버를 배포하거나 인터넷에 노출하지 않는다.
