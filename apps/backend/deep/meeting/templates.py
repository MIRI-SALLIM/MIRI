from typing import Any

from deep.meeting.contracts import SharedClarifications
from deep.meeting.models import ExplanationCard, IssueId, MeetingBrief

COPY: dict[IssueId, tuple[str, str]] = {
    'housing_gap': ('확정 재원만으로는 표시된 납부일까지 주거자금을 채우지 못합니다. 날짜별 부족액은 누적 계산이므로 서로 더하지 않습니다.',
                    '납부 전에 확보할 재원을 확인할까요, 주거 금액이나 납부 일정을 다시 정할까요?'),
    'housing_unknown': ('재원·상환·납부 정보 중 확인이 필요한 내용이 있어 주거자금 전체를 확정할 수 없습니다. 미정은 돈이 없다는 뜻이 아닙니다.',
                        '어떤 금액이나 날짜를 누가 확인하고, 언제 다시 이야기할까요?'),
    'housing_expected': ('예상 재원은 들어올 것으로 기대하는 돈이며, 지금 쓸 수 있는 확정 자금과 다릅니다.',
                         '예상한 돈이 늦게 들어오거나 줄어들면 어떤 계획부터 조정할까요?'),
    'monthly_deficit': ('현재 비주거 지출을 유지하고 계획한 주거비와 상환을 반영하면 월 적자입니다. 분담 비율만 바꿔서는 전체 부족이 사라지지 않습니다.',
                        '지출 항목과 주거 계획 중 무엇을 조정하고, 바꾼 수치로 다시 계산할까요?'),
    'cashflow_unknown': ('계획 후 매달 남을 돈을 계산하려면 소득·지출과 상환 후 납입액을 더 확인해야 합니다. 미정을 여유자금으로 볼 수 없습니다.',
                         '확인할 월 소득·지출·상환액을 나누어 맡고 다시 검토할 날짜를 정할까요?'),
    'goal_saving_gap': ('입력한 목표 금액과 기한에 필요한 월 적립액이 계획상 월 여유자금보다 큽니다. 주거 초기자금 공백과는 별개입니다.',
                        '목표 금액·기한·월 지출 중 바꿀 수 있는 항목과 유지할 항목을 정할까요?'),
    'goal_unknown': ('목표에 사용할 재원이나 월 적립 여력이 미정이라 목표 달성에 필요한 조정을 확정할 수 없습니다.',
                     '목표 금액과 기한을 먼저 정할까요, 목표에 쓸 수 있는 재원부터 확인할까요?'),
    'condition_discussion': ('돈의 합계가 맞더라도 입력한 조건을 충족했는지는 별도 논의가 필요합니다. 한 사람의 조건이 두 사람의 합의는 아닙니다.',
                             '지켜야 하는 조건과 조정할 수 있는 조건을 구분하고, 예외와 재검토일을 정할까요?'),
    "contribution_gap": ("처음 제시한 분담액 합계는 공동 예산에 못 미칩니다. 실제 부담 능력이나 현재 합의를 뜻하지는 않습니다.",
                         "현재 합의와 각자의 상한을 확인한 뒤, 공동 예산과 제안 금액 중 무엇을 조정할까요?"),
    "contribution_unknown": ("제안한 분담액에 미정 항목이 있어 예산 충당 여부를 확정할 수 없습니다.",
                             "각자가 제시할 수 있는 금액부터 확인할까요, 공동 예산부터 조정할까요?"),
    "excess_contributions": ("처음 제시한 분담액 합계가 공동 예산보다 큽니다. 남는 금액의 용도까지 합의된 것은 아닙니다.",
                             "현재 합의를 확인한 뒤, 예산을 넘는 제안분의 용도나 분담액을 정할까요?"),
    "expectation_a": ("B의 최초 제안과 A가 B에게 기대한 분담액에 차이가 있습니다. 누가 더 부담해야 한다는 판정은 아닙니다.",
                       "B의 제안이 협상 시작점인지 본인이 정한 상한인지 확인하고, 기대 금액을 다시 이야기할까요?"),
    "expectation_b": ("A의 최초 제안과 B가 A에게 기대한 분담액에 차이가 있습니다. 누가 더 부담해야 한다는 판정은 아닙니다.",
                       "A의 제안이 협상 시작점인지 본인이 정한 상한인지 확인하고, 기대 금액을 다시 이야기할까요?"),
}


def template_cards(brief: MeetingBrief, clarifications: dict[str, Any] | None = None) -> list[ExplanationCard]:
    cards = [ExplanationCard(issueId=issue.id, factIds=issue.factIds, explanation=COPY[issue.id][0], question=COPY[issue.id][1])
             for issue in brief.issues[:3]]
    if not cards or clarifications is None:
        return cards
    shared = SharedClarifications.model_validate(clarifications)
    answers = {"A": shared.A, "B": shared.B}
    capped = [role for role, answer in answers.items() if answer.contributionMeaning == "selfReportedLimit"]
    monthly_cards = [card for card in cards if card.issueId in {'contribution_gap', 'contribution_unknown', 'excess_contributions', 'expectation_a', 'expectation_b'}]
    if capped and monthly_cards:
        notice = " ".join(f"{role}가 밝힌 상한은 본인 진술이며 검증된 지급 능력은 아닙니다." for role in capped)
        monthly_cards[0].explanation = notice + " " + monthly_cards[0].explanation
    for card in cards:
        if card.issueId == "contribution_gap" and capped:
            card.question = "현재 합의를 확인하고, 각자의 상한을 유지한다면 공동 예산에서 어떤 항목을 줄일까요?"
            if len(capped) == 1:
                other = "B" if capped[0] == "A" else "A"
                answer = answers[other]
                offered = next((fact.valueWon for fact in brief.facts if fact.id == "contribution_" + other.lower()), None)
                limit = answer.adjustableMonthlyWon
                if answer.contributionMeaning == "initialProposal":
                    if limit is not None and offered is not None and limit > offered:
                        card.question = f"현재 합의를 확인한 뒤, {capped[0]}의 상한을 유지하면서 {other}의 조정 가능 범위와 공동 예산 축소 중 무엇을 검토할까요?"
                    elif limit is None:
                        card.question = f"현재 합의를 확인한 뒤, {capped[0]}의 상한을 유지하면서 {other}의 조정 가능 여부를 먼저 확인할까요, 공동 예산을 줄일까요?"
        elif card.issueId == "contribution_gap" and all(answer.contributionMeaning == "initialProposal" for answer in answers.values()):
            limits = {role: answer.adjustableMonthlyWon for role, answer in answers.items()}
            unknown = [role for role, limit in limits.items() if limit is None]
            if not unknown:
                budget = next(fact.valueWon for fact in brief.facts if fact.id == "budget")
                if sum(limit for limit in limits.values() if limit is not None) < budget:
                    card.explanation += " 이번 대화에서 밝힌 최대 금액을 합쳐도 원래 공동 예산에 못 미칩니다."
                    card.question = "밝힌 최대 금액을 유지한다면, 원래 공동 예산에서 어떤 항목을 줄일까요?"
                else:
                    card.explanation += " 밝힌 조정 범위는 더 내겠다는 확정된 약속은 아닙니다."
                    card.question = "밝힌 조정 가능 범위 안에서 새 분담안을 제안할까요, 공동 예산을 조정할까요?"
            elif len(unknown) == 1:
                card.question = f"{unknown[0]}의 조정 가능 여부를 먼저 확인할까요, 공동 예산을 조정할까요?"
        elif card.issueId in ("expectation_a", "expectation_b"):
            expecting = "A" if card.issueId == "expectation_a" else "B"
            target = "B" if expecting == "A" else "A"
            if target in capped:
                card.question = f"{target}의 상한을 존중하면서 {expecting}가 기대한 분담 기준을 다시 확인할까요?"
            elif answers[target].contributionMeaning == "initialProposal":
                card.question = f"{target}의 초기 제안과 {expecting}가 기대한 분담 기준의 차이를 어떻게 조율할까요?"
    return cards
