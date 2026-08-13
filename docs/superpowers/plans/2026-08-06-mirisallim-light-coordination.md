# 미리살림 3분 모드 프론트엔드·백엔드 조정 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프론트엔드와 백엔드를 독립 트랙으로 개발하면서 API 계약과 통합 게이트에서만 동기화해, 각 영역의 책임과 진행률을 분명하게 유지한다.

**Architecture:** 백엔드는 `2026-08-06-mirisallim-light-backend.md`, 프론트엔드는 `2026-08-06-mirisallim-light-frontend.md`를 각각 따른다. 백엔드 OpenAPI 스냅샷이 유일한 공유 계약이며, 프론트엔드는 생성된 타입 외에 백엔드 DTO를 중복 선언하지 않는다.

**Tech Stack:** Backend: Python 3.11, FastAPI, Pydantic 2, PyMongo Async, MongoDB. Frontend: React 18, Vite, TypeScript, FSD, Tailwind CSS 3, Zustand, TanStack Query. Integration: OpenAPI, Playwright, GitHub Actions, Atlas, Railway, Vercel.

## Global Constraints

- 백엔드와 프론트엔드는 서로의 내부 파일을 import하지 않는다.
- 공유 계약은 `apps/frontend/openapi.json`과 생성된 `src/shared/api/schema.d.ts`뿐이다.
- API 변경은 백엔드 테스트·OpenAPI export·프론트 타입 생성 순서로 반영한다.
- 통합 게이트를 통과하기 전에는 다음 사용자 여정 단계로 넘어가지 않는다.
- 한 명이라도 미제출이면 네트워크 응답에 상대 데이터가 없어야 한다.

---

## 독립 트랙

### Backend Track

1. B1 실행 기반과 health
2. B2 질문 카탈로그와 OpenAPI
3. B3 MongoDB·토큰·세션 생성
4. B4 입력 저장과 제출
5. B5 초대·상태·알림
6. B6 결과 엔진과 공개 게이트
7. B7 만료·보안·속도 제한
8. B8 백엔드 CI·Atlas·Railway

### Frontend Track

1. F1 실행 기반·FSD·디자인 시스템
2. F2 OpenAPI 클라이언트·라우터
3. F3 랜딩·세션 시작
4. F4 질문 입력·자동 저장·제출·완료
5. F5 초대·대기·알림
6. F6 결과 화면
7. F7 공유 카드
8. F8 프론트 테스트·Vercel

---

## 권장 실행 순서

~~~text
B1 ── B2(OpenAPI v1 고정)
          ├────────────── F1 → F2
          ├── B3 → B4    F3 → F4
          ├── B5         F5
          ├── B6         F6 → F7
          └── B7 → B8    F8
                 ╲      ╱
                  통합 게이트
~~~

백엔드 B1~B2를 먼저 끝내 계약을 고정한다. 이후 백엔드 B3~B8과 프론트엔드 F1~F8은 독립적으로 진행하되 아래 게이트에서만 합친다.

---

### Gate 1: 계약 고정

**Consumes:** Backend B2.

- [ ] `python scripts/export_openapi.py`를 두 번 실행해 diff가 없는지 확인한다.
- [ ] 프론트 `api:generate`가 `schema.d.ts`를 생성하는지 확인한다.
- [ ] 세션, 질문, 입력, 초대, 상태, 결과 응답이 discriminated union과 오류 봉투를 포함하는지 확인한다.

### Gate 2: 세션·입력 연결

**Consumes:** Backend B3~B4, Frontend F3~F4.

- [ ] 랜딩 CTA가 실제 세션을 생성하고 `mrs_participant` 쿠키를 받는다.
- [ ] 질문 수가 3개인 테스트 버전에서도 진행률과 저장 배열 길이가 3이다.
- [ ] 새로고침 후 `GET /me/session`과 `GET /me/input`으로 입력을 복구한다.
- [ ] 제출 후 PATCH가 409이고 프론트가 읽기 전용으로 전환된다.

### Gate 3: 두 참여자 연결

**Consumes:** Backend B5, Frontend F5.

- [ ] 독립 브라우저 B가 초대 코드로 한 번만 참여한다.
- [ ] A와 B는 자신의 입력만 조회한다.
- [ ] 대기 화면은 3초 폴링하고 준비 완료 시 폴링을 중단한다.
- [ ] 인앱 알림은 상대 참여 후에만 가능하고 발신자별 24시간 1회다.

### Gate 4: 동시공개·공유

**Consumes:** Backend B6, Frontend F6~F7.

- [ ] A만 제출한 모든 결과 응답 키가 `status`와 `partnerCompleted`뿐인지 검사한다.
- [ ] B 제출 후 A와 B가 같은 공유 점수 `0..N`을 본다.
- [ ] 공유 카드 모델 키가 유형·태그라인·점수·질문 수·비율로 제한되는지 검사한다.
- [ ] PNG 문자열과 네트워크 요청에 금액 관련 키가 없는지 검사한다.

### Gate 5: 프로덕션

**Consumes:** Backend B7~B8, Frontend F8.

- [ ] GitHub Actions 백엔드·프론트엔드·E2E 검사가 모두 통과한다.
- [ ] Atlas에 유니크·TTL 인덱스가 존재한다.
- [ ] Railway `/health`가 200을 반환한다.
- [ ] Vercel에서 same-origin `/api` rewrite와 보안 헤더가 적용된다.
- [ ] 프로덕션 URL에서 Playwright 두 브라우저 스모크 테스트가 통과한다.

---

## 진행률 보고 형식

각 트랙은 독립적으로 다음 형식으로 보고한다.

~~~text
Backend: B3/8 completed, current B4
Frontend: F2/8 completed, current F3
Integration: Gate 1 passed, Gate 2 pending
Blockers: none
~~~

한 트랙의 지연은 다른 트랙의 내부 작업을 막지 않는다. 단, 필요한 통합 게이트가 통과되지 않으면 다음 사용자 여정 단계는 완료로 표시하지 않는다.
