import { describe, expect, it } from "vitest";

import {
  MeetingParseError,
  factValuesForCard,
  parseMeetingContext,
  parseMeetingExplanation,
  parseOwnMeeting,
} from "./meeting";

const questions = [
  {
    id: "contributionMeaning",
    text: "앞서 함께 쓸 돈으로 적은 내 금액은 어떤 생각으로 정했나요?",
    helpText: "현재 생각을 알려 주세요.",
    options: {
      initialProposal: "이 금액부터 이야기해 보고 싶어요",
      selfReportedLimit: "이번 대화에서 제안할 수 있는 최대 금액이에요",
      unknown: "아직 모르겠어요",
    },
    required: true,
  },
  {
    id: "adjustableMonthlyWon",
    text: "금액을 조정할 생각이 있다면, 이번 대화에서 어디까지 제안할 수 있나요?",
    helpText: "선택 입력이에요.",
    options: {},
    required: false,
  },
] as const;

const answers = {
  contributionMeaning: "initialProposal" as const,
  adjustableMonthlyWon: 1_000_000,
};

const brief = {
  scope: "monthly" as const,
  housingGapDate: null,
  sourceRound: 1,
  planVersion: 2,
  startMonth: "2026-10",
  commonScope: ["housing" as const, "food" as const],
  sourceHasAssumptions: false,
  agreementStatus: "unknown" as const,
  facts: [
    { id: "budget" as const, valueWon: 2_000_000 },
    { id: "contribution_gap" as const, valueWon: 400_000 },
  ],
  issues: [{ id: "contribution_gap" as const, factIds: ["budget" as const, "contribution_gap" as const] }],
  basis: "submitted_intentions_not_affordability" as const,
};

describe("deep meeting response parser", () => {
  it("parses own answers, consent, and the two server-provided questions", () => {
    const own = parseOwnMeeting({
      round: 1,
      planVersion: 2,
      revision: 3,
      answers,
      consent: {
        consentVersion: "money-meeting-consent-v3",
        shareWithPartner: true,
        allowAiProcessing: true,
        recordedAt: "2026-09-07T00:00:00Z",
      },
      questions,
      consentVersion: "money-meeting-consent-v3",
      consentNotice: "선택한 범위를 함께 확인해요.",
    });

    expect(own.answers).toEqual(answers);
    expect(own.questions).toHaveLength(2);
    expect(own.consent?.shareWithPartner).toBe(true);
  });

  it("rejects an adjustable amount when the meaning is not an initial proposal", () => {
    expect(() => parseOwnMeeting({
      round: 1,
      planVersion: 2,
      revision: 0,
      answers: { contributionMeaning: "selfReportedLimit", adjustableMonthlyWon: 100_000 },
      consent: null,
      questions,
      consentVersion: "money-meeting-consent-v3",
      consentNotice: "안내",
    })).toThrow(MeetingParseError);
  });

  it("rejects a consent response that enables AI without partner sharing", () => {
    expect(() => parseOwnMeeting({
      round: 1,
      planVersion: 2,
      revision: 1,
      answers: { contributionMeaning: "unknown", adjustableMonthlyWon: null },
      consent: {
        consentVersion: "money-meeting-consent-v3",
        shareWithPartner: false,
        allowAiProcessing: true,
        recordedAt: "2026-09-07T00:00:00Z",
      },
      questions,
      consentVersion: "money-meeting-consent-v3",
      consentNotice: "안내",
    })).toThrow(MeetingParseError);
  });

  it("parses context and skips unknown facts referenced by an issue", () => {
    const context = parseMeetingContext({
      status: "ready",
      providerStatus: "disabled",
      brief: {
        ...brief,
        issues: [{ id: "contribution_gap", factIds: ["contribution_gap", "future_fact"] }],
      },
      clarifications: { A: answers, B: { contributionMeaning: "unknown", adjustableMonthlyWon: null } },
    });

    expect(context.status).toBe("ready");
    if (context.status !== "ready") return;
    expect(context.providerStatus).toBe("disabled");
    expect(context.brief.issues[0]?.factIds).toEqual(["contribution_gap"]);
  });

  it("rejects generated card prose containing numeric characters", () => {
    expect(() => parseMeetingExplanation({
      status: "ready",
      source: "template",
      reason: "disabled",
      brief,
      cards: [{
        issueId: "contribution_gap",
        factIds: ["contribution_gap"],
        explanation: "공동 예산은 200만 원이에요.",
        question: "무엇을 조정할까요?",
      }],
    })).toThrow(MeetingParseError);
  });

  it("rejects generated card prose made only of whitespace", () => {
    expect(() => parseMeetingExplanation({
      status: "ready",
      source: "template",
      reason: "disabled",
      brief,
      cards: [{
        issueId: "contribution_gap",
        factIds: ["contribution_gap"],
        explanation: "   ",
        question: "무엇을 조정할까요?",
      }],
    })).toThrow(MeetingParseError);
  });

  it("assembles card amounts from brief facts and ignores unknown fact ids", () => {
    const explanation = parseMeetingExplanation({
      status: "ready",
      source: "template",
      reason: "disabled",
      brief,
      cards: [{
        issueId: "contribution_gap",
        factIds: ["budget", "future_fact", "contribution_gap"],
        explanation: "공동 예산과 제안한 금액 사이에 차이가 있어요.",
        question: "어떤 항목을 조정할까요?",
      }],
    });

    expect(explanation.status).toBe("ready");
    if (explanation.status !== "ready") return;
    expect(factValuesForCard(explanation.cards[0], explanation.brief)).toEqual([
      { id: "budget", valueWon: 2_000_000 },
      { id: "contribution_gap", valueWon: 400_000 },
    ]);
  });
});
