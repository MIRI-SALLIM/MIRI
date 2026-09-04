# Deep v3: 입력 → 공동 분담 → 리포트

> 2026-09-04 후속: [우리 돈의 기준회의 추가 질문·동의 API](../../../docs/deep-meeting-api.md)가 로컬에 추가되었다.
> `04-openapi.json`은 이 경로를 포함하도록 재생성했다. 아래 기존 입력 예제는 그대로 사용할 수 있다.
> 추가 질문·동의 v2·AI 생성/조회 API와 기본 해설 대체까지 로컬 구현했다. AI는 기본 비활성이며 실제 모델 품질·프론트 화면·운영 배포 완료는 아니다.

> 프론트 전달본 · 2026-09-04 · 기준 커밋 `9ef2213` · 원본 `docs/deep-v3-api.md`.
> 읽는 순서: [01 질문 설계](01-question-pipeline.md) → 이 연결 가이드 → [03 가상 요청 예제](03-request-examples.json) → [04 API 명세](04-openapi.json). JSON 2개는 원본과 동일한 스냅샷이며 자동 갱신되지 않는다.
> 심사용 로그인은 로컬 임시 저장소와 별도 브라우저 A/B에서 확인했다. **운영 인증 활성화·실제 카카오 검증·프론트 전체 연결은 미완료**이며 프론트 2차 수정본 이후 진행한다. 계정 비밀번호·해시·API 비밀키는 이 묶음에 포함하지 않는다. AI 해설은 후속 로컬 구현 상태이며 정책 매칭은 미구현이다.

이 문서는 새 백엔드 연결 계약이다. 프론트 화면 구현·운영 배포 완료를 의미하지 않는다.

2026-09-03 상태: [Railway API 서버](https://mirisalim-backend-production.up.railway.app)에 v3 코드는 배포됐지만 **Deep·심사용 로그인은 운영 설정 전으로 비활성(404)**이다. 예제 기반 UI 작업은 가능하며 실제 인증 연결은 프론트 origin 확정 후 진행한다. 검증 근거와 남은 설정은 [최신 배포 인계](https://github.com/MIRI-SALLIM/MIRI/blob/9ef22135757b70b9db9bce17e06e23893bd02703/docs/handoffs/2026-09-03-deep-v3-release-progress.md)를 참고한다.

## 시작과 인증

- 새 세션 API 기준 경로: `/api/v1/deep/v3`. 기존 `/api/v1/deep` 세션은 v2로 유지한다. 기존 세션을 자동 변환하지 않는다.
- 기존 실제 계정 쿠키 `mrs_account`가 필요하다. 카카오 또는 활성화된 심사용 로그인으로 발급한 세션을 사용한다. Light 쿠키로는 접근할 수 없다.
- 변경 요청은 기존 `Origin` 검사를 유지한다. 생성/초대 수락은 `Idempotency-Key`도 필요하다. 다른 출처 프론트의 브라우저 쿠키 연결은 기존 인증 계약에 따라 별도 검증한다.
- `deep-v3 / deep-rules-v2 / deep-copy-ko-v2 / deep-sharing-v2`를 세션에 고정한다. 구버전 동의로 제출하거나 서로 다른 버전의 경로로 접근할 수 없다.

## 호출 순서

모든 `{id}`는 생성한 세션 ID다. 역할 A/B는 서버가 정하고 응답으로 알려준다.

| 순서 | 경로와 메서드 | 주의점 |
|---|---|---|
| 1 | `POST /sessions` `{}` | 세션·초대 코드 생성 |
| 2 | `POST /invitations/{code}/join` `{}` | 다른 계정으로 수락 |
| 3 | `GET /sessions/{id}/me/input` | 본인 초안만 반환 |
| 4 | `GET /sessions/{id}/plan`, `PATCH …/plan` | 공동비 범위·납부 일정·계획 입력. expectedVersion 필요 |
| 5 | `GET /sessions/{id}/me/questions` | 가치관 D1~D10, 분담 C1~C6와 본인 입력 기반 후속 질문 |
| 6 | `PATCH /sessions/{id}/me/input` | expectedRevision과 input 전체 전달 |
| 7 | `POST /sessions/{id}/plan/confirm` | 양쪽 각각 현재 planVersion 확인 |
| 8 | `POST /sessions/{id}/me/submit` | 양쪽 각각 제출과 새 공개 동의 |
| 9 | `GET /sessions/{id}/result` | 아직 조건 미충족이면 waiting, 충족하면 ready |
| 10 | `POST /sessions/{id}/agreements` | 구체적인 공동 기준 제안 |
| 11 | `POST …/agreements/{agreementId}/confirm` | 양쪽이 동일 expectedVersion 확인해야 agreed |

`PATCH input`은 JSON 부분 병합 API가 아니다. GET한 본인 초안에 변경 필드를 병합한 뒤 input 전체를 전송한다. 409이면 다시 읽고 충돌을 해결해야 하며 오래된 입력으로 덮어쓰지 않는다. 한쪽 제출 뒤에는 공동 계획과 그 사람 입력을 잠근다.

실제 모델 검사를 통과하는 [요청 JSON 예제](03-request-examples.json)와 전달 기준의 [OpenAPI](04-openapi.json)를 제공한다. 값은 모두 가상 데이터·원 단위이며 예제 날짜는 2026년 9월 기준이다. 다른 시점에는 재원 기준일·시작월·납부일을 함께 변경한다.

## 저장 원칙

- `Amount`: `{"status":"known","value":800000}` / `{"status":"unknown"}` / `{"status":"withheld"}`. 모름·비공개와 known 0은 다르다. 추정액은 precision=`estimate`로 보낸다.
- 기존 `assets`는 보유 자산, `funding.sources`는 그중 계획에 사용할 본인 지분이다. 자산 재원은 동일한 id·kind로 연결한다. 기존 assets의 housing/goal 배정은 0으로 두고 새 funding 원장에만 배정한다.
- 기존 `debts`는 잔액·월 상환의 단일 원장이다. v3에서는 기존 disposition=`keep`을 유지하고 상환 예정은 `funding.settlements`에 기록한다. `debtId` 및 `parts[].sourceId`가 연결돼야 한다.
- 일부 상환 후 월 납입액은 `afterSettlementMonthlyPayments[debtId]`에 입력한다. 모르면 변경 후 여유자금을 확정하지 않는다. 전액 상환도 실제 이행한 사실이 아닌 입력한 계획에 따른 가정이다.
- `fundingDeadlines[].amount`는 **해당 회차 납부액**이다. 누적액을 각 회차에 넣지 않는다. 알려진 일정 총액은 주거가격+일회비용과 일치해야 한다. 일정이 없으면 주거 부족액 계산을 표시하지 않는다.
- 공동 집값·납부 일정·신규 공동 주거대출은 plan에서 한 번만 입력한다. 이미 공동 대출에 넣은 차입을 개인 source에 중복 기재하면 안 된다. 서로 다른 ID로 같은 실제 재원을 반복 입력하는 행위는 은행 데이터 없이 검증할 수 없다.
- 공동 생활비 목표(`commonExpenses`)와 현재 지출(`fixedExpenses/variableExpenses`)은 목적이 다르다. 현재 지출을 임의로 재분류하거나 공동 계좌 이체를 추가 지출로 차감하지 않는다.

## 질문과 결과 문구

C1 본인 월 분담액, C2 상대에게 기대하는 월 분담액, C3 본인 주거자금 투입액, C4 개인 지출·저축 최저액, C5 수용 조건, C6 기존 대화 상태를 묻는다. `believeAgreed`는 한 사람의 인식이며 합의 완료로 취급하지 않는다. 현재 카탈로그는 가치관·분담 및 일부 조건부 질문이고 최종 기획의 모든 재무 입력 화면을 구현한 것은 아니다.

예제처럼 공동비 200만 원, 각자 제안 80만 원, 상대에게 기대한 금액 120만 원이면:

> 입력 당시 공동비 2,000,000원에 제시한 분담액은 합계 1,600,000원입니다. 400,000원의 분담이 비어 있습니다.
>
> 각자의 분담액과 공동비 예산 중 무엇을 조정할까요?

기대 차이 40만 원은 양방향으로 따로 보여주며 분담 공백에 더하지 않는다. 공동 주거비가 명시한 한도를 넘으면 초과액과 조정 질문을 제공한다. 차이를 잘못·성격·관계 등급으로 판정하지 않는다.

`ready`는 다음을 분리한다.

- `report`: 제출 당시의 불변 분석. cashflow / housing / goal / planning / values 블록.
- `report.issues`: 전체 계산 이슈. 누적 부족액들을 합계로 표시하지 않는다.
- `report.topics`: 최대 3개 시작 질문. 납부일 자금·월 적자 → 계산 불확실 → 분담 공백·조건 → 기준 논의 → 가치관 차이 순. 같은 순위는 날짜·중요 영역·고정 코드 순.
- `agreements`: 현재 제안·확인·보류 상태.
- `operatingStatus`: 현재 양쪽이 확인한 월 분담안. 당시 의사에 따른 report.planning 공백을 덮어쓰지 않는다.

두 사람이 각각 100만 원으로 같은 범위·시작월의 분담안을 확인하면 operatingStatus의 공백은 0원이지만 report.planning의 당시 공백 40만 원은 그대로 남는다. 정확히 같은 `commonScope`(고정 카테고리 목록)와 `startMonth`일 때만 전체 공동비 대비 공백을 비교한다. 자유문장 scope를 해석해서 비교하지 않는다. 서로 다른 범위/월/미기입이면 합의 상태는 유지하되 공백은 null. 복수의 확인된 월 분담안은 conflicting이다.

## 공개·재작성·철회

- 양쪽 재무 공개 동의가 있어야 재원·분담·조건 등 재무 분석을 제공한다. 한쪽이라도 거절하면 해당 블록은 unavailable/data=null. 가치관은 별도 양측 동의로 제공한다.
- 비공개 개인 메모는 공동 결과·후속 질문에 자동 복사하지 않는다. 합의 text/terms는 처음부터 상대에게 공개할 공동 문서다.
- `/agreements/{agreementId}` PATCH는 양측 확인을 지우고 버전을 올린다. `/defer`도 버전이 바뀐다. 응답의 최신 version으로 작업한다.
- 양쪽 `POST …/rounds` `{expectedRound}` 후 새 라운드. 입력 초안·질문 버전은 유지하되 제출·동의·계획 확인을 다시 받는다. 이전 라운드 리포트·합의는 현재 결과로 노출하지 않는다.
- `POST …/withdraw` `{}`는 종료와 리포트·합의 정리를 수행한다. 정리 실패 때 재시도 가능하다.

## 현재 계산의 경계

새 월 참고 예산은 자동 15% 절감 없이 현재 비주거 지출을 유지한다. 상세 개인비/공동비 재분류, 모든 조건의 수학적 최적화, 신규 개인 차입의 월 조건 모델, 월별 장기 상환 시나리오까지 완성한 것은 아니다. unknown은 계산 불가/부분 결과로 남긴다. 목표 적립 가능이나 월 흑자로 초기 주거자금 부족이 해결됐다고 판단하지 않는다. 정책 매칭·AI 해설·숫자형 Say-Do 판정은 이번 연결에 포함하지 않는다.
