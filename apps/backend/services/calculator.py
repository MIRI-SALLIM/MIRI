import math
from typing import Any

VALUE_SCORE_MAP: dict[str, float] = {
    "spender_strong": 1.0,
    "spender_moderate": 2.0,
    "saver_moderate": 4.0,
    "saver_strong": 5.0,
    "separate_full": 1.0,
    "separate_shared": 2.0,
    "joint_allowance": 4.0,
    "joint_full": 5.0,
}


def calculate_mutual_hit_count(
    answers_a: list[int | None],
    guesses_a: list[int | None] | None,
    answers_b: list[int | None],
    guesses_b: list[int | None] | None,
    question_count: int,
) -> int:
    """전체 질문 세트에서 양측 예측이 동시에 적중한 개수를 계산합니다."""
    if guesses_a is None or guesses_b is None:
        return 0

    mutual_hit_count = 0
    for index in range(question_count):
        answer_a = answers_a[index] if index < len(answers_a) else None
        answer_b = answers_b[index] if index < len(answers_b) else None
        guess_a = guesses_a[index] if index < len(guesses_a) else None
        guess_b = guesses_b[index] if index < len(guesses_b) else None

        if (
            answer_a is not None
            and answer_b is not None
            and guess_a is not None
            and guess_b is not None
            and guess_a == answer_b
            and guess_b == answer_a
        ):
            mutual_hit_count += 1

    return mutual_hit_count

def calculate_light_surplus(
    income_a: float, 
    income_b: float, 
    surplus_a: float, 
    surplus_b: float, 
    coefficients: dict[str, Any]
) -> dict[str, Any]:
    """
    F-65 라이트 모드 저축여력 추정 산식
    - 입력: 본인/상대방 월 실수령 소득 및 잉여자금 구간 대표값 (만원/월)
    - 산식: 0.15 * (소득A + 소득B) + 0.85 * (잉여A + 잉여B)
    - 결과: 10만원 단위 내림 후 "약 OO만원대" 표기 및 한국어 요약/주의문구 생성
    """
    light_cfg = coefficients.get("lightModeSurplus", {}) if coefficients else {}
    w_income = light_cfg.get("incomeWeight", 0.15)
    w_surplus = light_cfg.get("surplusWeight", 0.85)

    income_sum = (income_a or 0.0) + (income_b or 0.0)
    surplus_sum = (surplus_a or 0.0) + (surplus_b or 0.0)

    # 1. 추정 원값 연산
    raw_surplus = (w_income * income_sum) + (w_surplus * surplus_sum)

    # 2. 10만원 단위 내림 처리
    formatted_val = int(math.floor(raw_surplus / 10.0) * 10)

    return {
        "rawSurplus": round(raw_surplus, 1),
        "formattedSurplus": f"약 {formatted_val}만원대",
        "summary": f"두 분의 합산 예상 월 저축 여력은 약 {formatted_val}만원대입니다.",
        "caution": "※ 구간 선택 기반 추정치이며, 주거비 변동은 미반영된 금액입니다."
    }

def _to_score(val: Any) -> float:
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        if val in VALUE_SCORE_MAP:
            return VALUE_SCORE_MAP[val]
        try:
            return float(val)
        except ValueError:
            return 3.0
    return 3.0

def classify_type(time_axis: Any, mgmt_axis: Any, cutoff: float = 3.0) -> dict[str, Any]:
    """
    F-64 라이트 모드 유형 분류 산식
    - 입력: 시간축 성향 점수 리스트/코드, 관리축 성향 점수 리스트/코드, 임계값(cutoff)
    - 산식: 각 축의 평균 점수를 cutoff(3.0)와 비교
    - 결과: 4가지 조합별 한국어 명칭, 축별 상세 설명, 맞춤 재무 조언 반환
    """
    def avg(xs: Any) -> float:
        if not xs:
            return 3.0
        flat: list[float] = []
        if isinstance(xs, (list, tuple)):
            for item in xs:
                if isinstance(item, (list, tuple)):
                    flat.extend([_to_score(x) for x in item])
                else:
                    flat.append(_to_score(item))
        else:
            flat.append(_to_score(xs))
        return sum(flat) / len(flat) if flat else 3.0

    is_saver = avg(time_axis) >= cutoff
    is_joint = avg(mgmt_axis) >= cutoff

    time_code = "saver" if is_saver else "spender"
    time_label = "미래대비형 (저축 우선)" if is_saver else "현재충실형 (소비 우선)"
    time_desc = (
        "현재의 소비보다는 미래의 안정과 목표 달성을 위해 저축과 자산 형성을 더 중요하게 생각합니다."
        if is_saver else
        "미래의 불확실한 행복보다는 현재의 삶의 질과 가치 있는 경험에 소비하는 것을 선호합니다."
    )

    mgmt_code = "joint" if is_joint else "separate"
    mgmt_label = "공동관리형 (통합 관리)" if is_joint else "개별관리형 (독립 관리)"
    mgmt_desc = (
        "부부의 소득과 지출을 투명하게 공유하고 하나의 공동 통장으로 함께 관리하는 방식을 선호합니다."
        if is_joint else
        "각자의 소득과 통장을 독립적으로 관리하며, 필수 공동 생활비만 정해진 비율로 분담하는 방식을 선호합니다."
    )

    type_code = f"{time_code}_{mgmt_code}"
    
    # 4대 복합 유형 상세 정보
    type_details = {
        "saver_joint": {
            "typeName": "함께 모으는 든든한 동반자형",
            "typeDescription": "두 분 모두 미래를 위한 저축을 중시하며, 자금을 함께 모아 공동의 목표를 달성하는 데 최적화된 궁합입니다.",
            "recommendation": "공동의 저축 목표(예: 내 집 마련, 비상금)를 구체적인 금액과 기간으로 설정하고, 정기적으로 재무 현황을 점검해보세요."
        },
        "saver_separate": {
            "typeName": "각자 꼼꼼 미래설계형",
            "typeDescription": "각자의 자산을 독립적으로 관리하면서도, 미래의 안정을 위해 각자의 영역에서 철저히 저축하는 유형입니다.",
            "recommendation": "공동 생활비와 비상금 갹출 비율을 명확히 정하고, 서로의 자산 형성 현황을 반기 또는 연 1회 정기 공유하는 규칙을 만드세요."
        },
        "spender_joint": {
            "typeName": "함께 즐기는 욜로동반형",
            "typeDescription": "현재의 삶과 행복을 중시하며, 함께 쓰는 즐거움을 공유하는 유형입니다. 지출 규모가 커질 수 있으므로 관리가 필요합니다.",
            "recommendation": "선 저축 후 지출 원칙(자동이체 저축)을 먼저 세워두고, 남은 예산 안에서 부부가 마음껏 즐길 수 있는 자유 지출 한도를 정해보세요."
        },
        "spender_separate": {
            "typeName": "각자 즐기는 독립형",
            "typeDescription": "서로의 소비 자유를 존중하며 각자의 라이프스타일을 즐기는 유형입니다. 자칫 장기 자산 형성이 지연될 수 있습니다.",
            "recommendation": "최소한의 필수 공동 저축 통장을 개설하여 매월 고정 금액을 강제 저축하고, 나머지 금액에 대해 자유 지출을 보장해보세요."
        }
    }

    current_type = type_details.get(type_code, type_details["saver_joint"])

    return {
        "time": time_code,
        "timeLabel": time_label,
        "timeDescription": time_desc,
        "mgmt": mgmt_code,
        "mgmtLabel": mgmt_label,
        "mgmtDescription": mgmt_desc,
        "typeCode": type_code,
        "typeName": current_type["typeName"],
        "typeDescription": current_type["typeDescription"],
        "recommendation": current_type["recommendation"]
    }
