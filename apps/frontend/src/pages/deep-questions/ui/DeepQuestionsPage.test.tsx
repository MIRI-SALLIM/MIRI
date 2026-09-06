import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeepInputV3 } from "@/entities/deep-input";
import type { DeepQuestions } from "@/entities/deep-question";
import { resetDeepInputStore, useDeepInputStore } from "@/features/save-deep-input";

import { DeepQuestionsPage } from "./DeepQuestionsPage";

const { getDeepQuestionsMock, fetchDeepInputMock, saveDeepInputMock } = vi.hoisted(() => ({
  getDeepQuestionsMock: vi.fn(),
  fetchDeepInputMock: vi.fn(),
  saveDeepInputMock: vi.fn(),
}));

vi.mock("@/entities/deep-question", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-question")>();
  return { ...actual, getDeepQuestions: getDeepQuestionsMock };
});

vi.mock("@/entities/deep-input", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-input")>();
  return { ...actual, fetchDeepInput: fetchDeepInputMock, saveDeepInput: saveDeepInputMock };
});

const questions: DeepQuestions = {
  version: "deep-v3",
  title: "서버 질문 제목",
  valueQuestions: [
    { id: "D1", area: "savings", category: "savings", reverse: true, text: "서버가 준 가치관 질문", left: "왼쪽 문구", right: "오른쪽 문구" },
    { id: "D2", area: "spending", category: "spending", reverse: false, text: "두 번째 서버 질문", left: "왼쪽 둘", right: "오른쪽 둘" },
    { id: "D3", area: "investment", category: "investment", reverse: false, text: "세 번째 서버 질문", left: "왼쪽 셋", right: "오른쪽 셋" },
    { id: "D4", area: "futureArea", category: "future", reverse: false, text: "알 수 없는 영역 질문", left: "왼쪽 넷", right: "오른쪽 넷" },
  ],
  scaleLabels: ["왼쪽에 매우 가까움", "왼쪽에 조금 가까움", "중간", "오른쪽에 조금 가까움", "오른쪽에 매우 가까움"],
  planningQuestions: [
    { id: "C1", text: "서버 C1 질문", type: "amount", bindings: ["contribution.ownMonthly"], options: ["known", "unknown", "withheld"], optional: true, requiresSharedBudget: true },
    { id: "C2", text: "서버 C2 질문", type: "amount", bindings: ["contribution.expectedPartnerMonthly"], options: ["known", "unknown", "withheld"], optional: true, requiresSharedBudget: true },
    { id: "C3", text: "서버 C3 재원 질문", type: "fundingAllocation", bindings: ["funding.sources[].housingAllocationWon"], options: [], optional: true, requiresSharedBudget: false },
    { id: "C4", text: "서버 C4 질문", type: "amounts", bindings: ["contribution.personalSpendingFloor", "contribution.personalSavingFloor"], options: ["known", "unknown", "withheld"], optional: true, requiresSharedBudget: false },
    { id: "C5", text: "서버 C5 질문", type: "constraints", bindings: ["constraints"], options: [], optional: true, requiresSharedBudget: false },
    { id: "C6", text: "서버 C6 질문", type: "choice", bindings: ["contribution.discussionState"], options: ["notDiscussed", "discussing", "believeAgreed", "unknown"], optional: true, requiresSharedBudget: false },
  ],
  followups: [{ id: "budget-reminder", text: "서버 후속 질문", bindings: ["commonExpensesStatus"] }],
  consent: { version: "deep-sharing-v2", finance: "재무", values: "가치관", privateNotes: "개인 메모" },
};

const input = (): DeepInputV3 => ({
  inputVersion: "deep-input-v3",
  assetsStatus: "known",
  debtsStatus: "known",
  values: { D1: 3 },
  skippedQuestionIds: [],
  importantAreas: [],
  contextNotes: {},
  contribution: { discussionState: "unknown" },
  constraints: [],
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/deep/questions/session-a"]}>
          <Routes>
            <Route element={<DeepQuestionsPage />} path="/deep/questions/:sessionId" />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.useRealTimers();
  resetDeepInputStore();
  getDeepQuestionsMock.mockReset();
  fetchDeepInputMock.mockReset();
  saveDeepInputMock.mockReset();
  getDeepQuestionsMock.mockResolvedValue(questions);
  fetchDeepInputMock.mockResolvedValue({ input: input(), revision: 1 });
  saveDeepInputMock.mockImplementation(async (_sessionId: string, _revision: number, nextInput: DeepInputV3) => ({ input: nextInput, revision: 2 }));
});

describe("DeepQuestionsPage", () => {
  it("renders the server questions and leaves C3 out", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "서버 질문 제목" })).toBeInTheDocument();
    expect(screen.getByText("서버가 준 가치관 질문")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "서버 C1 질문" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "서버 C2 질문" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "서버 C4 질문" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "서버 C5 질문" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "서버 C6 질문" })).toBeInTheDocument();
    expect(screen.getByText("서버 후속 질문")).toBeInTheDocument();
    expect(screen.getAllByText("공동비 범위가 정해지지 않아 이 답변은 공동비를 정한 뒤 다시 확인할 수 있어요.")).toHaveLength(2);
    expect(screen.queryByText("서버 C3 재원 질문")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "중요한 영역" })).toBeInTheDocument();
    expect(screen.getByText("가치관에서 특히 이야기하고 싶은 영역을 최대 2개까지 골라 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "투자" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "부채" })).not.toBeInTheDocument();
    expect(screen.queryByText("futureArea")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "D1 중간" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("D1 건너뛰기")).not.toBeInTheDocument();
    expect(screen.queryByText("D1 메모")).not.toBeInTheDocument();
  });

  it("removes a value and adds its id in one skip update, then restores the value on answer", async () => {
    const { user } = renderPage();
    await screen.findByRole("heading", { name: "서버 질문 제목" });

    await user.click(screen.getByRole("button", { name: "D1 건너뛰기" }));
    expect(useDeepInputStore.getState().draft?.values?.D1).toBeUndefined();
    expect(useDeepInputStore.getState().draft?.skippedQuestionIds).toEqual(["D1"]);

    await user.click(screen.getByRole("button", { name: "D1 오른쪽에 매우 가까움" }));
    expect(useDeepInputStore.getState().draft?.values?.D1).toBe(5);
    expect(useDeepInputStore.getState().draft?.skippedQuestionIds).toEqual([]);

    await useDeepInputStore.getState().flush();
    expect(saveDeepInputMock).toHaveBeenCalledWith(
      "session-a",
      1,
      expect.objectContaining({ values: { D1: 5 }, skippedQuestionIds: [] }),
    );
  });

  it("limits important areas, counts notes, and renders centralized planning labels", async () => {
    const { user } = renderPage();
    await screen.findByRole("heading", { name: "서버 질문 제목" });

    await user.click(screen.getByRole("button", { name: "저축" }));
    await user.click(screen.getByRole("button", { name: "소비" }));
    await user.click(screen.getByRole("button", { name: "투자" }));
    expect(useDeepInputStore.getState().draft?.importantAreas).toEqual(["savings", "spending"]);
    expect(screen.getByText("중요한 영역은 최대 2개까지 선택할 수 있어요.")).toBeInTheDocument();

    const note = screen.getByRole("textbox", { name: "D1 메모" });
    await user.type(note, "메모");
    expect(screen.getByText("2/300")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "이야기 중" }));
    expect(useDeepInputStore.getState().draft?.contribution?.discussionState).toBe("discussing");
    await user.click(screen.getByRole("button", { name: "조건 추가" }));
    expect(screen.getByRole("heading", { name: "조건 1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "주거비" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "조건 1 메모" })).toBeInTheDocument();
  });
});
