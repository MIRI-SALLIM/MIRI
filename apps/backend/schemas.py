from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

# ==========================================
# 공통 오류 응답 스키마 (Unified Error Envelope)
# ==========================================

class ErrorDetail(BaseModel):
    code: str = Field(
        ..., 
        description="오류 식별 코드", 
        json_schema_extra={"example": "QUESTION_SET_NOT_FOUND"}
    )
    message: str = Field(
        ..., 
        description="오류 상세 메시지", 
        json_schema_extra={"example": "요청한 버전의 질문 세트를 찾을 수 없습니다."}
    )
    fieldErrors: dict[str, list[str]] = Field(
        default_factory=dict, 
        description="필드별 유효성 검증 오류 맵 (선택적)",
        json_schema_extra={"example": {}}
    )

class ErrorResponse(BaseModel):
    error: ErrorDetail = Field(..., description="오류 세부 정보 객체")

class HealthResponse(BaseModel):
    status: str = Field(..., description="서버 상태", json_schema_extra={"example": "ok"})
    database: str = Field(..., description="데이터베이스 연결 상태", json_schema_extra={"example": "connected"})
    message: str | None = Field(
        None, 
        description="상태 안내 메시지", 
        json_schema_extra={"example": "미리살림 백엔드 서버 및 데이터베이스가 정상 가동 중입니다."}
    )


# ==========================================
# 선택적 보기 및 질문 세트 스키마
# ==========================================

class QuestionOption(BaseModel):
    label: str = Field(..., description="선택지 표시 라벨 문구", json_schema_extra={"example": "200~300만원"})
    value: str | int | float = Field(..., description="선택지 고유 식별값", json_schema_extra={"example": "200_300"})
    rep: float | None = Field(None, description="구간 대표값 (만원 단위 또는 척도 점수)", json_schema_extra={"example": 250.0})
    description: str | None = Field(None, description="선택지 부가 설명", json_schema_extra={"example": "월 실수령 200만원 이상 ~ 300만원 미만"})

class ScaleConfig(BaseModel):
    min: int = Field(1, description="척도 최소 점수", json_schema_extra={"example": 1})
    max: int = Field(5, description="척도 최대 점수", json_schema_extra={"example": 5})
    leftLabel: str = Field(..., description="왼쪽(1점) 척도 기준 문구", json_schema_extra={"example": "현재의 소비와 즐거움을 우선"})
    rightLabel: str = Field(..., description="오른쪽(5점) 척도 기준 문구", json_schema_extra={"example": "미래의 저축과 안정을 우선"})
    steps: list[str] | None = Field(
        None, 
        description="1~5점 각 단계별 선택 문구",
        json_schema_extra={"example": ["1점: 매우 소비 우선", "2점: 소비 약간 우선", "3점: 균형", "4점: 저축 약간 우선", "5점: 매우 저축 우선"]}
    )

class QuestionItem(BaseModel):
    id: str = Field(..., description="질문 고유 식별자 ID", json_schema_extra={"example": "monthly_income"})
    order: int = Field(..., description="질문 표시 순서", json_schema_extra={"example": 1})
    category: str = Field(..., description="질문 카테고리 (소득 | 잉여자금 | 시간축 성향 | 부채 | 관리축 성향 | 가치관)", json_schema_extra={"example": "소득"})
    target: str = Field("self", description="답변 대상자 (self: 본인, partner: 배우자/상대방)", json_schema_extra={"example": "self"})
    text: str = Field(..., description="질문 본문 문구", json_schema_extra={"example": "본인의 월 실수령 소득 구간을 선택해 주세요."})
    subText: str | None = Field(None, description="질문 보조/안내 문구", json_schema_extra={"example": "세후 실수령액(월급 기준)을 선택해 주세요."})
    type: str = Field(..., description="문항 유형 (single_choice | range_choice | scale)", json_schema_extra={"example": "range_choice"})
    options: list[QuestionOption] | None = Field(None, description="선택적 보기(옵션) 목록")
    scaleConfig: ScaleConfig | None = Field(None, description="척도 문항 설정 및 단계별 보기")

class QuestionSet(BaseModel):
    version: str = Field(..., description="질문 세트 버전 식별자", json_schema_extra={"example": "light-v1"})
    title: str = Field(..., description="질문 세트 제목", json_schema_extra={"example": "미리살림 라이트 진단 질문 세트"})
    description: str = Field(..., description="질문 세트 설명", json_schema_extra={"example": "3분 만에 확인하는 신혼부부 맞춤형 저축여력 추정 및 4대 재무 성향 진단 5대 문항입니다."})
    questions: list[QuestionItem] = Field(..., description="질문 및 선택지 목록")


# ==========================================
# 라이트 모드 진단 요청 및 결과 DTO
# ==========================================

class LightDiagnosisRequest(BaseModel):
    incomeA: float = Field(
        ..., 
        description="본인이 선택한 월 실수령 소득 구간 대표값 (단위: 만원/월)",
        json_schema_extra={"example": 250.0}
    )
    incomeB: float = Field(
        0.0, 
        description="상대방이 선택한 월 실수령 소득 구간 대표값 (단위: 만원/월, 미입력/외벌이 시 0)",
        json_schema_extra={"example": 250.0}
    )
    surplusA: float = Field(
        ..., 
        description="본인이 선택한 월 잉여자금 구간 대표값 (단위: 만원/월)",
        json_schema_extra={"example": 85.0}
    )
    surplusB: float = Field(
        0.0, 
        description="상대방이 선택한 월 잉여자금 구간 대표값 (단위: 만원/월, 미입력/외벌이 시 0)",
        json_schema_extra={"example": 40.0}
    )
    timeAxisAnswers: list[int] | list[float] | list[str] = Field(
        ..., 
        description="시간축 성향 문항 점수(1~5점) 또는 선택지 인덱스/코드 리스트",
        json_schema_extra={"example": [2]}
    )
    mgmtAxisAnswers: list[int] | list[float] | list[str] | list[list[int]] | list[list[float]] = Field(
        ..., 
        description="관리축 성향 문항 점수(1~5점) 또는 선택지 인덱스/코드 리스트",
        json_schema_extra={"example": [2]}
    )

class SurplusResult(BaseModel):
    rawSurplus: float = Field(..., description="저축여력 추정 원값 (단위: 만원)", json_schema_extra={"example": 181.3})
    formattedSurplus: str = Field(..., description="포맷팅된 저축여력 문구", json_schema_extra={"example": "약 180만원대"})
    summary: str = Field(..., description="저축여력 요약 설명 문구", json_schema_extra={"example": "두 분의 합산 예상 월 저축 여력은 약 180만원대입니다."})
    caution: str = Field(..., description="추정치 주의사항 안내 문구", json_schema_extra={"example": "※ 구간 선택 기반 추정치이며, 주거비 변동은 미반영된 금액입니다."})

class TypeClassificationResult(BaseModel):
    time: str = Field(..., description="시간축 성향 코드 (saver | spender)", json_schema_extra={"example": "saver"})
    timeLabel: str = Field(..., description="시간축 성향 한국어 명칭", json_schema_extra={"example": "미래대비형 (저축 우선)"})
    timeDescription: str = Field(..., description="시간축 성향 상세 설명", json_schema_extra={"example": "현재의 소비보다는 미래의 안정과 목표 달성을 위해 저축과 자산 형성을 더 중요하게 생각합니다."})
    mgmt: str = Field(..., description="관리축 성향 코드 (joint | separate)", json_schema_extra={"example": "joint"})
    mgmtLabel: str = Field(..., description="관리축 성향 한국어 명칭", json_schema_extra={"example": "공동관리형 (통합 관리)"})
    mgmtDescription: str = Field(..., description="관리축 성향 상세 설명", json_schema_extra={"example": "부부의 소득과 지출을 투명하게 공유하고 하나의 공동 통장으로 함께 관리하는 방식을 선호합니다."})
    typeCode: str = Field(..., description="복합 성향 유형 코드 (saver_joint | saver_separate | spender_joint | spender_separate)", json_schema_extra={"example": "saver_joint"})
    typeName: str = Field(..., description="복합 성향 유형 한국어 명칭", json_schema_extra={"example": "함께 모으는 든든한 동반자형"})
    typeDescription: str = Field(..., description="복합 성향 유형 상세 해설", json_schema_extra={"example": "두 분 모두 미래를 위한 저축을 중시하며, 자금을 함께 모아 공동의 목표를 달성하는 데 최적화된 궁합입니다."})
    recommendation: str = Field(..., description="신혼부부 맞춤 재무 실천 조언", json_schema_extra={"example": "공동의 저축 목표(예: 내 집 마련, 비상금)를 구체적인 금액과 기간으로 설정하고, 정기적으로 재무 현황을 점검해보세요."})

class LightDiagnosisResultData(BaseModel):
    surplus: SurplusResult = Field(..., description="저축여력 연산 결과")
    typeClassification: TypeClassificationResult = Field(..., description="성향 유형 분류 결과")

class LightDiagnosisResponse(BaseModel):
    status: str = Field("success", description="처리 상태", json_schema_extra={"example": "success"})
    result: LightDiagnosisResultData = Field(..., description="라이트 진단 결과 데이터")


# ==========================================
# 설정 데이터 조회 응답 스키마
# ==========================================

class ConfigResponse(BaseModel):
    status: str = Field("success", description="처리 상태", json_schema_extra={"example": "success"})
    data: dict[str, Any] = Field(..., description="설정 데이터 객체")


# ==========================================
# 입력값 유효성 검사(Validator) 스키마
# ==========================================

class ValidationWarningItem(BaseModel):
    id: str = Field(..., description="검증 규칙 ID (예: V-01, V-02)", json_schema_extra={"example": "V-01"})
    level: str = Field(..., description="경고 수준 (confirm | warn)", json_schema_extra={"example": "confirm"})
    message: str = Field(..., description="안내/경고 메시지", json_schema_extra={"example": "입력하신 월 소득 금액이 맞는지 다시 한번 확인해 주세요."})

class InputValidationRequest(BaseModel):
    monthlyNetIncome: float | None = Field(None, description="월 실수령 순소득 (단위: 만원)", json_schema_extra={"example": 350.0})
    totalExpense: float | None = Field(None, description="월 총 지출 합계 (단위: 만원)", json_schema_extra={"example": 250.0})
    debtTotal: float | None = Field(None, description="총 부채 잔액 (단위: 만원)", json_schema_extra={"example": 5000.0})
    variableExpenses: float | None = Field(None, description="월 변동 생활비 (단위: 만원)", json_schema_extra={"example": 100.0})
    savings: float | None = Field(None, description="현재 모아둔 저축/예금액 (단위: 만원)", json_schema_extra={"example": 3000.0})

class InputValidationResponse(BaseModel):
    status: str = Field("success", description="처리 상태", json_schema_extra={"example": "success"})
    warnings: list[ValidationWarningItem] = Field(default_factory=list, description="검증 규칙에 따른 경고 및 확인 목록")


# ==========================================
# Gate 1: 세션, 초대, 입력(answers, guesses) 및 상태 스키마
# ==========================================

# 4개 선택지 인덱스: 0, 1, 2, 3 또는 null
AnswerOptionIndex = Literal[0, 1, 2, 3]

class LightInputAnswers(BaseModel):
    monthly_income: AnswerOptionIndex | None = Field(default=None, description="소득 문항 선택지 인덱스 (0: 200만 미만, 1: 200~300만, 2: 300~450만, 3: 450만 이상)")
    saving_ratio: AnswerOptionIndex | None = Field(default=None, description="잉여자금 문항 선택지 인덱스 (0: 거의 없음, 1: 20~60만, 2: 60~120만, 3: 120만 이상)")
    spending_style: AnswerOptionIndex | None = Field(default=None, description="소비성향 문항 선택지 인덱스 (0: 소비 최우선, 1: 소비 약간, 2: 저축 약간, 3: 저축 최우선)")
    debt_load: AnswerOptionIndex | None = Field(default=None, description="부채규모 문항 선택지 인덱스 (0: 없음, 1: 3천만 미만, 2: 3천만~1억, 3: 1억 이상)")
    shared_expense: AnswerOptionIndex | None = Field(default=None, description="공동관리 문항 선택지 인덱스 (0: 완전 각자, 1: 각자+공용통장, 2: 공동+개인용돈, 3: 완전 통합)")

class LightInputGuesses(BaseModel):
    monthly_income: AnswerOptionIndex | None = Field(default=None, description="상대방 소득 예측 선택지 인덱스")
    saving_ratio: AnswerOptionIndex | None = Field(default=None, description="상대방 잉여자금 예측 선택지 인덱스")
    spending_style: AnswerOptionIndex | None = Field(default=None, description="상대방 소비성향 예측 선택지 인덱스")
    debt_load: AnswerOptionIndex | None = Field(default=None, description="상대방 부채규모 예측 선택지 인덱스")
    shared_expense: AnswerOptionIndex | None = Field(default=None, description="상대방 공동관리 예측 선택지 인덱스")

class CreateSessionRequest(BaseModel):
    nickname: str = Field(..., min_length=1, max_length=20, description="작성자 닉네임", json_schema_extra={"example": "예랑이"})
    mode: str = Field("light", description="진단 모드 (light | deep)", json_schema_extra={"example": "light"})

class SessionParticipant(BaseModel):
    role: str = Field(..., description="참여자 역할 (creator | invitee)", json_schema_extra={"example": "creator"})
    nickname: str = Field(..., description="참여자 닉네임", json_schema_extra={"example": "예랑이"})
    hasSubmitted: bool = Field(False, description="답변 제출 완료 여부", json_schema_extra={"example": False})

class SessionResponse(BaseModel):
    id: str = Field(..., description="세션 고유 ID", json_schema_extra={"example": "sess_8f3a9b2c"})
    mode: str = Field("light", description="진단 모드", json_schema_extra={"example": "light"})
    invitationCode: str = Field(..., description="상대방 초대용 코드", json_schema_extra={"example": "INV-7890"})
    status: str = Field("in_progress", description="세션 진행 상태 (in_progress | completed | expired)", json_schema_extra={"example": "in_progress"})
    myRole: str = Field("creator", description="현재 사용자의 역할 (creator | invitee)", json_schema_extra={"example": "creator"})
    participants: list[SessionParticipant] = Field(default_factory=list, description="참여자 목록")
    createdAt: str = Field(..., description="세션 생성 일시 (ISO 8601)", json_schema_extra={"example": "2026-08-12T12:00:00Z"})

class InvitationResponse(BaseModel):
    invitationCode: str = Field(..., description="초대 코드", json_schema_extra={"example": "INV-7890"})
    inviterNickname: str = Field(..., description="초대자 닉네임", json_schema_extra={"example": "예랑이"})
    mode: str = Field("light", description="진단 모드", json_schema_extra={"example": "light"})
    status: str = Field("active", description="초대장 상태 (active | joined | expired)", json_schema_extra={"example": "active"})

class JoinInvitationRequest(BaseModel):
    nickname: str = Field(..., min_length=1, max_length=20, description="참여자 닉네임", json_schema_extra={"example": "예신이"})

class UserInputData(BaseModel):
    answers: LightInputAnswers = Field(default_factory=LightInputAnswers, description="본인 질문별 답변 인덱스 (0|1|2|3|null)")
    guesses: LightInputGuesses | None = Field(None, description="상대방 질문별 예측 인덱스 (0|1|2|3|null)")

class SaveInputRequest(BaseModel):
    answers: LightInputAnswers = Field(..., description="본인 질문별 답변 인덱스 (0|1|2|3|null)")
    guesses: LightInputGuesses | None = Field(None, description="상대방 질문별 예측 인덱스 (0|1|2|3|null)")

class SubmitInputRequest(BaseModel):
    answers: LightInputAnswers = Field(..., description="본인 질문별 최종 답변 인덱스 (0|1|2|3|null)")
    guesses: LightInputGuesses | None = Field(None, description="상대방 질문별 최종 예측 인덱스 (0|1|2|3|null)")

class SessionStatusResponse(BaseModel):
    sessionId: str = Field(..., description="세션 ID", json_schema_extra={"example": "sess_8f3a9b2c"})
    status: str = Field("in_progress", description="세션 진행 상태 (in_progress | completed | expired)", json_schema_extra={"example": "in_progress"})
    isCompleted: bool = Field(False, description="양측 제출 완료 여부", json_schema_extra={"example": False})
    mySubmitted: bool = Field(False, description="내 제출 완료 여부", json_schema_extra={"example": True})
    partnerSubmitted: bool = Field(False, description="상대방 제출 완료 여부", json_schema_extra={"example": False})
    partnerNickname: str | None = Field(None, description="상대방 닉네임", json_schema_extra={"example": "예신이"})

class NudgeResponse(BaseModel):
    status: str = Field("success", description="처리 상태", json_schema_extra={"example": "success"})
    message: str = Field("상대방에게 참여 알림을 전송했습니다.", description="결과 안내 메시지", json_schema_extra={"example": "상대방에게 참여 알림을 전송했습니다."})


# ==========================================
# Gate 1: 결과 Discriminated Union 스키마
# ==========================================

class ResultWaitingResponse(BaseModel):
    status: Literal["waiting"] = Field("waiting", description="결과 대기 상태 식별자")
    partnerCompleted: Literal[False] = Field(False, description="상대방 완료 여부 (항상 False)")

class ResultReadyResponse(BaseModel):
    status: Literal["ready"] = Field("ready", description="결과 준비 완료 상태 식별자")
    partnerCompleted: Literal[True] = Field(True, description="상대방 완료 여부 (항상 True)")
    result: LightDiagnosisResultData = Field(..., description="합산 및 비교 진단 결과 데이터")

SessionResultResponse = Annotated[
    ResultWaitingResponse | ResultReadyResponse,
    Field(discriminator="status", description="세션 결과 (대기 중 또는 완료 상태)")
]
