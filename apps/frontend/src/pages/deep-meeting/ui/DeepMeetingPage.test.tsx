import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";

import { DeepMeetingPage } from "./DeepMeetingPage";

const { fetchGuideMock, fetchOwnMock, fetchStandardsMock, completeMock, contextHookMock, explanationHookMock } = vi.hoisted(() => ({
  fetchGuideMock: vi.fn(),
  fetchOwnMock: vi.fn(),
  fetchStandardsMock: vi.fn(),
  completeMock: vi.fn(),
  contextHookMock: vi.fn(),
  explanationHookMock: vi.fn(),
}));

vi.mock("@/entities/deep-meeting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-meeting")>();
  return {
    ...actual,
    completeMeeting: completeMock,
    fetchMeetingGuide: fetchGuideMock,
    fetchMeetingStandards: fetchStandardsMock,
    fetchOwnMeeting: fetchOwnMock,
  };
});

vi.mock("@/features/poll-explanation", () => ({
  useMeetingContext: contextHookMock,
  useMeetingExplanation: explanationHookMock,
}));

const brief = {
  scope: "monthly" as const,
  housingGapDate: null,
  sourceRound: 1,
  planVersion: 2,
  startMonth: "2026-10",
  commonScope: ["housing", "food"],
  sourceHasAssumptions: false,
  agreementStatus: "unknown" as const,
  facts: [
    { id: "budget" as const, valueWon: 2_000_000 },
    { id: "contribution_gap" as const, valueWon: 400_000 },
  ],
  issues: [{ id: "contribution_gap" as const, factIds: ["budget" as const, "contribution_gap" as const] }],
  basis: "submitted_intentions_not_affordability" as const,
};

const questions = [
  {
    id: "contributionMeaning" as const,
    text: "앞서 함께 쓸 돈으로 적은 내 금액은 어떤 생각으로 정했나요?",
    helpText: "현재 생각을 알려 주세요.",
    options: {
      initialProposal: "서버가 정한 첫 제안 선택지",
      selfReportedLimit: "서버가 정한 상한 선택지",
      unknown: "서버가 정한 미정 선택지",
    },
    required: true,
  },
  {
    id: "adjustableMonthlyWon" as const,
    text: "금액을 조정할 생각이 있다면, 이번 대화에서 어디까지 제안할 수 있나요?",
    helpText: "선택 입력이에요.",
    options: {},
    required: false,
  },
];

const own = {
  round: 1,
  planVersion: 2,
  revision: 4,
  answers: null,
  consent: null,
  questions,
  consentVersion: "money-meeting-consent-v3" as const,
  consentNotice: "선택한 답변과 동의 범위를 함께 확인해요.",
};

const refreshedOwn = {
  ...own,
  round: 2,
  planVersion: 3,
  revision: 5,
};

const guide = {
  status: "ready" as const,
  reference: { planVersion: 2, round: 1, sourceReportId: "report-a" },
  personalNeeds: null,
  report: {},
  topics: [{
    id: "topic-a",
    code: "SERVER_INTERNAL_CODE",
    observation: "확인할 내용을 정리했어요.",
    question: "현재 합의와 제안 금액을 어떻게 확인할까요?",
    whyItMatters: "실제로 지킬 기준을 정하는 데 도움이 돼요.",
    answerTargets: ["meeting.answers"],
    decisionTopic: "monthlyContribution" as const,
    evidence: {},
    relatedAgreementIds: [],
  }],
  priorityIds: ["topic-a"],
  decisions: [],
  operatingStatus: {},
  inputChangeNotice: "입력 수치나 공동 계획을 바꾸려면 새 라운드에서 다시 제출하세요.",
};

const context = {
  status: "ready" as const,
  providerStatus: "disabled" as const,
  brief,
  clarifications: {
    A: { contributionMeaning: "initialProposal" as const, adjustableMonthlyWon: 1_000_000 },
    B: { contributionMeaning: "unknown" as const, adjustableMonthlyWon: null },
  },
};

const explanation = {
  status: "ready" as const,
  source: "template" as const,
  reason: "disabled" as const,
  brief,
  cards: [{
    issueId: "contribution_gap" as const,
    factIds: ["budget" as const, "future_fact" as never, "contribution_gap" as const],
    explanation: "공동 예산과 제안한 금액 사이에 공백이 있어요.",
    question: "현재 합의와 제안 금액 중 무엇을 조정할까요?",
  }],
};

const standards = {
  status: "ready" as const,
  confirmed: [],
  deferred: [],
  discussionItems: [],
  nextReviewOn: null,
  notice: "기준표는 두 분이 함께 확인해요.",
  operatingStatus: {},
  personalNeeds: null,
  proposed: [],
  reference: { planVersion: 2, round: 1, sourceReportId: "report-a" },
  submittedContributionGapWon: 400_000,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/deep/meeting/session-a"]}>
        <Routes>
          <Route element={<DeepMeetingPage />} path="/deep/meeting/:sessionId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchGuideMock.mockReset().mockResolvedValue(guide);
  fetchOwnMock.mockReset().mockResolvedValue(own);
  fetchStandardsMock.mockReset().mockResolvedValue(standards);
  completeMock.mockReset().mockResolvedValue({ own, explanation });
  contextHookMock.mockReset().mockReturnValue({
    data: context,
    isFailed: false,
    isPending: false,
    isReady: true,
    isTimedOut: false,
    isWaiting: false,
    refetch: vi.fn(),
    terminalError: null,
  });
  explanationHookMock.mockReset().mockReturnValue({
    data: explanation,
    isFailed: false,
    isPending: false,
    isReady: true,
    isTimedOut: false,
    isWaiting: false,
    refetch: vi.fn(),
    terminalError: null,
  });
});

describe("DeepMeetingPage", () => {
  it("lets a report-waiting meeting check the guide again", async () => {
    const user = userEvent.setup();
    fetchGuideMock.mockReset().mockResolvedValueOnce({ status: "waiting" }).mockResolvedValueOnce(guide);
    renderPage();

    expect(await screen.findByRole("heading", { name: "공동 리포트를 준비하고 있어요" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 확인하기" }));

    expect(await screen.findByText(questions[0].text)).toBeInTheDocument();
  });

  it("keeps the two server questions and consent in one bottom section", async () => {
    renderPage();

    expect(await screen.findByText(questions[0].text)).toBeInTheDocument();
    expect(screen.getByText(questions[1].text)).toBeInTheDocument();
    expect(screen.getByText(own.consentNotice)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "상대와 정보 공유 동의" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "AI 처리 동의" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /답변 저장|동의 저장/ })).not.toBeInTheDocument();
    expect(screen.getByText("기본 해설로 함께 살펴볼 내용을 정리했어요.")).toBeInTheDocument();
    expect(screen.getByText("공동 예산")).toBeInTheDocument();
    expect(screen.getByText("2,000,000원")).toBeInTheDocument();
    expect(screen.getByText("400,000원")).toBeInTheDocument();
    expect(screen.queryByText("SERVER_INTERNAL_CODE")).not.toBeInTheDocument();
  });

  it("only enables the adjustable amount for an initial proposal and couples AI to sharing", async () => {
    const user = userEvent.setup();
    renderPage();

    const selfReportedLimit = await screen.findByRole("radio", { name: questions[0].options.selfReportedLimit });
    await user.click(selfReportedLimit);
    expect(screen.getByLabelText(questions[1].text)).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: questions[0].options.initialProposal }));
    const amount = screen.getByLabelText(questions[1].text);
    expect(amount).toBeEnabled();

    const share = screen.getByRole("checkbox", { name: "상대와 정보 공유 동의" });
    const ai = screen.getByRole("checkbox", { name: "AI 처리 동의" });
    expect(ai).toBeDisabled();
    await user.click(share);
    expect(ai).toBeEnabled();
    await user.click(ai);
    await user.click(share);
    expect(ai).toBeDisabled();
    expect(ai).not.toBeChecked();
  });

  it("sends all three CAS tokens in the single final complete action", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("radio", { name: questions[0].options.initialProposal }));
    await user.type(screen.getByLabelText(questions[1].text), "1000000");
    await user.click(screen.getByRole("checkbox", { name: "상대와 정보 공유 동의" }));
    await user.click(screen.getByRole("button", { name: "선택한 범위로 마무리하기" }));

    await waitFor(() => expect(completeMock).toHaveBeenCalledTimes(1));
    expect(completeMock).toHaveBeenCalledWith("session-a", {
      expectedRound: 1,
      planVersion: 2,
      expectedRevision: 4,
      answers: { contributionMeaning: "initialProposal", adjustableMonthlyWon: 1_000_000 },
      consentVersion: "money-meeting-consent-v3",
      shareWithPartner: true,
      allowAiProcessing: false,
    });
  });

  it("refetches own meeting state after a CAS conflict before allowing retry", async () => {
    const user = userEvent.setup();
    fetchOwnMock.mockReset().mockResolvedValueOnce(own).mockResolvedValue(refreshedOwn);
    completeMock
      .mockRejectedValueOnce(new ApiError({ status: 409, code: "REVISION_CONFLICT", kind: "conflict" }))
      .mockResolvedValueOnce({ own: refreshedOwn, explanation });
    renderPage();

    await user.click(await screen.findByRole("radio", { name: questions[0].options.unknown }));
    await user.click(screen.getByRole("button", { name: "선택한 범위로 마무리하기" }));

    expect(await screen.findByText("최신 답변과 달라요. 최신 회의 내용을 확인한 뒤 다시 마무리해 주세요.")).toBeInTheDocument();
    await waitFor(() => expect(fetchOwnMock).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("radio", { name: questions[0].options.unknown }));
    await user.click(screen.getByRole("button", { name: "선택한 범위로 마무리하기" }));

    await waitFor(() => expect(completeMock).toHaveBeenCalledTimes(2));
    expect(completeMock).toHaveBeenLastCalledWith("session-a", expect.objectContaining({
      expectedRound: 2,
      planVersion: 3,
      expectedRevision: 5,
    }));
  });

  it("finishes without AI consent without presenting an endless waiting state", async () => {
    const user = userEvent.setup();
    completeMock.mockResolvedValueOnce({
      own: {
        ...own,
        revision: own.revision + 1,
        answers: { contributionMeaning: "unknown", adjustableMonthlyWon: null },
        consent: {
          consentVersion: "money-meeting-consent-v3",
          shareWithPartner: false,
          allowAiProcessing: false,
          recordedAt: "2026-09-07T00:00:00Z",
        },
      },
      explanation: { status: "waiting" },
    });
    renderPage();

    await user.click(await screen.findByRole("radio", { name: questions[0].options.unknown }));
    await user.click(screen.getByRole("button", { name: "선택한 범위로 마무리하기" }));

    expect(await screen.findByText("선택한 범위로 마무리했어요.")).toBeInTheDocument();
    expect(screen.queryByText("해설을 준비하고 있어요")).not.toBeInTheDocument();
  });
});
