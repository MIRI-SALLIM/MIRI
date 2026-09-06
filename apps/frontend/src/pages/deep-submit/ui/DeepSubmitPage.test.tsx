import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";

import { DeepSubmitPage } from "./DeepSubmitPage";

const {
  fetchDeepInputMock,
  fetchDeepPlanMock,
  getDeepQuestionsMock,
  submitDeepSessionMock,
} = vi.hoisted(() => ({
  fetchDeepInputMock: vi.fn(),
  fetchDeepPlanMock: vi.fn(),
  getDeepQuestionsMock: vi.fn(),
  submitDeepSessionMock: vi.fn(),
}));

vi.mock("@/entities/deep-input", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-input")>();
  return { ...actual, fetchDeepInput: fetchDeepInputMock };
});

vi.mock("@/entities/deep-plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-plan")>();
  return { ...actual, fetchDeepPlan: fetchDeepPlanMock };
});

vi.mock("@/entities/deep-question", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-question")>();
  return { ...actual, getDeepQuestions: getDeepQuestionsMock };
});

vi.mock("@/entities/deep-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-session")>();
  return { ...actual, submitDeepSession: submitDeepSessionMock };
});

const questions = {
  version: "deep-v3" as const,
  title: "가치관과 분담 질문",
  valueQuestions: [
    { id: "D1", area: "savings", category: "savings", reverse: false, text: "첫 번째 질문", left: "왼쪽", right: "오른쪽" },
    { id: "D3", area: "spending", category: "spending", reverse: false, text: "세 번째 질문", left: "왼쪽", right: "오른쪽" },
  ],
  scaleLabels: ["왼쪽", "조금 왼쪽", "중간", "조금 오른쪽", "오른쪽"],
  planningQuestions: [],
  followups: [],
  consent: {
    version: "deep-sharing-v2" as const,
    finance: "재무 정보",
    values: "가치관 정보",
    privateNotes: "개인 메모",
  },
};

const input = (values: Record<string, number | null> = {}) => ({
  input: {
    inputVersion: "deep-input-v3",
    assetsStatus: "known",
    debtsStatus: "known",
    values,
    skippedQuestionIds: [],
    importantAreas: [],
    contextNotes: {},
    contribution: { discussionState: "unknown" },
    constraints: [],
  },
  revision: 8,
});

const plan = {
  version: 4,
  plan: {
    planSchemaVersion: "deep-plan-v3",
    fundingAsOf: "2026-09-01",
    startMonth: "2026-10",
    housingType: "rent",
    commonExpensesStatus: "unknown",
    newLoanCertainty: "unknown",
  },
  myConfirmed: true,
  partnerConfirmed: true,
  locked: false,
};

function renderPage(initialEntry = "/deep/submit/session-a") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route element={<DeepSubmitPage />} path="/deep/submit/:sessionId" />
            <Route element={<h1>계획을 다시 확인해요</h1>} path="/deep/plan/:sessionId" />
            <Route element={<IncompleteQuestionsDestination />} path="/deep/questions/:sessionId" />
            <Route element={<h1>결과</h1>} path="/deep/result/:sessionId" />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function IncompleteQuestionsDestination() {
  const [searchParams] = useSearchParams();
  return (
    <>
      <h1>질문으로 돌아왔어요</h1>
      <p data-testid="incomplete-question-ids">{searchParams.getAll("incompleteQuestion").join(",")}</p>
    </>
  );
}

beforeEach(() => {
  fetchDeepInputMock.mockReset();
  fetchDeepPlanMock.mockReset();
  getDeepQuestionsMock.mockReset();
  submitDeepSessionMock.mockReset();
  getDeepQuestionsMock.mockResolvedValue(questions);
  fetchDeepInputMock.mockResolvedValue(input({ D1: 3 }));
  fetchDeepPlanMock.mockResolvedValue(plan);
  submitDeepSessionMock.mockResolvedValue({ status: "waiting", mySubmitted: true, partnerCompleted: false });
});

describe("DeepSubmitPage", () => {
  it("shows the server consent copy and a summary of unanswered value questions", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "제출 전 확인" })).toBeInTheDocument();
    expect(await screen.findByText("세 번째 질문")).toBeInTheDocument();
    expect(screen.getByText("재무 정보")).toBeInTheDocument();
    expect(screen.getByText("가치관 정보")).toBeInTheDocument();
    expect(screen.getByText("개인 메모")).toBeInTheDocument();
  });

  it("treats a null value as an unanswered question", async () => {
    fetchDeepInputMock.mockResolvedValue(input({ D1: null, D3: 3 }));
    renderPage();

    expect(await screen.findByText("첫 번째 질문")).toBeInTheDocument();
    expect(screen.queryByText("세 번째 질문")).not.toBeInTheDocument();
  });

  it("reads the latest revision and plan version immediately before submitting", async () => {
    const { user } = renderPage();
    await screen.findByText("재무 정보");

    await user.click(screen.getByRole("checkbox", { name: "재무 정보 공유" }));
    await user.click(screen.getByRole("button", { name: "제출하기" }));

    expect(submitDeepSessionMock).toHaveBeenCalledWith("session-a", {
      consentVersion: "deep-sharing-v2",
      expectedRevision: 8,
      planVersion: 4,
      shareFinance: true,
      shareValues: false,
    });
    expect(await screen.findByRole("heading", { name: "결과" })).toBeInTheDocument();
  });

  it("returns every incomplete question without exposing raw error codes", async () => {
    submitDeepSessionMock.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "INPUT_INCOMPLETE",
        kind: "validation",
        fieldErrors: {
          "values.D1": ["ANSWER_OR_SKIP_REQUIRED"],
          "values.D3": ["ANSWER_OR_SKIP_REQUIRED"],
        },
      }),
    );
    const { user } = renderPage();
    await screen.findByRole("button", { name: "제출하기" });

    await user.click(screen.getByRole("button", { name: "제출하기" }));

    expect(await screen.findByRole("heading", { name: "질문으로 돌아왔어요" })).toBeInTheDocument();
    expect(screen.getByTestId("incomplete-question-ids")).toHaveTextContent("D1,D3");
    expect(screen.queryByText(/INPUT_INCOMPLETE|ANSWER_OR_SKIP_REQUIRED/)).not.toBeInTheDocument();
  });

  it("returns a stale plan submission to the current plan", async () => {
    submitDeepSessionMock.mockRejectedValue(
      new ApiError({ status: 409, code: "PLAN_VERSION_CONFLICT", kind: "conflict" }),
    );
    const { user } = renderPage();
    await screen.findByRole("button", { name: "제출하기" });

    await user.click(screen.getByRole("button", { name: "제출하기" }));

    expect(await screen.findByRole("heading", { name: "계획을 다시 확인해요" })).toBeInTheDocument();
  });
});
