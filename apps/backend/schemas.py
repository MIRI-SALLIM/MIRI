from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, model_validator

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
# Gate 1: 세션, 초대, 가변 입력(answers, guesses) 및 상태 스키마
# ==========================================

# 4개 선택지 인덱스: 0, 1, 2, 3 또는 null
AnswerOptionIndex = Literal[0, 1, 2, 3]
PublicQuestionId = Literal["spending_style", "shared_expense"]
PUBLIC_QUESTION_IDS: frozenset[PublicQuestionId] = frozenset(
    ("spending_style", "shared_expense")
)

class CreateSessionRequest(BaseModel):
    nickname: str | None = Field(None, min_length=1, max_length=20, description="작성자 닉네임", json_schema_extra={"example": "예랑이"})
    mode: str = Field("light", description="진단 모드 (light | deep)", json_schema_extra={"example": "light"})

class SessionParticipant(BaseModel):
    role: str = Field(..., description="참여자 역할 (creator | invitee)", json_schema_extra={"example": "creator"})
    nickname: str | None = Field(None, description="참여자 닉네임", json_schema_extra={"example": "예랑이"})
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
    mode: str = Field(..., description="진단 모드 (light | deep)", json_schema_extra={"example": "light"})
    duration: str = Field(..., description="예상 소요 시간", json_schema_extra={"example": "3분"})
    expiresAt: str = Field(..., description="초대장 만료 일시 (ISO 8601)", json_schema_extra={"example": "2026-08-19T12:00:00Z"})

class JoinInvitationRequest(BaseModel):
    nickname: str | None = Field(None, min_length=1, max_length=20, description="참여자 닉네임", json_schema_extra={"example": "예신이"})

class UserInputData(BaseModel):
    answers: list[AnswerOptionIndex | None] = Field(
        default_factory=list,
        description="본인 질문별 답변 인덱스 리스트 (0|1|2|3|null)",
        json_schema_extra={"example": [0, 1, None, 3]}
    )
    guesses: list[AnswerOptionIndex | None] | None = Field(
        None,
        description="상대방 질문별 예측 인덱스 리스트 (0|1|2|3|null)",
        json_schema_extra={"example": [1, 1, 2, None]}
    )

class SaveInputRequest(BaseModel):
    answers: list[AnswerOptionIndex | None] = Field(
        ...,
        description="본인 질문별 답변 인덱스 리스트 (0|1|2|3|null)",
        json_schema_extra={"example": [0, 1, None, 3, 2]}
    )
    guesses: list[AnswerOptionIndex | None] = Field(
        ...,
        description="상대방 질문별 예측 인덱스 리스트 (0|1|2|3|null)",
        json_schema_extra={"example": [1, 1, 2, None, 0]}
    )

class SubmitResponse(BaseModel):
    status: Literal["submitted"] = Field(..., description="제출 완료 상태 식별자", json_schema_extra={"example": "submitted"})
    completedAt: str = Field(..., description="제출 완료 일시 (ISO 8601)", json_schema_extra={"example": "2026-08-14T12:00:00Z"})

class SubmitInputRequest(BaseModel):
    answers: list[AnswerOptionIndex | None] = Field(
        ...,
        description="본인 질문별 최종 답변 인덱스 리스트 (0|1|2|3|null)",
        json_schema_extra={"example": [0, 1, 2, 3]}
    )
    guesses: list[AnswerOptionIndex | None] | None = Field(
        None,
        description="상대방 질문별 최종 예측 인덱스 리스트 (0|1|2|3|null)",
        json_schema_extra={"example": [1, 1, 2, 0]}
    )

class SessionStatusResponse(BaseModel):
    meCompleted: bool = Field(..., description="내 제출 완료 여부", json_schema_extra={"example": True})
    partnerJoined: bool = Field(..., description="상대방 세션 참여 여부", json_schema_extra={"example": True})
    partnerCompleted: bool = Field(..., description="상대방 제출 완료 여부", json_schema_extra={"example": False})
    partnerNudgedAt: str | None = Field(..., description="최근 넛지 알림 전송 일시 (ISO 8601)", json_schema_extra={"example": "2026-08-12T12:30:00Z"})
    expiresAt: str | None = Field(..., description="세션 만료 일시 (ISO 8601)", json_schema_extra={"example": "2026-08-19T12:00:00Z"})

class NudgeResponse(BaseModel):
    status: str = Field("success", description="처리 상태", json_schema_extra={"example": "success"})
    message: str = Field("상대방에게 참여 알림을 전송했습니다.", description="결과 안내 메시지", json_schema_extra={"example": "상대방에게 참여 알림을 전송했습니다."})


# ==========================================
# Gate 1: 결과 양측 비교 및 Discriminated Union 스키마
# ==========================================

class QuestionComparisonItem(BaseModel):
    questionId: PublicQuestionId = Field(..., description="공개 가능한 질문 고유 식별자 ID", json_schema_extra={"example": "spending_style"})
    questionText: str = Field(..., description="질문 본문 문구", json_schema_extra={"example": "소비 및 저축 성향"})
    myAnswer: AnswerOptionIndex | None = Field(..., description="본인 공개 답변 인덱스 (0|1|2|3|null)", json_schema_extra={"example": 2})
    partnerAnswer: AnswerOptionIndex | None = Field(..., description="상대방 공개 답변 인덱스 (0|1|2|3|null)", json_schema_extra={"example": 2})
    myGuess: AnswerOptionIndex | None = Field(None, description="내가 예측한 상대방 답변 인덱스 (0|1|2|3|null)", json_schema_extra={"example": 2})
    isHit: bool = Field(..., description="현재 사용자 관점의 상대방 예측 적중 여부 (myGuess == partnerAnswer)", json_schema_extra={"example": True})
    isMatch: bool = Field(..., description="질문별 본인과 상대방의 답변 일치 여부 (myAnswer == partnerAnswer)", json_schema_extra={"example": True})
    myAnswerLabel: str | None = Field(None, description="본인 답변 선택지 라벨", json_schema_extra={"example": "저축 약간 우선"})
    partnerAnswerLabel: str | None = Field(None, description="상대방 답변 선택지 라벨", json_schema_extra={"example": "저축 약간 우선"})

class LightComparisonResultData(BaseModel):
    questionCount: int = Field(..., description="전체 질문 수", json_schema_extra={"example": 5})
    mutualHitCount: int = Field(..., description="양측 상호 예측 적중 개수", json_schema_extra={"example": 3})
    tagline: str = Field(..., description="중립적인 결과 태그라인", json_schema_extra={"example": "서로의 생각을 이해하고 맞춰가는 첫걸음"})
    myType: TypeClassificationResult = Field(..., description="본인의 성향 유형 분류 결과")
    partnerType: TypeClassificationResult = Field(..., description="상대방의 성향 유형 분류 결과")
    discussionTopics: list[str] = Field(
        default_factory=list,
        description="대화해 볼 중립적인 주제 목록",
        json_schema_extra={"example": ["월 고정비와 자유 사용 경비의 기준 나누기", "비상금 관리 방식 정하기"]}
    )
    questions: list[QuestionComparisonItem] = Field(
        ...,
        description="공개 가능한 질문별 양측 비교 및 적중 목록"
    )

    @model_validator(mode="before")
    @classmethod
    def retain_public_questions(cls, data: Any) -> Any:
        """민감 질문을 제거하고 공개 질문 기준 집계를 다시 계산합니다."""
        if not isinstance(data, dict):
            return data

        questions = data.get("questions")
        if not isinstance(questions, list):
            return data

        public_questions: list[Any] = []
        for question in questions:
            question_id: object
            if isinstance(question, QuestionComparisonItem):
                question_id = question.questionId
            elif isinstance(question, dict):
                question_id = question.get("questionId")
            else:
                continue

            if question_id not in PUBLIC_QUESTION_IDS:
                continue

            public_questions.append(question)

        public_data = dict(data)
        public_data["questions"] = public_questions
        return public_data

class ResultWaitingResponse(BaseModel):
    status: Literal["waiting"] = Field(..., description="결과 대기 상태 식별자")
    partnerCompleted: Literal[False] = Field(..., description="상대방 완료 여부 (항상 False)")

class ResultReadyResponse(BaseModel):
    status: Literal["ready"] = Field(..., description="결과 준비 완료 상태 식별자")
    partnerCompleted: Literal[True] = Field(..., description="상대방 완료 여부 (항상 True)")
    result: LightComparisonResultData = Field(..., description="양측 비교 결과 데이터 (금액 정보 제외)")

SessionResultResponse = Annotated[
    ResultWaitingResponse | ResultReadyResponse,
    Field(discriminator="status", description="세션 결과 (대기 중 또는 완료 상태)")
]
