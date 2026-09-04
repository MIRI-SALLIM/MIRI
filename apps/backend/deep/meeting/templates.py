from typing import Any

from deep.meeting.contracts import SharedClarifications
from deep.meeting.models import ExplanationCard, IssueId, MeetingBrief

COPY: dict[IssueId, tuple[str, str]] = {
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
    if not capped:
        return cards
    notice = " ".join(f"{role}가 밝힌 상한은 본인 진술이며 검증된 지급 능력은 아닙니다." for role in capped)
    cards[0].explanation = notice + " " + cards[0].explanation
    for card in cards:
        if card.issueId == "contribution_gap":
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
        elif card.issueId in ("expectation_a", "expectation_b"):
            expecting = "A" if card.issueId == "expectation_a" else "B"
            target = "B" if expecting == "A" else "A"
            if target in capped:
                card.question = f"{target}의 상한을 존중하면서 {expecting}가 기대한 분담 기준을 다시 확인할까요?"
    return cards
