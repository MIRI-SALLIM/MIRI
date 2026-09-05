from datetime import date
from typing import Annotated, Any, Literal

from pydantic import Field

from deep.meeting.guide import GuideTopic, WaitingGuide, meeting_guide
from deep.meeting.planning_context import MeetingReference, SharedPersonalNeeds
from deep.schemas import Money, StrictModel
from deep.service import DeepService
from deep.v3_models import AgreementResponseV3


class ReadyStandards(StrictModel):
    status: Literal['ready'] = 'ready'
    reference: MeetingReference
    confirmed: list[AgreementResponseV3]
    proposed: list[AgreementResponseV3]
    deferred: list[AgreementResponseV3]
    nextReviewOn: date | None
    personalNeeds: SharedPersonalNeeds | None
    discussionItems: list[GuideTopic]
    operatingStatus: dict[str, Any]
    submittedContributionGapWon: Money | None
    notice: str


MeetingStandards = Annotated[ReadyStandards | WaitingGuide, Field(discriminator='status')]


async def meeting_standards(service: DeepService, session_id: str, user_id: str) -> dict[str, Any]:
    guide = await meeting_guide(service, session_id, user_id)
    if guide['status'] != 'ready':
        return {'status': 'waiting'}
    groups = {key: [item for item in guide['decisions'] if item['status'] == status]
              for key, status in (('confirmed', 'agreed'), ('proposed', 'proposed'), ('deferred', 'deferred'))}
    review_dates = [date.fromisoformat(str(item['reviewOn'])) for item in groups['confirmed'] if item.get('reviewOn')]
    return {'status': 'ready', 'reference': guide['reference'], **groups,
            'nextReviewOn': min(review_dates) if review_dates else None,
            'personalNeeds': guide['personalNeeds'], 'discussionItems': guide['topics'],
            'operatingStatus': guide['operatingStatus'],
            'submittedContributionGapWon': (guide['report']['planning'].get('data') or {}).get('contributionGapWon'),
            'notice': '양쪽이 같은 버전에 확인한 기준만 확정 영역에 표시합니다. 수정하면 다시 양쪽 확인이 필요합니다. 논의 질문은 입력 당시 기준이며 같은 주제의 합의가 있어도 자동 해결 처리하지 않습니다. 재검토일은 합의된 날짜 중 가장 이른 날로, 지났더라도 확인 전에는 남겨 둡니다.'}
