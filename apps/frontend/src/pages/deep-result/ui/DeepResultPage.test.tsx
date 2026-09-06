import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeepResultPage } from "./DeepResultPage";

const { fetchDeepResultMock } = vi.hoisted(() => ({ fetchDeepResultMock: vi.fn() }));

vi.mock("@/entities/deep-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-report")>();
  return { ...actual, fetchDeepResult: fetchDeepResultMock };
});

const block = (status: "available" | "partial" | "unavailable", reason: string | null = null) => ({
  status,
  missingFields: status === "partial" ? ["target"] : [],
  assumptions: [],
  data: status === "unavailable" ? null : { amountWon: 120000 },
  reason,
});

const serverLimitations = {
  explanation: "templates_only",
  policyMatching: "unavailable",
  agreementBasis: "submitted_intentions_not_current_agreement",
  notice: "입력한 수치에 따른 참고 계산이며 자산·대출 승인 여부를 검증하지 않습니다. 차이 자체를 관계 평가나 합의로 판정하지 않습니다.",
};

const readyResult = {
  status: "ready" as const,
  report: {
    versions: { report: "deep-v3" },
    cashflow: block("available"),
    housing: block("unavailable", "sharing_not_authorized"),
    goal: block("partial"),
    planning: block("available"),
    values: block("unavailable", "sharing_not_authorized"),
    issues: [
      { code: "HOUSING_UNCERTAIN", observation: "주거 확인이 필요해요.", question: "납부할 금액과 날짜를 확인해 주세요." },
      { code: "UNKNOWN_SERVER_CODE", question: "이 문장은 표시하지 않아요." },
    ],
    topics: [],
    limitations: serverLimitations,
  },
  agreements: [],
  operatingStatus: {},
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/deep/result/session-a"]}>
        <Routes>
          <Route element={<DeepResultPage />} path="/deep/result/:sessionId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => fetchDeepResultMock.mockReset());

describe("DeepResultPage", () => {
  it("keeps the waiting state based only on partnerCompleted", async () => {
    fetchDeepResultMock.mockResolvedValue({ status: "waiting", partnerCompleted: true });
    renderPage();

    expect(await screen.findByRole("heading", { name: "공동 리포트를 준비하고 있어요" })).toBeInTheDocument();
    expect(screen.getByText("상대의 제출 여부를 확인했어요.")).toBeInTheDocument();
    expect(screen.queryByText(/참여했어요|동의하지 않았어요/)).not.toBeInTheDocument();
  });

  it("renders five calculation states, treats sharing authorization as guidance, and skips unknown issues", async () => {
    fetchDeepResultMock.mockResolvedValue({
      ...readyResult,
      report: {
        ...readyResult.report,
        limitations: { ...serverLimitations, futurePolicy: "machine_token_should_be_skipped" },
      },
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "공동 리포트" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "월 현금흐름" })).toBeInTheDocument();
    for (const label of ["월 현금흐름", "주거", "목표", "계획", "가치관"]) {
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("재무 정보 공유에 동의하면 이 계산을 볼 수 있어요.")).toBeInTheDocument();
    expect(screen.getByText("가치관 정보 공유에 동의하면 이 영역을 볼 수 있어요.")).toBeInTheDocument();
    expect(screen.getByText("납부할 금액과 날짜를 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("이 문장은 표시하지 않아요.")).not.toBeInTheDocument();
    expect(screen.getAllByText("공유하지 않음")).toHaveLength(2);
    expect(screen.queryByText("추가 확인 필요")).not.toBeInTheDocument();
    expect(screen.getByText("계산은 정해진 템플릿을 바탕으로 제공돼요.")).toBeInTheDocument();
    expect(screen.getByText("정책·상품 조건과의 일치 여부는 확인하지 않아요.")).toBeInTheDocument();
    expect(screen.getByText("현재 합의가 아닌 제출한 의향을 기준으로 계산해요.")).toBeInTheDocument();
    expect(screen.getByText(serverLimitations.notice)).toBeInTheDocument();
    expect(screen.queryByText(/templates_only|unavailable|submitted_intentions_not_current_agreement|machine_token_should_be_skipped|sharing_not_authorized|UNKNOWN_SERVER_CODE/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "우리 돈의 기준표" })).toHaveAttribute("href", "/deep/agreements/session-a");
    expect(screen.getByRole("link", { name: "질문 다시 보기" })).toHaveAttribute("href", "/deep/questions/session-a");
  });
});
