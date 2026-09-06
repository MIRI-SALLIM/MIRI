import type { components } from "@/shared/api";

export const meetingFactIds = [
  "budget",
  "offered_total",
  "contribution_gap",
  "excess",
  "contribution_a",
  "contribution_b",
  "expected_a_for_b",
  "expected_b_for_a",
  "expectation_a",
  "expectation_b",
  "housing_required",
  "housing_available",
  "housing_gap",
  "housing_expected",
  "housing_gap_with_expected",
  "monthly_surplus",
  "goal_required_saving",
  "goal_saving_gap",
] as const;

export type MeetingFactId = (typeof meetingFactIds)[number];

export const meetingIssueIds = [
  "contribution_gap",
  "contribution_unknown",
  "excess_contributions",
  "expectation_a",
  "expectation_b",
  "housing_gap",
  "housing_unknown",
  "housing_expected",
  "monthly_deficit",
  "cashflow_unknown",
  "goal_saving_gap",
  "goal_unknown",
  "condition_discussion",
] as const;

export type MeetingIssueId = (typeof meetingIssueIds)[number];

export const meetingContributionMeanings = ["initialProposal", "selfReportedLimit", "unknown"] as const;
export type MeetingContributionMeaning = (typeof meetingContributionMeanings)[number];
export type MeetingQuestionId = "contributionMeaning" | "adjustableMonthlyWon";
export type MeetingConsentVersion = "money-meeting-consent-v2" | "money-meeting-consent-v3";

export interface MeetingAnswers {
  contributionMeaning: MeetingContributionMeaning;
  adjustableMonthlyWon: number | null;
}

export interface MeetingQuestion {
  id: MeetingQuestionId;
  text: string;
  helpText: string;
  options: Record<string, string>;
  required: boolean;
}

export interface MeetingConsent {
  consentVersion: MeetingConsentVersion;
  shareWithPartner: boolean;
  allowAiProcessing: boolean;
  recordedAt: string;
}

export interface OwnMeeting {
  round: number;
  planVersion: number;
  revision: number;
  answers: MeetingAnswers | null;
  consent: MeetingConsent | null;
  questions: MeetingQuestion[];
  consentVersion: MeetingConsentVersion;
  consentNotice: string;
}

export interface MeetingFact {
  id: MeetingFactId;
  valueWon: number;
}

export interface MeetingIssue {
  id: MeetingIssueId;
  factIds: MeetingFactId[];
}

export interface MeetingBrief {
  scope: "monthly" | "sharedPlan";
  housingGapDate: string | null;
  sourceRound: number;
  planVersion: number;
  startMonth: string;
  commonScope: string[];
  sourceHasAssumptions: boolean;
  agreementStatus: "unknown" | "notProposed" | "proposed" | "deferred" | "agreed" | "conflicting";
  facts: MeetingFact[];
  issues: MeetingIssue[];
  basis: "submitted_intentions_not_affordability";
}

export interface MeetingClarifications {
  A: MeetingAnswers;
  B: MeetingAnswers;
}

export interface WaitingMeetingResponse {
  status: "waiting";
}

export interface ReadyMeetingContext {
  status: "ready";
  providerStatus: "disabled" | "configured";
  brief: MeetingBrief;
  clarifications: MeetingClarifications;
}

export type MeetingContext = WaitingMeetingResponse | ReadyMeetingContext;

export interface ExplanationCard {
  issueId: MeetingIssueId;
  factIds: MeetingFactId[];
  explanation: string;
  question: string;
}

export interface AvailableExplanation {
  status: "ready";
  source: "ai" | "template";
  reason: "disabled" | "not_generated" | "no_issues" | "pending" | "interrupted" | "budget_exhausted" | "provider_unavailable" | null;
  brief: MeetingBrief;
  cards: ExplanationCard[];
}

export type MeetingExplanation = WaitingMeetingResponse | AvailableExplanation;

export type MeetingGuideTopic = components["schemas"]["GuideTopic"];
export type MeetingGuideReady = Omit<components["schemas"]["ReadyGuide"], "topics"> & {
  topics: MeetingGuideTopic[];
};
export type MeetingGuide = WaitingMeetingResponse | MeetingGuideReady;

export type MeetingStandardAgreement = components["schemas"]["AgreementResponseV3"];
export type MeetingStandardsReady = Omit<components["schemas"]["ReadyStandards"], "discussionItems"> & {
  discussionItems: MeetingGuideTopic[];
};
export type MeetingStandards = WaitingMeetingResponse | MeetingStandardsReady;

export interface MeetingCompletion {
  own: OwnMeeting;
  explanation: MeetingExplanation;
}

export type MeetingWriteTokens = Pick<components["schemas"]["SaveMeetingAnswers"], "expectedRound" | "planVersion" | "expectedRevision">;
export type SaveMeetingAnswersInput = MeetingWriteTokens & { answers: MeetingAnswers };
export type SaveMeetingConsentInput = MeetingWriteTokens & Omit<components["schemas"]["SaveMeetingConsent"], keyof MeetingWriteTokens>;
export type CompleteMeetingInput = MeetingWriteTokens & Omit<components["schemas"]["CompleteMeeting"], keyof MeetingWriteTokens>;

export class MeetingParseError extends Error {
  constructor(field: string) {
    super(`우리 돈 기준회의 응답의 ${field} 형식이 올바르지 않아요.`);
    this.name = "MeetingParseError";
  }
}

const meetingFactIdSet = new Set<string>(meetingFactIds);
const meetingIssueIdSet = new Set<string>(meetingIssueIds);
const meetingMeaningSet = new Set<string>(meetingContributionMeanings);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRecord = (value: unknown, field: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new MeetingParseError(field);
  return value;
};

const readArray = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) throw new MeetingParseError(field);
  return value;
};

const readString = (value: unknown, field: string): string => {
  if (typeof value !== "string") throw new MeetingParseError(field);
  return value;
};

const readBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") throw new MeetingParseError(field);
  return value;
};

const readInteger = (value: unknown, field: string, minimum?: number): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (minimum !== undefined && value < minimum)) {
    throw new MeetingParseError(field);
  }
  return value;
};

const readStringArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new MeetingParseError(field);
  }
  return value;
};

const readStringRecord = (value: unknown, field: string): Record<string, string> => {
  const record = readRecord(value, field);
  const entries = Object.entries(record);
  if (!entries.every(([, item]) => typeof item === "string")) {
    throw new MeetingParseError(field);
  }
  return Object.fromEntries(entries) as Record<string, string>;
};

const readNullableString = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) return null;
  return readString(value, field);
};

const readConsentVersion = (value: unknown, field: string): MeetingConsentVersion => {
  if (value !== "money-meeting-consent-v2" && value !== "money-meeting-consent-v3") {
    throw new MeetingParseError(field);
  }
  return value;
};

const readMeaning = (value: unknown, field: string): MeetingContributionMeaning => {
  if (typeof value !== "string" || !meetingMeaningSet.has(value)) {
    throw new MeetingParseError(field);
  }
  return value as MeetingContributionMeaning;
};

const readFactId = (value: unknown, field: string): MeetingFactId | null => {
  if (typeof value !== "string") throw new MeetingParseError(field);
  return meetingFactIdSet.has(value) ? value as MeetingFactId : null;
};

const readIssueId = (value: unknown, field: string): MeetingIssueId | null => {
  if (typeof value !== "string") throw new MeetingParseError(field);
  return meetingIssueIdSet.has(value) ? value as MeetingIssueId : null;
};

const parseAnswers = (value: unknown, field: string): MeetingAnswers => {
  const answers = readRecord(value, field);
  const contributionMeaning = readMeaning(answers.contributionMeaning, `${field}.contributionMeaning`);
  const adjustableValue = answers.adjustableMonthlyWon;
  const adjustableMonthlyWon = adjustableValue === undefined || adjustableValue === null
    ? null
    : readInteger(adjustableValue, `${field}.adjustableMonthlyWon`, 0);

  if (adjustableMonthlyWon !== null && contributionMeaning !== "initialProposal") {
    throw new MeetingParseError(`${field}.adjustableMonthlyWon`);
  }

  return { contributionMeaning, adjustableMonthlyWon };
};

const parseQuestion = (value: unknown, index: number): MeetingQuestion => {
  const question = readRecord(value, `questions[${index}]`);
  const id = question.id;
  if (id !== "contributionMeaning" && id !== "adjustableMonthlyWon") {
    throw new MeetingParseError(`questions[${index}].id`);
  }
  return {
    id,
    text: readString(question.text, `questions[${index}].text`),
    helpText: readString(question.helpText, `questions[${index}].helpText`),
    options: readStringRecord(question.options ?? {}, `questions[${index}].options`),
    required: readBoolean(question.required, `questions[${index}].required`),
  };
};

const parseConsent = (value: unknown): MeetingConsent => {
  const consent = readRecord(value, "consent");
  const shareWithPartner = readBoolean(consent.shareWithPartner, "consent.shareWithPartner");
  const allowAiProcessing = readBoolean(consent.allowAiProcessing, "consent.allowAiProcessing");
  if (allowAiProcessing && !shareWithPartner) throw new MeetingParseError("consent.allowAiProcessing");
  return {
    consentVersion: readConsentVersion(consent.consentVersion, "consent.consentVersion"),
    shareWithPartner,
    allowAiProcessing,
    recordedAt: readString(consent.recordedAt, "consent.recordedAt"),
  };
};

const parseMeetingFact = (value: unknown, index: number): MeetingFact | null => {
  const fact = readRecord(value, `brief.facts[${index}]`);
  const id = readFactId(fact.id, `brief.facts[${index}].id`);
  if (id === null) return null;
  return { id, valueWon: readInteger(fact.valueWon, `brief.facts[${index}].valueWon`) };
};

const parseMeetingIssue = (value: unknown, index: number): MeetingIssue | null => {
  const issue = readRecord(value, `brief.issues[${index}]`);
  const id = readIssueId(issue.id, `brief.issues[${index}].id`);
  if (id === null) return null;
  const factIds = readArray(issue.factIds, `brief.issues[${index}].factIds`).map((factId, factIndex) =>
    readFactId(factId, `brief.issues[${index}].factIds[${factIndex}]`),
  ).filter((factId): factId is MeetingFactId => factId !== null);
  return { id, factIds };
};

const parseMeetingBrief = (value: unknown): MeetingBrief => {
  const brief = readRecord(value, "brief");
  const scope = brief.scope;
  if (scope !== "monthly" && scope !== "sharedPlan") throw new MeetingParseError("brief.scope");
  const agreementStatus = brief.agreementStatus;
  if (
    agreementStatus !== "unknown" && agreementStatus !== "notProposed" && agreementStatus !== "proposed" &&
    agreementStatus !== "deferred" && agreementStatus !== "agreed" && agreementStatus !== "conflicting"
  ) {
    throw new MeetingParseError("brief.agreementStatus");
  }
  if (brief.basis !== "submitted_intentions_not_affordability") throw new MeetingParseError("brief.basis");
  return {
    scope,
    housingGapDate: readNullableString(brief.housingGapDate, "brief.housingGapDate"),
    sourceRound: readInteger(brief.sourceRound, "brief.sourceRound", 1),
    planVersion: readInteger(brief.planVersion, "brief.planVersion", 1),
    startMonth: readString(brief.startMonth, "brief.startMonth"),
    commonScope: readStringArray(brief.commonScope, "brief.commonScope"),
    sourceHasAssumptions: readBoolean(brief.sourceHasAssumptions, "brief.sourceHasAssumptions"),
    agreementStatus,
    facts: readArray(brief.facts, "brief.facts").map(parseMeetingFact).filter((fact): fact is MeetingFact => fact !== null),
    issues: readArray(brief.issues, "brief.issues").map(parseMeetingIssue).filter((issue): issue is MeetingIssue => issue !== null),
    basis: "submitted_intentions_not_affordability",
  };
};

const parseClarifications = (value: unknown): MeetingClarifications => {
  const clarifications = readRecord(value, "clarifications");
  return {
    A: parseAnswers(clarifications.A, "clarifications.A"),
    B: parseAnswers(clarifications.B, "clarifications.B"),
  };
};

export const parseOwnMeeting = (value: unknown): OwnMeeting => {
  const own = readRecord(value, "root");
  const questions = readArray(own.questions, "questions").map(parseQuestion);
  const questionIds = new Set(questions.map((question) => question.id));
  if (questions.length !== 2 || questionIds.size !== 2 || !questionIds.has("contributionMeaning") || !questionIds.has("adjustableMonthlyWon")) {
    throw new MeetingParseError("questions");
  }
  return {
    round: readInteger(own.round, "round", 1),
    planVersion: readInteger(own.planVersion, "planVersion", 1),
    revision: readInteger(own.revision, "revision", 0),
    answers: own.answers === null || own.answers === undefined ? null : parseAnswers(own.answers, "answers"),
    consent: own.consent === null || own.consent === undefined ? null : parseConsent(own.consent),
    questions,
    consentVersion: readConsentVersion(own.consentVersion, "consentVersion"),
    consentNotice: readString(own.consentNotice, "consentNotice"),
  };
};

export const parseMeetingContext = (value: unknown): MeetingContext => {
  const context = readRecord(value, "root");
  if (context.status === "waiting") return { status: "waiting" };
  if (context.status !== "ready") throw new MeetingParseError("status");
  const providerStatus = context.providerStatus;
  if (providerStatus !== "disabled" && providerStatus !== "configured") {
    throw new MeetingParseError("providerStatus");
  }
  return {
    status: "ready",
    providerStatus,
    brief: parseMeetingBrief(context.brief),
    clarifications: parseClarifications(context.clarifications),
  };
};

const hasNumericCharacter = (value: string): boolean => /\p{N}/u.test(value);

const parseExplanationCard = (value: unknown, index: number): ExplanationCard | null => {
  const card = readRecord(value, `cards[${index}]`);
  const issueId = readIssueId(card.issueId, `cards[${index}].issueId`);
  if (issueId === null) return null;
  const explanation = readString(card.explanation, `cards[${index}].explanation`);
  const question = readString(card.question, `cards[${index}].question`);
  if (
    explanation.trim().length < 1 || explanation.length > 300 || question.trim().length < 1 || question.length > 160 ||
    hasNumericCharacter(explanation) || hasNumericCharacter(question)
  ) {
    throw new MeetingParseError(`cards[${index}].text`);
  }
  const factIds = readArray(card.factIds, `cards[${index}].factIds`).map((factId, factIndex) =>
    readFactId(factId, `cards[${index}].factIds[${factIndex}]`),
  ).filter((factId): factId is MeetingFactId => factId !== null);
  if (factIds.length > 10) throw new MeetingParseError(`cards[${index}].factIds`);
  return { issueId, factIds, explanation, question };
};

export const parseMeetingExplanation = (value: unknown): MeetingExplanation => {
  const explanation = readRecord(value, "root");
  if (explanation.status === "waiting") return { status: "waiting" };
  if (explanation.status !== "ready") throw new MeetingParseError("status");
  const source = explanation.source;
  if (source !== "ai" && source !== "template") throw new MeetingParseError("source");
  const reason = explanation.reason;
  if (
    reason !== null && reason !== "disabled" && reason !== "not_generated" && reason !== "no_issues" &&
    reason !== "pending" && reason !== "interrupted" && reason !== "budget_exhausted" && reason !== "provider_unavailable"
  ) {
    throw new MeetingParseError("reason");
  }
  const cards = readArray(explanation.cards, "cards").map(parseExplanationCard).filter((card): card is ExplanationCard => card !== null);
  if (cards.length > 3) throw new MeetingParseError("cards");
  return { status: "ready", source, reason, brief: parseMeetingBrief(explanation.brief), cards };
};

const readOpaqueRecordArray = (value: unknown, field: string): Record<string, unknown>[] =>
  readArray(value, field).map((item, index) => readRecord(item, `${field}[${index}]`));

const readMeetingReference = (value: unknown, field: string): components["schemas"]["MeetingReference"] => {
  const reference = readRecord(value, field);
  return {
    planVersion: readInteger(reference.planVersion, `${field}.planVersion`, 1),
    round: readInteger(reference.round, `${field}.round`, 1),
    sourceReportId: readString(reference.sourceReportId, `${field}.sourceReportId`),
  };
};

const readGuideTopic = (value: unknown, index: number): MeetingGuideTopic => {
  const topic = readRecord(value, `topics[${index}]`);
  const decisionTopic = topic.decisionTopic;
  if (
    decisionTopic !== "monthlyContribution" && decisionTopic !== "housingFunding" && decisionTopic !== "savings" &&
    decisionTopic !== "spending" && decisionTopic !== "investment" && decisionTopic !== "debt" &&
    decisionTopic !== "jointManagement" && decisionTopic !== "other"
  ) {
    throw new MeetingParseError(`topics[${index}].decisionTopic`);
  }
  return {
    id: readString(topic.id, `topics[${index}].id`),
    code: readString(topic.code, `topics[${index}].code`),
    observation: readString(topic.observation, `topics[${index}].observation`),
    question: readString(topic.question, `topics[${index}].question`),
    whyItMatters: readString(topic.whyItMatters, `topics[${index}].whyItMatters`),
    answerTargets: readStringArray(topic.answerTargets, `topics[${index}].answerTargets`),
    decisionTopic,
    evidence: readRecord(topic.evidence, `topics[${index}].evidence`),
    relatedAgreementIds: readStringArray(topic.relatedAgreementIds, `topics[${index}].relatedAgreementIds`),
  } as MeetingGuideTopic;
};

export const parseMeetingGuide = (value: unknown): MeetingGuide => {
  const guide = readRecord(value, "root");
  if (guide.status === "waiting") return { status: "waiting" };
  if (guide.status !== "ready") throw new MeetingParseError("status");
  return {
    status: "ready",
    reference: readMeetingReference(guide.reference, "reference"),
    personalNeeds: guide.personalNeeds === null ? null : readRecord(guide.personalNeeds, "personalNeeds") as components["schemas"]["SharedPersonalNeeds"],
    report: readRecord(guide.report, "report") as components["schemas"]["ReportV3"],
    topics: readArray(guide.topics, "topics").map(readGuideTopic),
    priorityIds: readStringArray(guide.priorityIds, "priorityIds"),
    decisions: readOpaqueRecordArray(guide.decisions, "decisions") as MeetingStandardAgreement[],
    operatingStatus: readRecord(guide.operatingStatus, "operatingStatus"),
    inputChangeNotice: readString(guide.inputChangeNotice, "inputChangeNotice"),
  };
};

export const parseMeetingStandards = (value: unknown): MeetingStandards => {
  const standards = readRecord(value, "root");
  if (standards.status === "waiting") return { status: "waiting" };
  if (standards.status !== "ready") throw new MeetingParseError("status");
  return {
    status: "ready",
    confirmed: readOpaqueRecordArray(standards.confirmed, "confirmed") as MeetingStandardAgreement[],
    deferred: readOpaqueRecordArray(standards.deferred, "deferred") as MeetingStandardAgreement[],
    discussionItems: readArray(standards.discussionItems, "discussionItems").map(readGuideTopic),
    nextReviewOn: readNullableString(standards.nextReviewOn, "nextReviewOn"),
    notice: readString(standards.notice, "notice"),
    operatingStatus: readRecord(standards.operatingStatus, "operatingStatus"),
    personalNeeds: standards.personalNeeds === null ? null : readRecord(standards.personalNeeds, "personalNeeds") as components["schemas"]["SharedPersonalNeeds"],
    proposed: readOpaqueRecordArray(standards.proposed, "proposed") as MeetingStandardAgreement[],
    reference: readMeetingReference(standards.reference, "reference"),
    submittedContributionGapWon: standards.submittedContributionGapWon === null
      ? null
      : readInteger(standards.submittedContributionGapWon, "submittedContributionGapWon", 0),
  };
};

export const parseMeetingCompletion = (value: unknown): MeetingCompletion => {
  const completion = readRecord(value, "root");
  return {
    own: parseOwnMeeting(completion.own),
    explanation: parseMeetingExplanation(completion.explanation),
  };
};

export const factValuesForCard = (card: Pick<ExplanationCard, "factIds">, brief: Pick<MeetingBrief, "facts">): MeetingFact[] => {
  const factsById = new Map(brief.facts.map((fact) => [fact.id, fact]));
  const seen = new Set<MeetingFactId>();
  return card.factIds.flatMap((factId) => {
    if (seen.has(factId)) return [];
    seen.add(factId);
    const fact = factsById.get(factId);
    return fact === undefined ? [] : [fact];
  });
};
