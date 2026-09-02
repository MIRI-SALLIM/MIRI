import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LightResultPage } from "./LightResultPage";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();

  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const partnerAnswer = "파트너가 선택한 답변은 렌더링되면 안 돼요";

const typeResult = {
  mgmt: "joint",
  mgmtDescription: "함께 공유하고 관리하는 방식을 선호합니다.",
  mgmtLabel: "공동관리형",
  recommendation: "공통 목표를 정해보세요.",
  time: "saver",
  timeDescription: "미래의 안정과 목표를 중시합니다.",
  timeLabel: "미래대비형",
  typeCode: "saver_joint",
  typeDescription: "함께 목표를 세우는 유형입니다.",
  typeName: "함께 모으는 동반자형",
};

const readyResult = {
  status: "ready" as const,
  partnerCompleted: true as const,
  result: {
    discussionTopics: ["공동 생활비의 기준을 정해보세요."],
    mutualHitCount: 4,
    myType: typeResult,
    partnerType: { ...typeResult, typeName: "각자 계획하는 동반자형" },
    questionCount: 7,
    questions: [
      {
        isHit: true,
        isMatch: false,
        myAnswer: 2 as const,
        myAnswerLabel: "저축에 조금 더 비중",
        myGuess: 3 as const,
        partnerAnswer: 3 as const,
        partnerAnswerLabel: partnerAnswer,
        questionId: "spending_style" as const,
        questionText: "현재의 소비와 미래의 저축 중 어느 쪽에 더 가치를 두시나요?",
      },
      {
        isHit: false,
        isMatch: true,
        myAnswer: 1 as const,
        myAnswerLabel: "각자 관리 + 공용 생활비 통장",
        myGuess: 1 as const,
        partnerAnswer: 1 as const,
        partnerAnswerLabel: "각자 관리 + 공용 생활비 통장",
        questionId: "shared_expense" as const,
        questionText: "결혼 후 부부의 돈 관리는 어떤 방식을 선호하시나요?",
      },
    ],
    tagline: "서로의 생각을 이해하고 맞춰가는 첫걸음",
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function renderResult() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/result/light/session-a"]}>
        <Routes>
          <Route element={<LightResultPage />} path="/result/light/:sessionId" />
          <Route
            element={<h1>상대방을 기다리는 중</h1>}
            path="/waiting/:sessionId"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

describe("LightResultPage", () => {
  it("routes waiting results away without exposing partner data", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "waiting", partnerCompleted: false }),
    );

    const { container } = renderResult();

    expect(await screen.findByRole("heading", { name: "상대방을 기다리는 중" })).toBeInTheDocument();
    expect(screen.queryByText(partnerAnswer)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "라이트 결과" })).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain(partnerAnswer);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("renders a ready result with a score based on the response question count", async () => {
    fetchMock.mockResolvedValue(jsonResponse(readyResult));

    const { container } = renderResult();

    expect(await screen.findByRole("heading", { name: "라이트 결과" })).toBeInTheDocument();
    expect(
      await screen.findByText("서로의 생각을 이해하고 맞춰가는 첫걸음"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("4 / 7")).toHaveLength(2);

    const progress = screen.getByRole("progressbar", { name: "서로 맞힌 답" });
    expect(progress).toHaveAttribute("aria-valuemax", "7");
    expect(progress).toHaveAttribute("aria-valuenow", "4");
    expect(progress.querySelector("div")).toHaveStyle({ width: `${(4 / 7) * 100}%` });

    expect(screen.getByText("함께 모으는 동반자형")).toBeInTheDocument();
    expect(screen.getByText("각자 계획하는 동반자형")).toBeInTheDocument();
    screen.getAllByText("미래대비형").forEach((element) => {
      expect(element).toHaveClass("text-ink-muted");
    });
    screen.getAllByText("공동관리형").forEach((element) => {
      expect(element).toHaveClass("text-ink-muted");
    });
    expect(screen.getByText(partnerAnswer)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "결과 공유" })).toHaveAttribute(
      "href",
      "/result/light/session-a/share",
    );
    expect(container.innerHTML).toContain(partnerAnswer);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
