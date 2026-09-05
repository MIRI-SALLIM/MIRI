from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from pydantic import Field

from deep.config import AREAS, load_questions
from deep.errors import DeepError
from deep.meeting.planning_context import (
    MeetingReference,
    SharedPersonalNeeds,
    planning_context,
    reference,
)
from deep.schemas import StrictModel
from deep.service import DeepService
from deep.v3_models import AgreementResponseV3, ReportV3
from deep.v3_report import result_with_agreements, topic_priority


class GuideTopic(StrictModel):
    id: str
    code: str
    observation: str
    question: str
    whyItMatters: str
    answerTargets: list[str]
    decisionTopic: Literal['monthlyContribution', 'housingFunding', 'savings', 'spending', 'investment', 'debt', 'jointManagement', 'other']
    evidence: dict[str, Any]
    relatedAgreementIds: list[str]


class ReadyGuide(StrictModel):
    status: Literal['ready'] = 'ready'
    reference: MeetingReference
    personalNeeds: SharedPersonalNeeds | None
    report: ReportV3
    topics: list[GuideTopic]
    priorityIds: list[str]
    decisions: list[AgreementResponseV3]
    operatingStatus: dict[str, Any]
    inputChangeNotice: str


class WaitingGuide(StrictModel):
    status: Literal['waiting'] = 'waiting'


MeetingGuide = Annotated[ReadyGuide | WaitingGuide, Field(discriminator='status')]


def _direction(issue: dict[str, Any]) -> tuple[str, list[str], str]:
    code = issue['code']
    if code == 'DISCUSSION_PERCEPTION_DIFFERENCE':
        return 'monthlyContribution', ['agreements.terms', 'agreements.reviewOn'], '합의했다고 생각하는 정도와 실제 양측 확인은 다릅니다. 이미 적은 금액을 다시 묻기보다 합의의 범위를 확인하세요.'
    if code == 'PERSONAL_NEEDS_REVIEW':
        return 'monthlyContribution', ['agreements.terms', 'agreements.terms.exceptions'], '개인비·저축 희망액은 지급 능력이나 확정 지출이 아닙니다. 기존 지출과 중복될 수 있어 월 잔액에서 다시 차감하지 않습니다.'
    if code == 'VALUE_DIFFERENCE':
        return issue['area'], ['agreements.terms', 'agreements.reviewOn'], '생각이 다르다는 사실만으로 갈등은 아닙니다. 실제 생활에서 지킬 기준과 예외를 정해야 합니다.'
    if code == 'CASHFLOW_UNCERTAIN':
        return 'spending', ['input.income', 'input.fixedExpenses', 'input.variableExpenses', 'input.afterSettlementMonthlyPayments'], '계획 후 매달 남을 돈을 확인해야 지출과 저축의 기준을 정할 수 있습니다. 미정은 적자나 흑자가 아닙니다.'
    if code == 'MONTHLY_DEFICIT':
        return 'spending', ['input.income', 'input.fixedExpenses', 'input.variableExpenses', 'input.debts', 'plan', 'agreements.terms'], '월 적자는 분담 비율만 바꿔도 사라지지 않습니다. 전체 지출과 상환 계획부터 확인하세요.'
    if code in {'GOAL_SAVING_GAP', 'GOAL_UNCERTAIN'}:
        return 'savings', ['plan.target', 'agreements.terms', 'agreements.reviewOn'], '목표 금액·기한과 매달 모을 돈이 연결되어야 실행할 수 있는 계획이 됩니다.'
    if code in {'CONTRIBUTION_GAP', 'CONTRIBUTION_UNKNOWN', 'EXCESS_CONTRIBUTIONS', 'EXPECTATION_DIFFERENCE'}:
        return 'monthlyContribution', ['meeting.answers', 'plan.commonExpenses', 'agreements.terms.monthlyContributions'], '처음 적은 금액은 합의가 아닙니다. 같은 생활비 범위에서 예산과 각자의 제안을 비교하세요.'
    if code in {'CONDITION_EXCEEDED', 'CONDITION_NEEDS_DISCUSSION', 'BORROWING_CONDITION'}:
        topic = {'CONDITION_EXCEEDED': 'housingFunding', 'CONDITION_NEEDS_DISCUSSION': 'other', 'BORROWING_CONDITION': 'debt'}[code]
        return topic, ['input.constraints', 'agreements.terms', 'agreements.reviewOn'], '계산상 돈이 맞아도 한 사람이 받아들이기 어려운 조건이면 실행 기준을 다시 정해야 합니다.'
    return 'housingFunding', ['plan.fundingDeadlines', 'input.funding.sources', 'input.funding.settlements', 'agreements.terms'], '총자산이 충분해도 납부일 전에 쓸 수 없으면 공백이 생깁니다. 예상 재원은 확정 재원과 구분하세요.'


async def meeting_guide(service: DeepService, session_id: str, user_id: str) -> dict[str, Any]:
    before = await service.repo.get_for_member(session_id, user_id, datetime.now(timezone.utc))
    if before['questionVersion'] != 'deep-v3':
        raise DeepError('NOT_FOUND', 404)
    if before['status'] != 'ready' or not before.get('reportId'):
        return {'status': 'waiting'}
    result = await result_with_agreements(service, session_id, user_id)
    if result['status'] != 'ready':
        return {'status': 'waiting'}
    after = await service.repo.get_for_member(session_id, user_id, datetime.now(timezone.utc))
    if before['version'] != after['version']:
        raise DeepError('REVISION_CONFLICT')
    report = result['report']
    issues = list(report['issues'])
    needs, planning_issues = planning_context(after)
    issues.extend(planning_issues)
    members = after['members']
    if all(members[role]['consent']['shareValues'] for role in ('A', 'B')):
        questions = load_questions('deep-v3')['questions']
        for area in AREAS:
            comparisons = []
            for question in questions:
                a, b = (members[role]['input']['values'].get(question['id']) for role in ('A', 'B'))
                if question['area'] == area and a is not None and b is not None and a != b:
                    comparisons.append({'questionId': question['id'], 'questionText': question['text'],
                                        'leftLabel': question['left'], 'rightLabel': question['right'], 'a': a, 'b': b})
            if comparisons:
                issues.append({'code': 'VALUE_DIFFERENCE', 'area': area, 'comparisons': comparisons,
                               'observation': '답변의 차이를 확인하고 실제 생활에 적용할 기준을 정해 주세요.',
                               'question': '어떤 상황에서는 양보할 수 있고, 어떤 기준은 지키고 싶나요?'})
    important = [area for role in ('A', 'B') for area in members[role]['input']['importantAreas']] if all(members[r]['consent']['shareValues'] for r in ('A', 'B')) else []
    issues.sort(key=lambda item: topic_priority(item, important))
    topics = []
    for index, issue in enumerate(issues):
        decision_topic, targets, why = _direction(issue)
        topics.append({'id': f"{report['versions']['round']}:{report['versions']['planVersion']}:{index}:{issue['code']}",
                       'code': issue['code'], 'observation': issue.get('observation') or issue.get('message', ''),
                       'question': issue.get('question', '먼저 확인할 내용과 담당자를 정할까요?'),
                       'whyItMatters': why, 'answerTargets': targets, 'decisionTopic': decision_topic,
                       'evidence': issue, 'relatedAgreementIds': [row['id'] for row in result['agreements'] if row['terms']['topic'] == decision_topic]})
    return {'status': 'ready', 'reference': reference(after), 'personalNeeds': needs,
            'report': report, 'topics': topics, 'priorityIds': [row['id'] for row in topics[:3]],
            'decisions': result['agreements'], 'operatingStatus': result['operatingStatus'],
            'inputChangeNotice': '입력 수치나 공동 계획을 바꾸려면 새 라운드에서 다시 제출하세요. 기준표 제안만으로 원래 계산이나 합의가 바뀌지 않습니다.'}
