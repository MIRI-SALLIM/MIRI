import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeepPlanPage } from "./DeepPlanPage";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const plan = {
  planSchemaVersion: "deep-plan-v3" as const,
  fundingAsOf: "2026-09-01",
  startMonth: "2026-10",
  housingType: "rent" as const,
  commonExpensesStatus: "unknown" as const,
  newLoanCertainty: "unknown" as const,
};

const serverPlan = (overrides: Record<string, unknown> = {}) => ({
  version: 2,
  plan: { ...plan, ...overrides },
  myConfirmed: false,
  partnerConfirmed: false,
  locked: false,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/deep/plan/session-a"]}>
          <Routes>
            <Route element={<DeepPlanPage />} path="/deep/plan/:sessionId" />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse(serverPlan()));
});

describe("DeepPlanPage", () => {
  it("hydrates from the server and warns before resetting confirmations on save", async () => {
    const { user } = renderPage();

    const startMonth = await screen.findByLabelText("언제부터의 생활을 계산할까요?");
    expect(startMonth).toHaveValue("2026-10");
    await user.clear(startMonth);
    await user.type(startMonth, "2026-11");

    await user.click(screen.getByRole("button", { name: "계획 저장하기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("두 사람의 확인이 풀려요");
    expect(screen.getByRole("button", { name: "저장할까요" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "저장할까요" }));

    const patchRequest = fetchMock.mock.calls
      .map(([input]) => input as Request)
      .find((request) => request.method === "PATCH");
    expect(patchRequest).toBeDefined();
    expect(await patchRequest?.json()).toMatchObject({ expectedVersion: 2, plan: { startMonth: "2026-11" } });
  });

  it("confirms the current version and turns read-only after a locked response", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(serverPlan()))
      .mockResolvedValueOnce(jsonResponse(serverPlan({})))
      .mockResolvedValueOnce(jsonResponse(serverPlan({})))
      .mockResolvedValueOnce(jsonResponse(serverPlan({})))
      .mockResolvedValueOnce(jsonResponse({ ...serverPlan(), locked: true }));
    const { user } = renderPage();

    await screen.findByLabelText("언제부터의 생활을 계산할까요?");
    await user.click(screen.getByRole("button", { name: "이 계획 확인하기" }));

    const confirmRequest = fetchMock.mock.calls
      .map(([input]) => input as Request)
      .find((request) => request.method === "POST");
    expect(confirmRequest).toBeDefined();
    expect(await confirmRequest?.json()).toEqual({ planVersion: 2 });
  });

  it("renders a locked plan as read-only", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...serverPlan(), locked: true }));
    renderPage();

    expect(await screen.findByText("계획이 잠겨 읽기 전용이에요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "계획 저장하기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 계획 확인하기" })).toBeInTheDocument();
  });

  it("continues from the plan into the personal input step", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...serverPlan(), myConfirmed: true }));
    renderPage();

    expect(await screen.findByRole("link", { name: "내 재무 현황으로 가기" })).toHaveAttribute(
      "href",
      "/deep/input/session-a",
    );
  });

  it("refetches after a plan version conflict and explains the next action", async () => {
    const latestPlan = { ...serverPlan({ startMonth: "2026-12" }), version: 3 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(serverPlan()))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "PLAN_VERSION_CONFLICT" } }, 409))
      .mockResolvedValueOnce(jsonResponse(latestPlan));
    const { user } = renderPage();

    const startMonth = await screen.findByLabelText("언제부터의 생활을 계산할까요?");
    await user.clear(startMonth);
    await user.type(startMonth, "2026-11");
    await user.click(screen.getByRole("button", { name: "계획 저장하기" }));
    await user.click(screen.getByRole("button", { name: "저장할까요" }));

    expect(await screen.findByText("다른 사람이 계획을 바꿨어요. 최신 계획을 다시 확인하고 저장할지 정해 주세요.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-12")).toBeInTheDocument();
  });

  it("does not confirm edits that have not been saved", async () => {
    const { user } = renderPage();
    const startMonth = await screen.findByLabelText("언제부터의 생활을 계산할까요?");

    await user.clear(startMonth);
    await user.type(startMonth, "2026-11");

    expect(screen.getByRole("button", { name: "이 계획 확인하기" })).toBeDisabled();
    expect(screen.getByText("저장한 뒤 이 계획을 확인할 수 있어요.")).toBeInTheDocument();
  });

  it("refetches into read-only mode when the server locks the plan", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(serverPlan()))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "PLAN_LOCKED" } }, 409))
      .mockResolvedValueOnce(jsonResponse({ ...serverPlan(), locked: true }));
    const { user } = renderPage();

    const startMonth = await screen.findByLabelText("언제부터의 생활을 계산할까요?");
    await user.clear(startMonth);
    await user.type(startMonth, "2026-11");
    await user.click(screen.getByRole("button", { name: "계획 저장하기" }));
    await user.click(screen.getByRole("button", { name: "저장할까요" }));

    expect(await screen.findByText("계획이 잠겨 읽기 전용이에요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "계획 저장하기" })).not.toBeInTheDocument();
  });
});
