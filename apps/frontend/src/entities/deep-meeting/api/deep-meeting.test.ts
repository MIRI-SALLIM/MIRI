import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeMeeting,
  fetchMeetingContext,
  fetchMeetingExplanation,
  fetchMeetingGuide,
  fetchMeetingStandards,
  fetchOwnMeeting,
  revokeMeetingConsent,
  saveMeetingAnswers,
  saveMeetingConsent,
} from "./deep-meeting";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });

const own = {
  round: 1,
  planVersion: 2,
  revision: 0,
  answers: null,
  consent: null,
  questions: [
    { id: "contributionMeaning", text: "질문", helpText: "도움", options: { unknown: "모름" }, required: true },
    { id: "adjustableMonthlyWon", text: "금액", helpText: "도움", options: {}, required: false },
  ],
  consentVersion: "money-meeting-consent-v3",
  consentNotice: "안내",
};

const answers = { contributionMeaning: "unknown" as const, adjustableMonthlyWon: null };
const tokens = { expectedRound: 1, planVersion: 2, expectedRevision: 0 };

beforeEach(() => fetchMock.mockReset());

describe("deep meeting API", () => {
  it("connects all meeting reads and mutation payloads to the generated paths", async () => {
    const responseBodies = [
      { status: "waiting" },
      own,
      own,
      own,
      own,
      { status: "waiting" },
      { status: "waiting" },
      { own, explanation: { status: "waiting" } },
      { status: "waiting" },
    ];
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(responseBodies.shift())));

    await fetchMeetingGuide("session-a");
    await fetchOwnMeeting("session-a");
    await saveMeetingAnswers("session-a", { ...tokens, answers });
    await saveMeetingConsent("session-a", {
      ...tokens,
      consentVersion: "money-meeting-consent-v3",
      shareWithPartner: false,
      allowAiProcessing: false,
    });
    await revokeMeetingConsent("session-a");
    await fetchMeetingContext("session-a");
    await fetchMeetingExplanation("session-a");
    await completeMeeting("session-a", {
      ...tokens,
      answers,
      consentVersion: "money-meeting-consent-v3",
      shareWithPartner: false,
      allowAiProcessing: false,
    });
    await fetchMeetingStandards("session-a");

    expect(fetchMock).toHaveBeenCalledTimes(9);
    const requests = fetchMock.mock.calls.map(([request]) => request as Request);
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
      "GET /api/v1/deep/v3/sessions/session-a/meeting/guide",
      "GET /api/v1/deep/v3/sessions/session-a/meeting/me",
      "PATCH /api/v1/deep/v3/sessions/session-a/meeting/me",
      "POST /api/v1/deep/v3/sessions/session-a/meeting/me/consent",
      "DELETE /api/v1/deep/v3/sessions/session-a/meeting/me/consent",
      "GET /api/v1/deep/v3/sessions/session-a/meeting/context",
      "GET /api/v1/deep/v3/sessions/session-a/meeting/explanation",
      "POST /api/v1/deep/v3/sessions/session-a/meeting/complete",
      "GET /api/v1/deep/v3/sessions/session-a/meeting/standards",
    ]);

    expect(await requests[2]?.json()).toEqual({ ...tokens, answers });
    expect(await requests[3]?.json()).toEqual({
      ...tokens,
      consentVersion: "money-meeting-consent-v3",
      shareWithPartner: false,
      allowAiProcessing: false,
    });
    expect(await requests[7]?.json()).toEqual({
      ...tokens,
      answers,
      consentVersion: "money-meeting-consent-v3",
      shareWithPartner: false,
      allowAiProcessing: false,
    });
  });
});
