from typing import Any

from schemas import (
    LightComparisonResultData,
    QuestionComparisonItem,
    TypeClassificationResult,
)

# 4대 성향 상세 메타데이터
TYPE_DETAILS: dict[str, dict[str, str]] = {
    "saver_joint": {
        "time": "saver",
        "timeLabel": "미래대비형 (저축 우선)",
        "timeDescription": "현재의 소비보다는 미래의 안정과 목표 달성을 위해 저축과 자산 형성을 더 중요하게 생각합니다.",
        "mgmt": "joint",
        "mgmtLabel": "공동관리형 (통합 관리)",
        "mgmtDescription": "부부의 소득과 지출을 투명하게 공유하고 하나의 공동 통장으로 함께 관리하는 방식을 선호합니다.",
        "typeCode": "saver_joint",
        "typeName": "함께 모으는 든든한 동반자형",
        "typeDescription": "두 분 모두 미래를 위한 저축을 중시하며, 자금을 함께 모아 공동의 목표를 달성하는 데 최적화된 궁합입니다.",
        "recommendation": "공동의 저축 목표(예: 내 집 마련, 비상금)를 구체적인 금액과 기간으로 설정하고, 정기적으로 재무 현황을 점검해보세요.",
    },
    "saver_separate": {
        "time": "saver",
        "timeLabel": "미래대비형 (저축 우선)",
        "timeDescription": "현재의 소비보다는 미래의 안정과 목표 달성을 위해 저축과 자산 형성을 더 중요하게 생각합니다.",
        "mgmt": "separate",
        "mgmtLabel": "개별관리형 (독립 관리)",
        "mgmtDescription": "각자의 소득과 통장을 독립적으로 관리하며, 필수 공동 생활비만 정해진 비율로 분담하는 방식을 선호합니다.",
        "typeCode": "saver_separate",
        "typeName": "각자 꼼꼼 미래설계형",
        "typeDescription": "각자의 자산을 독립적으로 관리하면서도, 미래의 안정을 위해 각자의 영역에서 철저히 저축하는 유형입니다.",
        "recommendation": "공동 생활비와 비상금 갹출 비율을 명확히 정하고, 서로의 자산 형성 현황을 반기 또는 연 1회 정기 공유하는 규칙을 만드세요.",
    },
    "spender_joint": {
        "time": "spender",
        "timeLabel": "현재충실형 (소비 우선)",
        "timeDescription": "미래의 불확실한 행복보다는 현재의 삶의 질과 가치 있는 경험에 소비하는 것을 선호합니다.",
        "mgmt": "joint",
        "mgmtLabel": "공동관리형 (통합 관리)",
        "mgmtDescription": "부부의 소득과 지출을 투명하게 공유하고 하나의 공동 통장으로 함께 관리하는 방식을 선호합니다.",
        "typeCode": "spender_joint",
        "typeName": "함께 즐기는 욜로동반형",
        "typeDescription": "현재의 삶과 행복을 중시하며, 함께 쓰는 즐거움을 공유하는 유형입니다. 지출 규모가 커질 수 있으므로 관리가 필요합니다.",
        "recommendation": "선 저축 후 지출 원칙(자동이체 저축)을 먼저 세워두고, 남은 예산 안에서 부부가 마음껏 즐길 수 있는 자유 지출 한도를 정해보세요.",
    },
    "spender_separate": {
        "time": "spender",
        "timeLabel": "현재충실형 (소비 우선)",
        "timeDescription": "미래의 불확실한 행복보다는 현재의 삶의 질과 가치 있는 경험에 소비하는 것을 선호합니다.",
        "mgmt": "separate",
        "mgmtLabel": "개별관리형 (독립 관리)",
        "mgmtDescription": "각자의 소득과 통장을 독립적으로 관리하며, 필수 공동 생활비만 정해진 비율로 분담하는 방식을 선호합니다.",
        "typeCode": "spender_separate",
        "typeName": "각자 즐기는 독립형",
        "typeDescription": "서로의 소비 자유를 존중하며 각자의 라이프스타일을 즐기는 유형입니다. 자칫 장기 자산 형성이 지연될 수 있습니다.",
        "recommendation": "최소한의 필수 공동 저축 통장을 개설하여 매월 고정 금액을 강제 저축하고, 나머지 금액에 대해 자유 지출을 보장해보세요.",
    },
}

# 공개 질문 선택지 라벨 매핑
QUESTION_OPTION_LABELS: dict[str, list[str]] = {
    "spending_style": [
        "현재 삶과 소비 우선",
        "소비에 조금 더 비중",
        "저축에 조금 더 비중",
        "미래 안정과 저축 우선",
    ],
    "shared_expense": [
        "완전 각자 개별 관리",
        "각자 관리 + 공용 생활비 통장",
        "공동 관리 + 개인 용돈 통장",
        "완전 통합 공동 관리",
    ],
}

PUBLIC_QUESTION_TEXTS: dict[str, str] = {
    "spending_style": "현재의 소비와 미래의 저축 중 어느 쪽에 더 가치를 두시나요?",
    "shared_expense": "결혼 후 부부의 돈 관리는 어떤 방식을 선호하시나요?",
}


def classify_participant_type(answers: list[int | None]) -> TypeClassificationResult:
    """
    참여자의 5개 답변 중 성향 문항(spending_style=2번, shared_expense=4번)만으로 4대 성향을 판정합니다.
    - spending_style: 0, 1 -> spender (소비형) / 2, 3 -> saver (저축형)
    - shared_expense: 0, 1 -> separate (개별형) / 2, 3 -> joint (공동형)
    """
    spending_ans = answers[2] if len(answers) > 2 and answers[2] is not None else 2
    shared_ans = answers[4] if len(answers) > 4 and answers[4] is not None else 2

    time_code = "spender" if spending_ans in (0, 1) else "saver"
    mgmt_code = "separate" if shared_ans in (0, 1) else "joint"
    type_code = f"{time_code}_{mgmt_code}"

    details = TYPE_DETAILS.get(type_code, TYPE_DETAILS["saver_joint"])
    return TypeClassificationResult(**details)


def calculate_mutual_hit_count(
    answers_a: list[int | None],
    guesses_a: list[int | None] | None,
    answers_b: list[int | None],
    guesses_b: list[int | None] | None,
    question_count: int = 5,
) -> int:
    """5개 전체 질문에 대해 A의 B 예측과 B의 A 예측이 모두 일치한 개수를 계산합니다."""
    if guesses_a is None or guesses_b is None:
        return 0

    hit_count = 0
    for idx in range(question_count):
        ans_a = answers_a[idx] if idx < len(answers_a) else None
        ans_b = answers_b[idx] if idx < len(answers_b) else None
        guess_a = guesses_a[idx] if idx < len(guesses_a) else None
        guess_b = guesses_b[idx] if idx < len(guesses_b) else None

        if (
            ans_a is not None
            and ans_b is not None
            and guess_a is not None
            and guess_b is not None
            and guess_a == ans_b
            and guess_b == ans_a
        ):
            hit_count += 1

    return hit_count


def get_tagline(mutual_hit_count: int) -> str:
    """적중 개수에 따른 중립적이고 긍정적인 태그라인을 반환합니다."""
    if mutual_hit_count == 5:
        return "소름 돋는 재무 텔레파시! 서로의 소비관을 100% 꿰뚫고 있어요."
    if mutual_hit_count >= 3:
        return "쿵짝이 잘 맞는 찰떡궁합! 서로를 꽤 깊이 이해하고 있어요."
    if mutual_hit_count >= 1:
        return "알아가는 재미가 있는 커플! 맞춰갈 이야기가 무궁무진해요."
    return "서로 다른 매력의 반대 성향! 대화를 통해 맞춰갈 새로운 시작이에요."


def generate_discussion_topics(
    type_a: TypeClassificationResult,
    type_b: TypeClassificationResult,
) -> list[str]:
    """두 사람의 성향 조합에 따른 맞춤형 3가지 대화 주제를 생성합니다."""
    topics: list[str] = []

    # 1. 소비 가치관 조율 주제
    if type_a.time == type_b.time:
        topics.append("두 분의 소비·저축 가치관이 일치합니다. 월 자유 사용 예산의 기준을 정해보세요.")
    else:
        topics.append("한 분은 현재의 만족, 한 분은 미래의 안정을 중시합니다. 서로의 지출 우선순위를 존중하는 규칙을 만들어보세요.")

    # 2. 통장 관리 및 분담 방식 주제
    if type_a.mgmt == type_b.mgmt:
        topics.append("선호하는 돈 관리 방식이 일치합니다. 공용 생활비와 비상금 통장 개설 계획을 세워보세요.")
    else:
        topics.append("공동 관리와 개별 관리에 대한 선호가 다릅니다. '필수 생활비만 공동 통장'으로 절충안을 논의해보세요.")

    # 3. 미래 목표 주제
    topics.append("결혼 후 1년 내 달성하고 싶은 공통의 단기 저축 목표(예: 신혼여행 정산, 비상금 마련)를 이야기해보세요.")

    return topics


def calculate_light_canonical_result(
    creator: dict[str, Any],
    invitee: dict[str, Any],
    question_count: int = 5,
) -> dict[str, Any]:
    """
    [Creator 관점의 정규(Canonical) 결과를 계산합니다]
    - 4대 성향 판정 (Creator Type, Invitee Type)
    - 상호 적중 개수 (mutualHitCount)
    - 태그라인 및 대화 주제 도출
    - 공개 비교 문항 (spending_style, shared_expense)만 포함하며, 금액 문항(소득/저축액/부채)은 100% 배제
    """
    answers_c = creator.get("answers", [])
    guesses_c = creator.get("guesses", [])
    answers_i = invitee.get("answers", [])
    guesses_i = invitee.get("guesses", [])

    creator_type = classify_participant_type(answers_c)
    invitee_type = classify_participant_type(answers_i)

    mutual_hit = calculate_mutual_hit_count(
        answers_c, guesses_c, answers_i, guesses_i, question_count
    )
    tagline = get_tagline(mutual_hit)
    topics = generate_discussion_topics(creator_type, invitee_type)

    # 공개 비교 항목 구성 (spending_style=2번, shared_expense=4번)
    public_indices = [
        ("spending_style", 2),
        ("shared_expense", 4),
    ]

    questions: list[dict[str, Any]] = []
    for q_id, idx in public_indices:
        ans_c = answers_c[idx] if idx < len(answers_c) else None
        ans_i = answers_i[idx] if idx < len(answers_i) else None
        guess_c = guesses_c[idx] if idx < len(guesses_c) else None
        guess_i = guesses_i[idx] if idx < len(guesses_i) else None

        labels = QUESTION_OPTION_LABELS.get(q_id, [])
        label_c = labels[ans_c] if ans_c is not None and 0 <= ans_c < len(labels) else None
        label_i = labels[ans_i] if ans_i is not None and 0 <= ans_i < len(labels) else None

        questions.append({
            "questionId": q_id,
            "questionText": PUBLIC_QUESTION_TEXTS.get(q_id, ""),
            "creatorAnswer": ans_c,
            "inviteeAnswer": ans_i,
            "creatorGuess": guess_c,
            "inviteeGuess": guess_i,
            "creatorAnswerLabel": label_c,
            "inviteeAnswerLabel": label_i,
            "isMatch": ans_c is not None and ans_c == ans_i,
        })

    return {
        "questionCount": question_count,
        "mutualHitCount": mutual_hit,
        "tagline": tagline,
        "creatorType": creator_type.model_dump(),
        "inviteeType": invitee_type.model_dump(),
        "discussionTopics": topics,
        "comparisonQuestions": questions,
    }


def project_result_for_viewer(
    canonical: dict[str, Any],
    viewer_role: str,
) -> LightComparisonResultData:
    """
    Canonical 결과를 요청자(viewer_role: 'creator' | 'invitee') 관점에 맞추어 프로젝션합니다.
    """
    is_creator = viewer_role == "creator"

    my_type_data = canonical["creatorType"] if is_creator else canonical["inviteeType"]
    partner_type_data = canonical["inviteeType"] if is_creator else canonical["creatorType"]

    projected_questions: list[QuestionComparisonItem] = []
    for q in canonical.get("comparisonQuestions", []):
        if is_creator:
            my_ans = q["creatorAnswer"]
            partner_ans = q["inviteeAnswer"]
            my_guess = q["creatorGuess"]
            my_label = q["creatorAnswerLabel"]
            partner_label = q["inviteeAnswerLabel"]
        else:
            my_ans = q["inviteeAnswer"]
            partner_ans = q["creatorAnswer"]
            my_guess = q["inviteeGuess"]
            my_label = q["inviteeAnswerLabel"]
            partner_label = q["creatorAnswerLabel"]

        is_hit = bool(my_guess is not None and partner_ans is not None and my_guess == partner_ans)
        is_match = bool(my_ans is not None and partner_ans is not None and my_ans == partner_ans)

        projected_questions.append(
            QuestionComparisonItem(
                questionId=q["questionId"],
                questionText=q["questionText"],
                myAnswer=my_ans,
                partnerAnswer=partner_ans,
                myGuess=my_guess,
                isHit=is_hit,
                isMatch=is_match,
                myAnswerLabel=my_label,
                partnerAnswerLabel=partner_label,
            )
        )

    return LightComparisonResultData(
        questionCount=canonical["questionCount"],
        mutualHitCount=canonical["mutualHitCount"],
        tagline=canonical["tagline"],
        myType=TypeClassificationResult(**my_type_data),
        partnerType=TypeClassificationResult(**partner_type_data),
        discussionTopics=canonical["discussionTopics"],
        questions=projected_questions,
    )
