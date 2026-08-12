from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field

# ==========================================
# 공통 응답 스키마
# ==========================================

class ErrorResponse(BaseModel):
    code: str = Field(..., description="오류 식별 코드", json_schema_extra={"example": "QUESTION_SET_NOT_FOUND"})
    message: str = Field(..., description="오류 상세 메시지", json_schema_extra={"example": "요청한 버전의 질문 세트를 찾을 수 없습니다."})

class HealthResponse(BaseModel):
    status: str = Field(..., description="서버 상태", json_schema_extra={"example": "ok"})
    database: str = Field(..., description="데이터베이스 연결 상태", json_schema_extra={"example": "connected"})
    message: Optional[str] = Field(None, description="상태 안내 메시지", json_schema_extra={"example": "미리살림 백엔드 서버 및 데이터베이스가 정상 가동 중입니다."})


# ==========================================
# 선택적 보기 및 질문 세트 스키마
# ==========================================

class QuestionOption(BaseModel):
    label: str = Field(..., description="선택지 표시 라벨 문구", json_schema_extra={"example": "250~330만"})
    value: Union[str, int, float] = Field(..., description="선택지 고유 식별값", json_schema_extra={"example": "250_330"})
    rep: Optional[float] = Field(None, description="구간 대표값 (만원 단위)", json_schema_extra={"example": 290.0})
    description: Optional[str] = Field(None, description="선택지 부가 설명", json_schema_extra={"example": "월 실수령 250만원 이상 ~ 330만원 미만"})

class ScaleConfig(BaseModel):
    min: int = Field(1, description="척도 최소 점수", json_schema_extra={"example": 1})
    max: int = Field(5, description="척도 최대 점수", json_schema_extra={"example": 5})
    leftLabel: str = Field(..., description="왼쪽(1점) 척도 기준 문구", json_schema_extra={"example": "현재의 소비와 즐거움을 우선"})
    rightLabel: str = Field(..., description="오른쪽(5점) 척도 기준 문구", json_schema_extra={"example": "미래의 저축과 안정을 우선"})
    steps: Optional[List[str]] = Field(
        None, 
        description="1~5점 각 단계별 선택 문구",
        json_schema_extra={"example": ["매우 왼쪽 성향 (1점)", "약간 왼쪽 성향 (2점)", "중간 / 보통 (3점)", "약간 오른쪽 성향 (4점)", "매우 오른쪽 성향 (5점)"]}
    )

class QuestionItem(BaseModel):
    id: str = Field(..., description="질문 고유 식별자 ID", json_schema_extra={"example": "q1"})
    order: int = Field(..., description="질문 표시 순서", json_schema_extra={"example": 1})
    category: str = Field(..., description="질문 카테고리 (소득 | 잉여자금 | 부채 | 시간축 성향 | 관리축 성향 | 가치관)", json_schema_extra={"example": "소득"})
    target: str = Field("self", description="답변 대상자 (self: 본인, partner: 배우자/상대방)", json_schema_extra={"example": "self"})
    text: str = Field(..., description="질문 본문 문구", json_schema_extra={"example": "본인의 월 실수령 소득 구간을 선택해 주세요."})
    subText: Optional[str] = Field(None, description="질문 보조/안내 문구", json_schema_extra={"example": "세후 실수령액(월급 기준)을 선택해 주세요."})
    type: str = Field(..., description="문항 유형 (single_choice | scale | range_choice)", json_schema_extra={"example": "range_choice"})
    options: Optional[List[QuestionOption]] = Field(None, description="선택적 보기(옵션) 목록")
    scaleConfig: Optional[ScaleConfig] = Field(None, description="척도 문항 설정 및 단계별 보기")

class QuestionSet(BaseModel):
    version: str = Field(..., description="질문 세트 버전 식별자", json_schema_extra={"example": "light-v1"})
    title: str = Field(..., description="질문 세트 제목", json_schema_extra={"example": "미리살림 라이트 진단 질문 세트"})
    description: str = Field(..., description="질문 세트 설명", json_schema_extra={"example": "3분 만에 알아보는 신혼부부 맞춤 재무 성향 및 저축여력 진단"})
    questions: List[QuestionItem] = Field(..., description="질문 및 선택지 목록")


# ==========================================
# 라이트 모드 진단 요청 및 응답 스키마
# ==========================================

class LightDiagnosisRequest(BaseModel):
    incomeA: float = Field(
        ..., 
        description="본인이 선택한 월 실수령 소득 구간 대표값 (단위: 만원/월)",
        json_schema_extra={"example": 290.0}
    )
    incomeB: float = Field(
        0.0, 
        description="상대방이 선택한 월 실수령 소득 구간 대표값 (단위: 만원/월, 미입력/외벌이 시 0)",
        json_schema_extra={"example": 210.0}
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
    timeAxisAnswers: List[int] = Field(
        ..., 
        description="시간축 성향 문항 점수 리스트 (1~5점)",
        json_schema_extra={"example": [3, 4]}
    )
    mgmtAxisAnswers: Union[List[int], List[List[int]]] = Field(
        ..., 
        description="관리축 성향 문항 점수 리스트 (1~5점, 1차원 또는 2차원 리스트 지원)",
        json_schema_extra={"example": [2, 5]}
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
    typeCode: str = Field(..., description="복합 성향 유형 코드", json_schema_extra={"example": "saver_joint"})
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
    data: Dict[str, Any] = Field(..., description="설정 데이터 객체")


# ==========================================
# 입력값 유효성 검사(Validator) 스키마
# ==========================================

class ValidationWarningItem(BaseModel):
    id: str = Field(..., description="검증 규칙 ID (예: V-01, V-02)", json_schema_extra={"example": "V-01"})
    level: str = Field(..., description="경고 수준 (confirm | warn)", json_schema_extra={"example": "confirm"})
    message: str = Field(..., description="안내/경고 메시지", json_schema_extra={"example": "입력하신 월 소득 금액이 맞는지 다시 한번 확인해 주세요."})

class InputValidationRequest(BaseModel):
    monthlyNetIncome: Optional[float] = Field(None, description="월 실수령 순소득 (단위: 만원)", json_schema_extra={"example": 350.0})
    totalExpense: Optional[float] = Field(None, description="월 총 지출 합계 (단위: 만원)", json_schema_extra={"example": 250.0})
    debtTotal: Optional[float] = Field(None, description="총 부채 잔액 (단위: 만원)", json_schema_extra={"example": 5000.0})
    variableExpenses: Optional[float] = Field(None, description="월 변동 생활비 (단위: 만원)", json_schema_extra={"example": 100.0})
    savings: Optional[float] = Field(None, description="현재 모아둔 저축/예금액 (단위: 만원)", json_schema_extra={"example": 3000.0})

class InputValidationResponse(BaseModel):
    status: str = Field("success", description="처리 상태", json_schema_extra={"example": "success"})
    warnings: List[ValidationWarningItem] = Field(default_factory=list, description="검증 규칙에 따른 경고 및 확인 목록")

