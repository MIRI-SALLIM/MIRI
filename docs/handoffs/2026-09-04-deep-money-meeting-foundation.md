# 우리 돈의 기준회의 — A단계 구현 인계

2026-09-04. 로컬 브랜치 `codex/deep-money-meeting`, 기준 `develop`의 PR #40 병합 `a62efe9`.
설계: [AI 해설 제품 설계](../superpowers/specs/2026-09-04-deep-money-meeting-design.md).
실행 계획: [A단계 계획](../superpowers/plans/2026-09-04-deep-money-meeting-foundation.md).

## 현재 구현

- `apps/backend/deep/meeting/brief.py`: 실제 v3 공동 리포트에서 월 예산·제시한 분담·상대 기대 차이만 투영한다.
  양측 재무 공개 및 별도 AI 동의가 모두 없으면 거부한다. 이는 서버가 도출한 권한을 받는 내부 함수이며
  아직 실제 동의 저장이나 인증 경로에 연결되지 않았다.
- `comparison.py`: 같은 항목·시작월에 한해 기존/변경 예산과 A/B 분담, 부족액·초과액·증감을 계산한다.
  저장된 계획·합의를 수정하지 않으며 지급 능력·공정성·합의를 판정하지 않는다.
- `models.py`, `explanation.py`: 최대 세 카드의 구조, 쟁점별 근거 ID, 중복, 글자 수, 숫자 문자를 검사한다.
  숫자는 서버 근거로 표시하도록 분리했다. 문장의 의미적 진실성이나 안전성까지 검증한 것은 아니다.

예산 200만 원·A/B 제안 80/80만 원이면 부족액 40만 원이다.
예산 180만 원·A/B 제안 100/80만 원으로 비교하면 부족액은 0원, 예산 증감은 -20만 원,
A 분담 증감은 +20만 원이다. 이는 사용자가 넣은 안의 산술 비교이지 자동 추천이나 합의가 아니다.
기대 분담액과 제안의 차이는 별도 쟁점이며 부족액에 더하지 않는다.

## 코드 확인으로 반영한 예외

기존 `Evidence.block`은 부족액이 계산 불가이면 알려진 금액이 남아 있어도 `unavailable`을 반환한다.
명시적 차단 reason이 없고 미정 입력에 대응하는 missingFields가 있을 때만 알려진 근거를 활용한다.
비공개/범위 초과 reason, data 부재, 원인 불명의 unavailable은 거부한다. 기존 엔진은 변경하지 않았다.

## 검증

`apps/backend`에서 합성 입력과 기존 계산 엔진을 사용했다. MongoDB·외부 AI·운영 계정은 사용하지 않았다.

```powershell
.\.venv\Scripts\python.exe scripts/test_local.py tests/unit/test_meeting_brief.py tests/unit/test_meeting_comparison.py tests/unit/test_meeting_explanation.py tests/unit/test_deep_v3_analysis.py tests/test_deep_openapi.py -q
```

결과: **88 passed**, 기존 Starlette/httpx deprecation warning 1개.
새 테스트는 67개이고 기존 v3 분석/OpenAPI 회귀 21개를 함께 검증했다.
모듈 생성 전 대표 테스트 세 개의 import 실패(RED)를 확인한 뒤 구현했다.
추가 버전 테스트 작성 중 실제 필드명 `consentVersion`과 다른 이름을 쓴 테스트 오류를 수정했다.
Ruff 및 `mypy deep/meeting` 통과. 전체 테스트·실DB·브라우저·실제 모델 품질 검증은 이번 실행 범위가 아니다.
별도 읽기 전용 코드 리뷰에서 A단계 범위의 실질적 결함은 발견되지 않았다.
추적 파일 diff 및 새 파일 공백 검사를 수행했고 변경은 새 내부 모듈·테스트·설계/인계 문서로 제한했다.

| A단계 요구 | 검증 위치 |
| --- | --- |
| 동의 기본 거부·미정/0원·비공개/자유문구 제외·버전·산술 일관성 | `test_meeting_brief.py` |
| 같은 항목/월·증감·미정 전파·안전 정수·합계 초과 | `test_meeting_comparison.py` |
| 구조 제한·다른 쟁점 인용·없는 근거·중복·숫자 문자 차단 | `test_meeting_explanation.py` |
| 기존 계산 및 공개 API 계약 유지 | `test_deep_v3_analysis.py`, `test_deep_openapi.py` |

## 다음 작업과 출시 경계

1. **B단계:** 추가 질문/답변·AI 동의 저장과 버전, 참여자 권한, 철회/만료/초기화 연동,
   생성·조회 계약. 외부 모델을 호출하지 않는 통합 테스트부터 작성한다.
2. **C단계:** API 키를 안전하게 설정하고 유료 호출 승인 후 OpenAI 연결.
   버전 캐시·중복 생성 잠금·일일 비용 상한·타임아웃·템플릿 대체·실제 사용량 측정을 구현한다.
3. **D단계:** 프론트 연결 및 합성 사례로 실제 해설 품질·금융 표현·개인정보·장애 동작을 검증한다.

현재 A단계는 HTTP API, AI 호출, 추가 질문 저장, 실제 동의 저장, 캐시, 합의 연결이 없다.
모델이 생성한 사용자 해설도 아직 없다. OpenAPI·프론트·환경변수·의존성·배포 설정은 변경하지 않았다.
유료 호출·원격 푸시·커밋·배포를 하지 않았으므로 운영 서비스의 AI 활성화로 안내하지 않는다.
