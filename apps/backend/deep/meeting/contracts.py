from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import Field, StrictBool, StrictInt, model_validator

from deep.meeting.models import ExplanationCard, MeetingBrief
from deep.schemas import Money, StrictModel

ConsentVersion = Literal["money-meeting-consent-v2", "money-meeting-consent-v3"]
CURRENT_CONSENT_VERSION = "money-meeting-consent-v3"
SUPPORTED_CONSENT_VERSIONS = ("money-meeting-consent-v2", CURRENT_CONSENT_VERSION)
Revision = Annotated[StrictInt, Field(ge=0)]
PositiveVersion = Annotated[StrictInt, Field(ge=1)]


class MeetingAnswers(StrictModel):
    contributionMeaning: Literal["initialProposal", "selfReportedLimit", "unknown"]
    adjustableMonthlyWon: Money | None = None

    @model_validator(mode="after")
    def limit_only_for_initial_proposal(self) -> Self:
        if self.adjustableMonthlyWon is not None and self.contributionMeaning != "initialProposal":
            raise ValueError("ADJUSTMENT_REQUIRES_INITIAL_PROPOSAL")
        return self


class MeetingWrite(StrictModel):
    expectedRound: PositiveVersion
    planVersion: PositiveVersion
    expectedRevision: Revision


class SaveMeetingAnswers(MeetingWrite):
    answers: MeetingAnswers


class MeetingConsent(StrictModel):
    consentVersion: ConsentVersion
    shareWithPartner: StrictBool
    allowAiProcessing: StrictBool

    @model_validator(mode="after")
    def ai_requires_sharing(self) -> Self:
        if self.allowAiProcessing and not self.shareWithPartner:
            raise ValueError("AI_REQUIRES_PARTNER_SHARING")
        return self


class SaveMeetingConsent(MeetingWrite, MeetingConsent):
    pass


class CompleteMeeting(SaveMeetingAnswers, MeetingConsent):
    pass


class RecordedMeetingConsent(MeetingConsent):
    recordedAt: datetime


class MeetingQuestion(StrictModel):
    id: Literal["contributionMeaning", "adjustableMonthlyWon"]
    text: str
    helpText: str
    options: dict[str, str] = Field(default_factory=dict)
    required: StrictBool


class OwnMeeting(StrictModel):
    round: PositiveVersion
    planVersion: PositiveVersion
    revision: Revision
    answers: MeetingAnswers | None
    consent: RecordedMeetingConsent | None
    questions: list[MeetingQuestion]
    consentVersion: ConsentVersion = "money-meeting-consent-v3"
    consentNotice: str


class WaitingMeetingContext(StrictModel):
    status: Literal["waiting"] = "waiting"


class SharedClarifications(StrictModel):
    A: MeetingAnswers
    B: MeetingAnswers


class ReadyMeetingContext(StrictModel):
    status: Literal["ready"] = "ready"
    providerStatus: Literal["disabled", "configured"] = "disabled"
    brief: MeetingBrief
    clarifications: SharedClarifications


MeetingContext = Annotated[WaitingMeetingContext | ReadyMeetingContext, Field(discriminator="status")]


class AvailableExplanation(StrictModel):
    status: Literal["ready"] = "ready"
    source: Literal["ai", "template"]
    reason: Literal["disabled", "not_generated", "no_issues", "pending", "interrupted", "budget_exhausted", "provider_unavailable"] | None
    brief: MeetingBrief
    cards: list[ExplanationCard] = Field(max_length=3)


MeetingExplanation = Annotated[WaitingMeetingContext | AvailableExplanation, Field(discriminator="status")]


class MeetingCompletion(StrictModel):
    own: OwnMeeting
    explanation: MeetingExplanation
