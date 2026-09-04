from typing import Any

from deep.config import load_questions
from deep.v3_models import DeepInputV3, SharedPlanV3


def questions_for_input(data: DeepInputV3, plan: SharedPlanV3) -> dict[str, Any]:
    definitions = [
        ("C1", "앞에서 정한 공동비에 본인은 매달 얼마를 내려고 하나요?", "amount", ["contribution.ownMonthly"]),
        ("C2", "같은 공동비에 상대가 매달 얼마를 부담하길 기대하나요?", "amount", ["contribution.expectedPartnerMonthly"]),
        ("C3", "주거 초기자금에는 본인 몫으로 얼마를 투입하려고 하나요?", "fundingAllocation", ["funding.sources[].housingAllocationWon"]),
        ("C4", "매달 꼭 남겨두고 싶은 개인 지출과 저축·비상금이 있나요?", "amounts", ["contribution.personalSpendingFloor", "contribution.personalSavingFloor"]),
        ("C5", "이 계획에서 바꾸기 어려운 조건이 있나요?", "constraints", ["constraints"]),
        ("C6", "이 분담 방식이나 조건을 두 분이 이미 이야기했나요?", "choice", ["contribution.discussionState"]),
    ]
    planning = [{"id": key, "text": text, "type": kind, "bindings": bindings,
                 "options": (["notDiscussed", "discussing", "believeAgreed", "unknown"] if key == "C6" else ["known", "unknown", "withheld"] if key in {"C1", "C2", "C4"} else []),
                 "optional": True, "requiresSharedBudget": key in {"C1", "C2"}}
                for key, text, kind, bindings in definitions]
    followups = []
    if plan.commonExpensesStatus != "known":
        followups.append({"id": "P8", "text": "공동비로 낼 항목과 월 예산을 먼저 정해 주세요.", "bindings": ["commonExpensesStatus", "commonExpenses"]})
    if any(source.kind == "rentalDeposit" for source in data.funding.sources):
        followups.append({"id": "U4", "text": "보증금을 돌려받을 때 먼저 갚아야 하는 대출과 날짜를 확인했나요?", "bindings": ["funding.settlements", "funding.sources[].availableOn"]})
    return {"version": "deep-v3", "title": "함께 살 돈의 기준", "valueQuestions": load_questions("deep-v3")["questions"],
            "scaleLabels": ["왼쪽에 매우 가까움", "왼쪽에 조금 가까움", "중간", "오른쪽에 조금 가까움", "오른쪽에 매우 가까움"],
            "planningQuestions": planning, "followups": followups,
            "consent": {"version": "deep-sharing-v2", "finance": "재무 수치·재원·분담 의사·상대에게 기대한 금액·수용 조건의 공동 분석",
                        "values": "가치관 답변과 차이", "privateNotes": "개인 메모는 자동으로 공유하지 않습니다."}}
