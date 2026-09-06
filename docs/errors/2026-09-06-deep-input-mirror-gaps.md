# 딥 입력 서버 검증자와 Zod 미러의 판정 불일치

- 작성일: 2026-09-06
- 관련: 이슈 #84, PR #89, 커밋 `d6cfbac`, `83d15c7`

## 무엇이 잘못됐나

`DeepInputV3`와 `SharedPlanV3` 미러가 서버가 거부하는 입력을 통과시켰다. 특히 건너뛴 질문에 답이 함께 있거나, 자산·부채·제약·정산 source ID가 중복되거나, 허용되지 않은 지출·문맥·질문 키를 보내는 경우 저장 직전 필드 정보를 얻을 수 없었다.

서버 모델에 동일한 JSON 페이로드를 넣는 Python 대조 명령으로 재현했다. 이슈의 12개 불일치 외에 `ASSET_ALLOCATION_EXCEEDS_KNOWN_BALANCE`와 `UNSAFE_FUNDING_TOTAL`도 추가로 확인했다.

## 원인

- **설계적 원인**: OpenAPI 생성 타입은 `propertyNames.enum`을 인덱스 시그니처로 생성해 키 집합을 표현하지 못한다. 타입 동치 단언만으로는 서버 후검증자 드리프트를 발견할 수 없었다.
- **코드적 원인**: `schema.ts`가 지출·문맥·답변·공동비를 임의 문자열 레코드로 두었고, 배열 중복·skip/answer 충돌·후정산 부채 참조·안전 합계를 후검증하지 않았다. v3에서 다른 funding 구조로 표현하는 자산 배분과 정산 처분도 요청 미러가 허용했다.

## 해결

입력 미러에 서버와 같은 고정 키 집합, 중복 검사, skip/answer 충돌 검사, 제약·후정산 참조 검사, 정산 source 중복 검사를 추가했다. `SharedPlanV3`에는 CommonCategory 키 제한과 `UNSAFE_COMMON_BUDGET`을 추가했다.

v3에서 자산 배분은 `funding.sources`, 부채 처분은 `funding.settlements`가 정본이므로 자산 배분 필드와 `disposition: "settle"`를 미러 타입에서 각각 `0`·`"keep"`으로 좁혔다. 생성된 OpenAPI 타입은 이 의미상 좁힘을 표현하지 못하므로 type-test는 미러가 API 요청 타입의 부분집합임을 확인하는 동시에, 의미상 좁힌 `assets`·`debts`를 제외한 API→미러 역방향 할당과 top-level/선정 중첩 키 집합도 고정한다.

합산 판정은 JavaScript `number`의 안전 정수 경계를 넘을 수 있어 `BigInt`로 수행했다. `V3_ID_TOO_LONG`은 서버와 같이 재원·정산·부채 ID에 62자 제한으로 미러링했으며, 자산·제약 ID는 공통 `FundingId`의 64자 제한을 유지해 과잉 거부를 피한다.

## 재발 방지

서버 모델에 직접 실행한 판정 결과를 기대값으로 삼는 회귀 테스트를 입력·계획 스키마 옆에 추가했다. 다음 검증에서는 OpenAPI 타입만 보지 말고 서버 `model_validator`·키 타입·실행 결과를 함께 대조하며, 파생 합계에는 언어별 정밀도 차이가 없는지 확인한다.
