# 우리 돈의 기준회의 — 추가 질문·동의·AI 해설 API

2026-09-04, C단계 로컬 구현. AI 어댑터는 연결했지만 기본 비활성이며 실제 유료 호출·운영 배포는 아직 없다.
기존 Deep v3 공동 리포트가 ready이고 양측 재무 공개가 유효해야 시작한다.
기본 경로: `/api/v1/deep/v3/sessions/{id}/meeting`.

## 서비스용 권장 흐름 (2026-09-05 추가)

개발자 점검용 개별 버튼 대신, **추가 답변 화면 하단 한 곳**에 서버가 반환한 동의 안내와 별도 선택을 배치한다.
상대 공개와 외부 AI 처리를 각각 기본 미선택으로 둔다. 중요한 안내를 전부 접힌 영역에 숨기지 않는다.
현재 기본 재무/가치관 공유는 기존 제출 때 확인하며, 새 추가 답변은 그 답변을 마칠 때 확인한다.
동의 횟수 감소를 이유로 앞으로 입력할 내용까지 포괄 동의로 취급하지 않는다.

1. 공동 결과가 ready이면 `GET /me`로 본인 추가 답변·질문·동의 문구를 펼친다. GET만으로 저장/생성하지 않는다.
2. 사용자가 답변과 공유/AI 선택을 확인하고 누르는 최종 버튼 하나가 `POST /complete`를 보낸다.
   AI 선택 시 “동의하고 AI 해설까지 보기”, 미선택 시 “선택한 범위로 마무리하기”로 안내한다.
3. 서버가 답변과 동의를 단일 CAS로 저장한다. 새 저장 revision은 한 번 증가하며, 잘못된 답변이면 둘 다 저장하지 않는다.
   같은 현재 revision의 답변·동의 선택이 이미 동일하면 재기록/캐시 삭제 없이 재사용한다. 오래된 revision은 여전히 409다.
4. 양측 최신 동의가 있고 유료 생성 설정/누적 한도가 유효하면 같은 요청의 연속으로 해설을 생성한다.
   응답의 `explanation`을 바로 표시한다. 먼저 완료한 쪽은 상대의 동의 여부가 드러나지 않는 `waiting`을 받는다.
5. 먼저 완료한 화면은 기존 공동 결과를 계속 이용하면서 `GET /explanation`으로만 결과를 확인한다.
   프론트 권장: 보이는 동안 5초 간격, 최대 60초. 숨김·로그아웃·철회·버전 오류·완료 때 중단한다.
   시간 초과 후 “결과 다시 확인”도 GET만 호출한다. POST 재시도/자동 재동의로 연결하지 않는다.

프론트 화면/폴링은 아직 이 API에 연결하지 않았다. 기존 분리된 저장/동의/생성 API도 호환 유지한다.
최신 스키마는 `apps/backend/openapi.json` 및 `apps/frontend/openapi.json`이다.

### POST `/complete`

```json
{
  "expectedRound": 1,
  "planVersion": 2,
  "expectedRevision": 0,
  "answers": {"contributionMeaning": "initialProposal", "adjustableMonthlyWon": 1000000},
  "consentVersion": "money-meeting-consent-v3",
  "shareWithPartner": true,
  "allowAiProcessing": true
}
```

버전은 GET 응답을 쓰고 bool은 현재 사용자의 선택을 쓴다. 예시 true를 기본값으로 쓰지 않는다.
응답은 `{ "own": OwnMeeting, "explanation": MeetingExplanation }`이다.
`own`은 저장된 본인 상태, `explanation`은 기존 ready/template/ai/waiting 계약이다.
AI 미선택·미준비는 waiting이어도 `/result`의 기존 공동 결과로 마칠 수 있다.
누적 예산 설정 전에는 저장은 되지만 신규 유료 생성은 template/budget_exhausted다.
오류나 응답 유실 뒤에는 GET `/me`와 `/explanation`으로 현재 상태를 확인한다. 저장은 성공하고 이후 생성/조회가 실패했을 수 있다.
409나 철회 후 이전 요청을 자동 재전송하지 않는다. 생성 전/저장 전/조회 시 권한과 버전을 재검사한다.

### 범위 주의

`money-meeting-consent-v3`는 월 공동비·분담뿐 아니라 최초 주거자금 부족일, 그 날짜의 필요·확정·예상 자금,
계획 후 월 잔액, 목표 월 적립 필요·부족액, 미정/조건 논의 필요 여부의 최소 근거를 허용한다.
원문 자산·대출 목록, 이름·계정·연락처·비공개 메모, 합의 원문은 AI에 보내지 않는다.
양쪽 모두 같은 v3에 동의해야 확장 범위를 사용한다. v2끼리는 기존 월 분담 해설을 유지하고 v2/v3 혼합은 waiting이다.
전체 공동 리포트와 `/meeting/guide`의 나머지 이슈를 AI 카드 세 개로 대체하거나 숨기지 않는다.
동의 UI 배치는 법적 적합성 인증이 아니며, 국외이전 고지/근거 등은 운영 전 별도 확인한다.

### GET `/guide`

AI 동의 없이 사용할 수 있는 읽기 전용 대화 지도다. `/result`가 먼저 ready여야 하며 아직 공개 리포트가 없으면 waiting이다.
`topics`는 공유가 허용된 전체 계산 쟁점과 가치관 차이를 우선순위순으로 보존한다. `priorityIds`는 처음 볼 최대 세 항목이다.
각 topic은 `whyItMatters`, 기존 저장 경로를 가리키는 `answerTargets`, 기준표의 `decisionTopic`, 관련 합의 ID를 제공한다.
`decisions`에는 현재 제안/양측 확인/보류, `reviewOn`, `terms`가 들어간다. GET만으로 합의나 입력은 바뀌지 않는다.
원래 입력을 바꾸려면 새 라운드가 필요하며, 기준표는 기존 `/agreements` 제안·수정·확인·보류 API를 사용한다.

## 프론트 호출 순서

기존 `mrs_account` 쿠키를 사용한다. 변경 요청에는 신뢰된 Origin이 필요하다.
리비전·질문 문구·동의 안내는 서버 응답을 사용하고, 체크박스는 기본 선택하지 않는다.

| 순서 | API | 의미 |
| --- | --- | --- |
| 1 | GET `/me` | 본인 답변·revision·질문 두 개·동의 안내 조회 |
| 2 | PATCH `/me` | 본인 추가 답변 저장. 본인 이전 동의가 해제됨 |
| 3 | POST `/me/consent` | 현재 답변의 상대 공유·외부 AI 처리 동의를 별도로 기록 |
| 4 | GET `/context` | 양측 답변/동의가 준비됐으면 근거와 추가 답변 조회 |
| 5 | GET `/explanation` | 저장된 해설 또는 기본 해설 조회. 모델 호출 없음 |
| 6 | POST `/explanation` | 사용자가 요청하면 현재 근거로 AI 생성. 같은 컨텍스트는 한 번만 시도 |
| 취소 | DELETE `/me/consent` | 현재 본인 동의 철회. 오래된 revision을 요구하지 않음 |

각 참여자가 자신의 계정으로 1~3을 수행한다. 타인 역할/ID를 요청 본문에 넣지 않는다.
`GET /me`는 상대의 추가 답변·revision·동의·완료 여부를 노출하지 않는다.

## 실제 질문 문구

1. **앞서 함께 쓸 돈으로 적은 내 금액은 어떤 생각으로 정했나요?**
   - `initialProposal`: 이 금액부터 이야기해 보고 싶어요
   - `selfReportedLimit`: 이번 대화에서 제안할 수 있는 최대 금액이에요
   - `unknown`: 아직 모르겠어요
2. **금액을 조정할 생각이 있다면, 이번 대화에서 어디까지 제안할 수 있나요?**
   - 선택 입력. `initialProposal`일 때만 입력하며 기존 제안 이상이어야 한다.
   - 모르면 `null`. 0원으로 대신하지 않는다. 제안 금액 자체가 미정이면 1번도 unknown만 허용한다.
   - 추가로 더 낼 금액이 아니라 월 총 최대 금액이다. 질문/선택지/helpText는 서버에서 받아 표시한다.

입력된 상한은 본인의 진술이지 지급 능력·공정성·합의의 판정이 아니다. 기존 분담/예산을 자동 수정하지 않는다.

## 요청 예시

다음 예시는 현재 round=1, planVersion=2, 본인 revision=0인 경우다. 숫자를 고정해서 사용하지 않는다.

PATCH `/me`:

```json
{
  "expectedRound": 1,
  "planVersion": 2,
  "expectedRevision": 0,
  "answers": {"contributionMeaning": "initialProposal", "adjustableMonthlyWon": 1000000}
}
```

성공 응답의 revision이 1이면 POST `/me/consent`:

```json
{
  "expectedRound": 1,
  "planVersion": 2,
  "expectedRevision": 1,
  "consentVersion": "money-meeting-consent-v3",
  "shareWithPartner": true,
  "allowAiProcessing": true
}
```

두 플래그는 별도 체크박스로 받고 현재 사용자 선택을 그대로 보낸다.
기존 v1은 외부 전송을 하지 않는다는 안내였으므로 v2로 재동의를 받아야 한다. GET `/me`의 현재 문구를 표시한다.
이전 v1 기록은 본인 조회에서 consent=null로 표시되고, v1 제출은 422로 거부된다. revision은 기존 값을 유지한다.
shareWithPartner=false, allowAiProcessing=true는 허용하지 않는다.
동의 성공 후에도 revision이 증가한다. 409가 나면 GET `/me`로 다시 확인하고 사용자에게 재확인을 받는다.
과거 동의 요청을 자동 재전송해서 최신 철회를 덮어쓰지 않는다.

## 결과 표시와 철회

양측 현재 답변·공유·AI 동의 중 하나라도 준비되지 않으면:

```json
{"status": "waiting"}
```

모두 준비되면 `status: ready`, `providerStatus: disabled | configured`, `brief`, `clarifications: {A, B}`가 온다.
**ready는 AI 설명 생성 완료가 아니라, 준비 데이터 조회 가능 상태다.**
brief의 숫자는 서버 계산 근거이고 clarifications는 사용자 추가 답변이다.
이 준비 응답에는 AI 문장이 없다. configured도 키의 유효성이나 잔액·품질을 검증했다는 뜻은 아니다.

### 해설 응답

`/explanation`도 양측 최신 동의 전에는 waiting만 반환한다. 준비 후에는 다음 구조다:

```json
{
  "status": "ready",
  "source": "ai",
  "reason": null,
  "brief": {"...": "context와 동일한 현재 서버 근거"},
  "cards": [{
    "issueId": "contribution_gap",
    "factIds": ["contribution_gap"],
    "explanation": "제시한 분담액과 공동 예산 사이에 공백이 있습니다.",
    "question": "각자의 제안 금액과 공동 예산 중 무엇을 조정할까요?"
  }]
}
```

brief 부분은 축약 예시다. 정확한 스키마는 생성 OpenAPI를 따른다.
숫자는 factIds가 가리키는 brief.facts의 valueWon으로 표시한다. AI 본문에서 수치를 추출하거나 계산하지 않는다.
카드는 최대 세 개이며, `no_issues`이면 빈 배열이다. 텍스트로 렌더링하고 HTML 삽입이나 자동 합의 저장을 하지 않는다.

| source / reason | 표시·동작 |
| --- | --- |
| ai / null | 검증된 형식의 AI 참고 해설. 의미적 진실까지 보장하지 않음 |
| template / disabled | AI 비활성. 서버 기본 해설 사용 |
| template / not_generated | 아직 생성하지 않음. 사용자가 생성 버튼을 누를 수 있음 |
| template / no_issues | 현재 추가 해설할 쟁점 없음. AI 호출 안 함 |
| template / pending | 다른 요청이 생성 중. 기본 해설을 표시하고 GET으로만 재조회 |
| template / budget_exhausted | 일일/누적 한도 부족 또는 새 완료 경로의 누적 설정 미완료. 기본 해설로 계속 이용 |
| template / provider_unavailable | 공급자 장애·거절·형식/근거 오류 등. 기본 해설로 대체 |
| template / interrupted | 완료 확인 불가 또는 시간 초과. 같은 컨텍스트는 재과금 방지를 위해 재시도 안 함 |

POST 요청 본문은 없다. 클라이언트가 모델·프롬프트·금액·역할을 선택해서 전송하지 않는다.
페이지 진입/새로고침/폴링은 GET만 사용한다. POST를 자동 재시도하지 않는다.
실패·한도 부족 시도도 현재 컨텍스트에서는 종료된다. 답변/합의 등의 실제 버전 변경 후 새 시도가 가능하며,
다음 날이 됐다는 이유만으로 같은 시도를 재실행하지 않는다. 오류를 우회하려고 자동 답변 수정·재동의하지 않는다.

- 본인 답변 수정은 본인 동의만 지운다. 상대 동의는 상대 자신의 변경 없는 답변에 대한 동의로 유지한다.
- 양측 동의 전에는 추가 답변을 공동 화면에 표시하지 않는다. 별도 동의를 거절해도 기존 공동 리포트는 유지된다.
- DELETE 성공 시 화면의 공유 준비 데이터와 해설도 즉시 비운다. 이후 조회는 waiting이 된다.
- 철회/수정이 겹친 조회는 409일 수 있다. 이전 ready 응답을 계속 표시하지 말고 다시 조회한다.
- 이미 상대가 확인한 정보는 회수할 수 없다. 브라우저 저장소·분석 로그에 추가 답변을 복제하지 않는다.
- 새 round/withdraw는 추가 답변·동의를 초기화한다. 만료/계정 삭제/심사용 방 reset 후에는 이전 세션을 재사용하지 않는다.

## 오류와 운영 경계

401 로그인 필요, 403 Origin 거부, 404 타인/잘못된 버전/기능 비활성,
409 리포트 미준비·재무 미공개·동의할 답변 없음·revision/round/plan 충돌,
410 만료·종료·삭제 또는 초기화된 체험방, 422 입력/동의 버전/상한 오류.
API는 검증 오류에 원래 자유 JSON 내용을 반사하지 않는다.

공식 SDK·캐시·생성 시도 원장·일일 예약 한도는 구현했다. 설정은 [운영 안내](deep-meeting-operations.md)를 따른다.
실제 AI 품질 평가·실 Mongo 동시성 검증·UI·운영 검증은 별도이며 활성화 전 필요하다.
현재 구현은 참고 대화 도구이지 금융 능력·공정성·합의의 판정기가 아니다.
