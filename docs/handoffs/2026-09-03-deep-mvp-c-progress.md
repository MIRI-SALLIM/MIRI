# Deep MVP C 구현 인계

## 상태

2026-09-03 `83f0719` 기반 격리 worktree에서 A/B에 이어 C를 순차 구현했다. **C1~C4 로컬 구현 및 C5 실제 Mongo 검증까지 진행했으며 전체 출시 gate 통과·배포 완료는 아니다.** 운영 checkout/Railway/Atlas 설정은 변경하지 않았고 커밋·푸시하지 않았다. DEEP_MODE_ENABLED=false 유지. 정책 매칭/AI 해설은 사용자의 후속 확인대로 계속 보류한다.

| 단계 | 구현 | 남은 검증 |
|---|---|---|
| A/B | 카카오 인증, 10문항 및 계산 | 실제 앱 설정·로그인 |
| C1 | 계정 멤버십·초대·개인 초안·공동 계획 | 두 계정 브라우저 연결 |
| C2 | 계획 확인·양측 제출·별도 공유 동의·공개 stamp, 로컬 실Mongo 경합 통과 | Python3.11 원격 CI |
| C3 | 동의 범위 계산·immutable 보고서·템플릿 | 프론트 블록별 화면 |
| C4 | 합의/보류·양측 재작성·철회/만료/계정 삭제 | 실환경 장애 복구 |
| C5 | Mongo CI job·계약 테스트·예시·체크리스트, 기존 미실행 DB12개 통과 | 원격 CI/컨테이너·브라우저 E2E·출시 승인 |

이전 A/B 인계의 “C 미구현”은 과거 상태다. 다음은 C 재구현이 아니라 [출시 체크리스트](../operations/deep-mvp-release-checklist.md)의 미완료 gate 검증이다.

## 변경 위치·계약

- `apps/backend/deep/repository.py`: 실Mongo version CAS, 제출·공개·삭제 표식. 메모리 fallback 없음. `tests/mongo_fakes.py`는 시험 경계만 대체한다.
- `deep/router.py`, `dependencies.py`, `service.py`, `state.py`: 계정/Origin/멤버십/만료와 DTO 화이트리스트. 질문 기본v2·v1 호환 모두 로그인 필수. 구형 mode=deep 우회 차단.
- `deep/report.py`, `config/deep_copy.ko.v1.json`: 동의 범위별 계산·실제 문항/라벨 대화. 메모와 미동의 영역의 파생값 제외.
- `deep/agreements.py`, `lifecycle.py`: 버전별 양측 확인, 최근10분 로그인 후 내부 계정 삭제.
- 초안 PATCH는 expectedRevision + 전체 input 교체. 공동 계획도 전체 교체/버전 방식. 제출 후 잠금.
- status 조회만으로 ready가 되지 않는다. result 첫 요청이 공개한다. 같은 stamp는 setOnInsert로 immutable 저장하며 경합 패자가 승자 캐시를 지우지 않는다. 재조회는 TTL 미연장, 읽기 시 현재 권한 재확인.
- 합의 생성 expectedRound를 추가해 과거 회차 폼 저장을 막았다. 편집/보류는 버전 증가·확인 초기화.
- GET `/sessions/{id}/rounds`의 round/myRequested/partnerRequested로 요청 상태 복구. 양측 확정 시 입력 revision과 계획 version도 증가해 과거 요청 차단.
- 삭제 표식은 정리보다 먼저 저장. 실패 시에도 파트너 결과 접근 차단. 최종 인증 삭제 이후 실패는 제한된 운영자 재시도가 필요하다.
- Uvicorn OAuth query/Deep 초대 경로 가림, 내부 예외의 재무값 traceback 차단. 실제 플랫폼 로그는 미검증.
- 활성화 시 질문·규칙·문구 시작 검사. 초안/공개 보관일은 요청 시 환경값1~365 범위 검사.

## 검증·리뷰

재검증 명령/프론트 요청 순서/예시는 출시 체크리스트에 있다. OpenAPI는 기존 생성기로 양쪽 파일을 함께 생성한다. 로컬 Python3.12.10이다. 기본 wrapper는 Mongo를 비워12개를 skip하지만, 후속 실행에서 임시 Mongo7.0.39로 해당12개를 모두 검사했다. Python3.11 원격 CI/Docker build는 실행하지 않았다. 최종 수치는 아래 검증 기록에 적는다.

읽기 전용 C1~C4 리뷰에서 중대 공개/CAS 결함은 확인되지 않았고 회차 조회 누락·과거 회차 합의 문제2건이 나왔다. 각각 재현 테스트 후 수정했다. 실환경 통과를 뜻하지 않는다.

## 다음 작업

최종 로컬 검증(2026-09-03): 기본 wrapper **271 passed / 12 skipped / 10 deprecation warnings**, 별도 실제 Mongo 실행 **15 passed / 0 skipped / 1 warning**(DB12개 + 순수 계산3개). Deep 경합6종 ×5회 통과. 런타임은 checksum 검증한 공식 Windows Mongo7.0.39 ZIP, localhost 한정·임시 데이터 경로·WiredTiger cache0.25GB 설정으로 실행했고 종료했다. Windows 서비스/Docker 설치 및 운영 Atlas 접속은 없었다.

애플리케이션 코드는 이 후속 검증에서 바꾸지 않았다. 이전 Ruff/mypy88개 파일 검증 및 OpenAPI/Light 성공 계약 비교 결과는 유지된다. 원격 CI/컨테이너/카카오/브라우저 E2E는 미실행이다.

연동 확인: 로컬 실제 `.env`와 카카오 인증 설정4개가 없다. 이는 Railway 설정 조회 결과가 아니다. 이 checkout의 프론트는 기초 UI 데모이며 Kakao/Deep 호출과 `/api` 프록시가 확인되지 않아 담당자의 최신 프론트 코드/배포 URL이 필요하다. 준비 여부와 URL을 사용자에게 질문했다. 비밀키를 채팅에 요청하지 않았다.

1. 프론트 origin/프록시·카카오 앱 설정 확정. 비밀값은 채팅/Git에 넣지 않는다.
2. 사용자와 통합 브랜치·푸시 여부 확인 후 전용 Mongo/컨테이너 CI 실행. 현재 externally-managed detached HEAD이므로 운영 fix/gate1 브랜치를 임의 전환하지 않는다.
3. 두 계정 브라우저 시험 및 보관기간·상한·로그·IP 신뢰·삭제 복구·legacy 자료 점검.
4. 미완료 gate 해결 후 별도 승인으로 시험 배포/운영 활성화.
