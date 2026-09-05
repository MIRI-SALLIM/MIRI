from typing import Annotated, Any

from pydantic import Field, StrictInt

from deep.schemas import Amount, StrictModel
from deep.v3_models import Contribution


class MeetingReference(StrictModel):
    round: Annotated[StrictInt, Field(ge=1)]
    planVersion: Annotated[StrictInt, Field(ge=1)]
    sourceReportId: str = Field(min_length=1, max_length=200)


class PersonalNeeds(StrictModel):
    personalSpendingFloor: Amount
    personalSavingFloor: Amount


class SharedPersonalNeeds(StrictModel):
    A: PersonalNeeds
    B: PersonalNeeds


def reference(document: dict[str, Any]) -> dict[str, Any]:
    return {'round': document['round'], 'planVersion': document['plan']['version'],
            'sourceReportId': document['reportId']}


def planning_context(document: dict[str, Any]) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    members = document['members']
    if not all(members[role]['consent']['shareFinance'] for role in ('A', 'B')):
        return None, []
    intents = {role: Contribution.model_validate(members[role]['input'].get('contribution', {}))
               for role in ('A', 'B')}
    needs = {role: PersonalNeeds(personalSpendingFloor=intent.personalSpendingFloor,
                                 personalSavingFloor=intent.personalSavingFloor).model_dump(mode='json')
             for role, intent in intents.items()}
    states = {role: intent.discussionState for role, intent in intents.items()}
    issues = []
    if 'unknown' not in states.values() and states['A'] != states['B']:
        issues.append({
            'code': 'DISCUSSION_PERCEPTION_DIFFERENCE', 'states': states,
            'observation': '입력 당시 두 사람이 이 계획을 확정된 것으로 보는 정도가 달랐습니다. 현재 기준표와 비교해 확인하세요.',
            'question': '금액, 포함 항목, 시작일 중 어디까지 함께 정했다고 생각했나요?',
        })
    if any(amount['status'] == 'known' for person in needs.values() for amount in person.values()):
        issues.append({
            'code': 'PERSONAL_NEEDS_REVIEW', 'basis': 'self_reported_needs_not_affordability',
            'observation': '각자가 남기고 싶은 개인비·저축 기준이 있습니다. 분담 공백이 없어도 이 기준이 지켜지는지는 별도 확인이 필요합니다.',
            'question': '이번 분담안에서도 적어 둔 개인비와 저축을 지킬 수 있나요? 기존 지출이나 공동 저축과 겹치는 항목도 확인해 주세요.',
        })
    return needs, issues
