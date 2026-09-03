# Deep v3 Release Verification Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task with verification checkpoints. 기존 연결 작업의 제품 설계를 변경하지 않는 검증 단계다.

**Goal:** 사용자 요청의 1번인 실제 DB 검증을 완료하고 2번 배포와 3번 프론트 연결로 넘어갈 근거를 확보한다.

**Architecture:** 기존 GitHub Actions `deep-mongo`의 mongo:7 격리 서비스를 재사용한다. 새 v3 저장/CAS 사례를 실행 목록에 넣고 기존 실제 HTTPS 심사용 여정을 v2/v3와 공개 동의4조합으로 실행한다. 원격 CI 실행에는 fix2 커밋·푸시가 선행되어야 하지만 CI 통과 전 Railway 배포는 하지 않는다.

**Tech Stack:** FastAPI, PyMongo, pytest, httpx, Uvicorn TLS, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-03-deep-question-pipeline-final-design.md`; 구현 계약 `docs/deep-v3-api.md`.

## Global Constraints

- 운영 Atlas URI·계정 비밀번호를 조회/사용/출력하지 않는다. 임시 UUID DB, 합성 계정, 별도 cookie jar와 기존 environment whitelist를 유지한다.
- 로컬 Docker/Mongo 설치 없이 기존 원격 검증 환경을 사용한다.
- 사용자 승인 범위는 실DB 검증→fix2 커밋·푸시/배포→프론트 연결이다. 강제 푸시, develop/main 병합, 요금제 변경은 포함하지 않는다.
- 이전 단계의 v2/v3 분리·별도 공개 동의·불변 report 계약을 변경하지 않는다.
- 새 프론트 UX는 실제 저장소/승인된 디자인을 확인하는 별도 단계다. 이 검증 계획으로 임의 디자인 완료를 주장하지 않는다.

## Task 1: v3 실DB·HTTPS 검증 포함

Files: `.github/workflows/backend.yml`, `apps/backend/tests/integration/test_reviewer_https_mongo.py`; 기존 `test_deep_v3_mongo.py`, `tests/https_mongo_support.py`를 재사용한다.

- [x] 기존 Mongo job에 `tests/integration/test_deep_v3_mongo.py`를 추가한다. 같은 명령의 v2/Light 회귀 파일은 유지한다.
- [x] 실제 HTTPS 여정을 `version in [deep-v2,deep-v3]`, 동의 `(true,true),(false,true),(true,false),(false,false)`로 parameterize한다. v3만 `/api/v1/deep/v3`, `v3_input/v3_plan`, `deep-sharing-v2`, 구조화된 terms를 쓴다.
- [x] v3 공동비200만/각80만이면400000원 공백, 양쪽100만으로 확인하면 operatingStatus 공백0, 당시 report는400000을 유지하는지 검사한다. 동의 거절의 재무 planning 비공개, 개인 메모 제외, 수정 시 양쪽 확인 초기화, reset 후 접근 차단 및 artifact TTL 상한을 확인한다. 승인된 reviewer 설계에서 reset은 즉시 물리 삭제가 아니다.
- [x] 로컬 `python scripts/test_local.py -q`, Ruff, mypy, Linux 대상 mypy를 수행한다. 실DB skip은 결과에 구분한다.

## Task 2: fix2 게시와 원격 증거 수집

Files: 위 변경 + 이전 v3 구현 변경 전체. `.reviewer-credentials.local`·실제 env 파일은 제외한다.

- [x] `git diff --check`, 명시적인 변경 목록, 원격 fix2 SHA 및 fast-forward 가능 여부 확인.
- [x] 검증된 파일을 commit하고 `git push origin HEAD:refs/heads/fix/gate2-openapi-contract` 실행. PR·다른 브랜치 merge 없이 현재 작업 트리를 유지한다.
- [x] 해당 SHA의 Backend CI quality/container/deep-mongo job 종료 결과를 확인한다. 실패하면 원인을 재현하고 필요한 수정·재검증만 수행한다.
- [x] deep-mongo의 실제 pass/skip 수와 CI URL을 인계에 기록한다. 이것은 CI HTTPS API 검증이며 Railway/브라우저 E2E 완료가 아니다.

증거: `acb5a69`의 [Backend CI](https://github.com/MIRI-SALLIM/MIRI/actions/runs/33763081943) 전체 성공. 실Mongo/HTTPS 26 passed, 0 skipped; quality 386 passed, 22 skipped; Ruff/mypy 및 Docker build/context privacy 통과. 초기 reset 테스트의 즉시 삭제 기대를 승인된 접근 철회+TTL 계약에 맞춰 수정한 뒤 재검증했다.

## 이후 순서

CI 성공 뒤 현재 Railway 소스 브랜치·환경/공개 도메인을 확인하고 fix2 코드를 배포한다. 운영 로그인 활성화에 필요한 설정이나 사용자 선택이 없으면 그 경계를 보고한다. 사용자는 딥모드 프론트가 아직 없으므로 토큰·작업량을 줄이는 방향을 선택했다. 따라서 3번은 기존 API 문서·요청 JSON 전달로 제한하고, 새 프론트 UI 작성과 develop 병합은 하지 않는다.
