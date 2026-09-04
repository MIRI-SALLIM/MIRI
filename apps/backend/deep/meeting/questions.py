from deep.meeting.contracts import MeetingQuestion

CONSENT_NOTICE = (
    "추가 답변을 상대에게 공개하는 것과, 공동 재무 근거 및 추가 답변을 OpenAI에 보내 해설을 만드는 것은 별도 동의입니다. "
    "양측 동의 후 AI 해설 생성을 요청하면 공동 예산·분담 제안·기대 금액·범위·시작 월·합의 상태와 추가 답변을 전송합니다. "
    "이름·계정·연락처·자유 입력 원문은 보내지 않습니다. 동의하지 않아도 기존 공동 리포트는 이용할 수 있습니다. "
    "API 데이터는 기본적으로 모델 학습에 쓰이지 않지만, 저장 해제 설정과 별개로 남용 방지 목적으로 통상 최대 삼십 일 보관될 수 있습니다. "
    "답변 수정 시 본인 동의가 해제됩니다. 철회 시 준비 조회와 해설 이용을 차단하고 서비스의 해설 캐시를 지웁니다. "
    "이미 상대가 확인한 내용이나 외부에 전송 중인 요청은 회수할 수 없습니다. AI 해설은 참고 정보이며 실제 부담 능력이나 합의의 판정이 아닙니다."
)


def questions() -> list[MeetingQuestion]:
    return [
        MeetingQuestion(
            id="contributionMeaning", required=True, text="앞서 적은 본인의 월 분담액은 어떤 의미인가요?",
            helpText="제안과 상한을 구분하려는 질문입니다. 입력한 금액이 실제 지급 능력을 증명하지는 않습니다.",
            options={"initialProposal": "우선 제안한 금액이에요", "selfReportedLimit": "현재 제가 제시할 수 있는 상한이에요", "unknown": "아직 정하지 못했어요"},
        ),
        MeetingQuestion(
            id="adjustableMonthlyWon", required=False, text="우선 제안보다 늘릴 수 있다면, 이번 대화에서 제시할 월 상한은 얼마인가요?",
            helpText="우선 제안을 선택한 경우에만 입력합니다. 기존 제안 이상의 금액을 적고, 아직 모르겠다면 비워 두세요. 자동으로 분담안에 적용되지 않습니다.",
        ),
    ]
