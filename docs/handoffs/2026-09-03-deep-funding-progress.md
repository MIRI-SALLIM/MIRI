# 딥모드 재원 연결 — 1차 구현 인계

## 범위와 상태

사용자가 [최종 질문 파이프라인](../superpowers/specs/2026-09-03-deep-question-pipeline-final-design.md)의 구현을 승인했다. 먼저 보증금·대출·실제 투입자금 연결을 [실행 계획](../superpowers/plans/2026-09-03-deep-funding-foundation.md)에 따라 구현했다. 브랜치는 기존 `fix/gate2-openapi-contract`이며 이번 변경은 로컬 작업공간에 있다. 커밋·push·운영 배포는 하지 않았다.

**이 단계는 재원 엔진 + 본인이 제공한 입력의 미리보기 API다. 전체 딥모드 질문 파이프라인·신버전 세션 저장·공동 결과까지 구현된 것은 아니다.**

## 구현

- `apps/backend/deep/funding_models.py`: 독립적인 재원·채무·분할 상환 이벤트·납부일 모델. 기존 Amount/Money와 입력 상태를 재사용한다. 중복 ID, 잘못된 참조, 상환·배정 초과, 안전 정수 합산 한도를 검증한다.
- `apps/backend/deep/engine/funding.py`: 출처별 순재원과 시점별 부족액. 예상 재원을 기본 확보액에서 제외하고 별도 비교값으로 반환한다. 과거 입금 예정이 미수령 상태면 확인 전까지 제외한다.
- `POST /api/v1/deep/funding/preview`: 로그인/Deep 활성화/신뢰 Origin/사용자·IP 요청 제한을 재사용. 전달된 본문만 계산하며 저장된 상대 정보·세션·리포트를 읽거나 생성하지 않는다. 요청 제한을 위한 카운터 쓰기는 기존 저장소를 이용한다.
- backend/frontend `openapi.json`: 기존 exporter로 생성. 프론트 UI와 기존 v2 입력·계산·공동 공개·라운드 계약은 변경하지 않았다.

## 프론트 계약

- POST 본문은 OpenAPI의 `FundingPreviewRequest`. `asOf`는 입력 기준일이다. 계획에서 아직 지출하지 않은 자금·미지급 비용·앞으로 갚을 채무를 입력한다. 완료된 상환·이미 낸 비용을 현재 잔액에서 다시 빼지 않는다.
- `sources[].grossAmount`는 본인 몫의 사용 예정 총 재원(상환 차감 전), 집에 투입할 배정액은 `housingAllocationWon`. 목표/비상금 배정은 각각 별도이며 미배정 금액은 집 자금으로 자동 사용하지 않는다.
- 같은 실제 재원은 하나의 source ID로 유지한다. 받은 지원금을 현금과 지원금으로, 매도된 자산을 매도대금과 원래 자산으로 이중 등록하지 않는다. 서로 다른 ID로 거짓/중복 입력한 실제 자산을 자동 식별·검증하는 은행 연동은 없다.
- `settlements[].parts`를 쓰면 그 합은 해당 상환액과 같아야 한다. 빈 parts는 재원이 아직 연결되지 않은 별도 상환 유출이다. 상환액 모름이면 parts도 빈 목록으로 두며 정확한 상환 후 순재원은 산출하지 않는다.
- `deadlines[].amount`는 회차별 지급액이며 누적 합계가 아니다. 계약금·잔금·일회성 비용을 중복 없이 각 날짜에 입력한다.
- 금액·날짜·상태가 모르면 해당 unknown/null을 보존한다. 컬렉션에 항목이 있으면 Status는 known이어야 하며 개별 금액은 unknown일 수 있다.
- 응답 `ruleVersion=deep-funding-v1`, `audience=private_input_preview`. 이것은 v3 세션 생성이나 공동 공개 버전을 뜻하지 않는다. 사용자가 입력한 가정은 실제 금융 확인 자료가 아니다.
- `timeline[].availableForHousingWon`: 해당 날짜까지 집/상환용으로 사용 가능한 재원에서 도래한 상환을 뺀 금액. 집값 지급까지 뺀 최종 현금 잔액은 아니다. 이후 상환용으로 묶어둔 금액은 미리 주거비로 쓸 수 없다.
- `fundingGapWon`: 자기보고한 현재 사용 가능/확인된 예정 재원 기준 부족액. `includingExpectedGapWon`: 예상 재원까지 들어온다는 가정의 비교. 두 값은 서로 다른 가정이고 더하지 않는다.
- `status=partial`, `missingFields`, `assumptions`를 함께 표시한다. 필요 금액이나 상환을 모르면 해당 시점의 정확한 gap은 null이다. 미래 날짜가 알려진 미정 상환액 때문에 그 이전에 계산 가능한 부족액을 숨기지 않는다.
- `issues[].message/question`은 바로 사용할 한국어 문구다. 모든 날짜별 이슈를 보존한다. 누적 부족액 행들을 합산하지 않는다.
- 응답은 본인 미리보기로만 사용한다. 상대에게 자동 전송하거나 기존 공동 결과 화면에 동의 없이 붙이지 않는다.

## 검증 증거

- 기존 기준 테스트: models/housing/report 43 passed.
- 신규 테스트: 재원 단위 33개 + 실제 TestClient 라우트 10개 = **43 passed**. 새 기능 미구현 상태의 실패, 이후 경계 사례 실패와 수정 후 통과를 확인했다.
- 전체 로컬: `.venv/Scripts/python.exe scripts/test_local.py -q` → **352 passed / 16 skipped / 11 warnings**. 기존 deprecation 계열 경고이며 경고를 숨기지 않았다.
- Ruff 전체 통과. mypy `main.py schemas.py services auth deep tests scripts` → **107 source files 통과**.
- OpenAPI 2회 생성 결과 동일, backend/frontend 양쪽 재생성 완료.
- 16 skip은 기존 실Mongo/HTTPS 등 외부환경 테스트다. 새 변경의 원격 CI·실Mongo·브라우저·운영 배포 검증으로 주장하지 않는다.
- 계산 리뷰에서 출처 도착 날짜 누락, 미정 상환의 순재원 과대 표시, 미래 미정 상환이 앞선 시점까지 막는 문제를 재현하여 수정했다. 별도로 미래 상환 예약금이 현재 주거비에 쓰이는 문제도 실패 테스트 후 수정했다.
- API 리뷰에서 임의 JSON 키가 검증 오류의 fieldErrors에 반사되는 문제를 재현했다. 새 미리보기 경로에 한해 `INVALID_FUNDING_INPUT` 일반422로 변환한다. 최상위/재원/금액 하위 키3종 실패→통과를 확인했다. 기존 타 경로의 오류 계약은 변경하지 않았다.
- 재리뷰: 엔진 및 API 범위 내 미해결 Important/Critical 없음.

## 남은 순차 구현

1. 새 세션/동의/입력 버전의 저장 계약을 정하고 재원 입력·질문 분기를 연결한다. 기존 v2 세션은 계속 동일한 계약으로 처리한다.
2. 공동비 범위·본인 분담·상대 기대·수용 조건 저장과 분석을 구현한다.
3. 공개 조건을 통과한 새 공동 리포트에 재원·분담·미확정·미합의 이슈를 연결하고 구조화된 기준표를 완성한다.
4. 전체 질문 카탈로그·대안 시나리오·프론트 fixture를 완성하고 두 계정 여정을 검증한다.

AI·정책 매칭·숫자형 Say-Do는 이번 단계에 넣지 않았다. 실제 카카오 E2E와 Railway 운영 활성화도 별도 범위로 남아 있다.
