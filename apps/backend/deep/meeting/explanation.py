from deep.errors import DeepError
from deep.meeting.models import ExplanationDraft, IssueId, MeetingBrief


def validate_grounding(draft: ExplanationDraft, brief: MeetingBrief) -> ExplanationDraft:
    """Validate evidence references, not the semantic truth or safety of generated prose."""
    issues = {issue.id: set(issue.factIds) for issue in brief.issues}
    known_facts = {fact.id for fact in brief.facts}
    seen: set[IssueId] = set()
    for card in draft.cards:
        references = set(card.factIds)
        permitted = issues.get(card.issueId)
        if (card.issueId in seen or permitted is None or len(references) != len(card.factIds)
                or not references <= known_facts or not references <= permitted
                or (permitted and not references)):
            raise DeepError("MEETING_GROUNDING_INVALID")
        seen.add(card.issueId)
    return draft
