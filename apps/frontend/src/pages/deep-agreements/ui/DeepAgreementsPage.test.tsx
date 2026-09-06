import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeepAgreementsPage } from "./DeepAgreementsPage";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const terms = {
  topic: "monthlyContribution" as const,
  scope: "주거비와 식비",
  owner: "both" as const,
  startMonth: "2026-10",
  dueDay: 25,
  monthlyContributions: { A: 1_000_000, B: 1_000_000 },
  commonScope: ["housing", "food"] as const,
  exceptions: "",
};

const agreement = (overrides: Record<string, unknown> = {}) => ({
  id: "agreement-a",
  version: 1,
  round: 2,
  text: "매월 100만 원씩 공동비로 사용해요.",
  reviewOn: null,
  status: "proposed" as const,
  myConfirmed: false,
  partnerConfirmed: false,
  terms,
  planVersion: 3,
  sourceReportId: "report-a",
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });

function mockAgreementEndpoints(initial: unknown[] = [agreement()]) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === undefined) return jsonResponse(initial);
    const request = input instanceof Request ? input.clone() : new Request(input, init);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.endsWith("/agreements")) return jsonResponse(initial);
    if (request.method === "GET" && url.pathname.endsWith("/rounds")) {
      return jsonResponse({ round: 2, myRequested: false, partnerRequested: false });
    }
    if (request.method === "POST" && url.pathname.endsWith("/agreements")) return jsonResponse(agreement(), 201);
    if (request.method === "PATCH" || (request.method === "POST" && /\/(confirm|defer)$/.test(url.pathname))) {
      return jsonResponse({ ...(initial[0] ?? agreement()), myConfirmed: true, status: url.pathname.endsWith("/defer") ? "deferred" : "proposed" });
    }
    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/deep/agreements/session-a"]}>
          <Routes>
            <Route element={<DeepAgreementsPage />} path="/deep/agreements/:sessionId" />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => fetchMock.mockReset());

describe("DeepAgreementsPage", () => {
  it("renders translated topic/status labels and the partner confirmation as received", async () => {
    mockAgreementEndpoints([agreement({ partnerConfirmed: false })]);
    renderPage();

    expect(await screen.findByText("월 분담")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "우리 돈의 기준표" })).toBeInTheDocument();
    expect(screen.getByText("제안됨")).toBeInTheDocument();
    expect(screen.getByText(/상대 확인:/)).toHaveTextContent("상대 확인: 아직 확인하지 않았어요.");
    expect(screen.queryByText(/monthlyContribution|proposed|partnerConfirmed/)).not.toBeInTheDocument();
  });

  it("blocks a monthly proposal with only one person's amount before POST", async () => {
    mockAgreementEndpoints([]);
    const { user } = renderPage();

    await user.click(await screen.findByRole("button", { name: "새 기준 제안하기" }));
    await user.type(await screen.findByRole("textbox", { name: "기준 내용" }), "매월 함께 낼 금액을 정해요.");
    await user.type(await screen.findByRole("textbox", { name: "정한 범위" }), "주거비와 식비");
    fireEvent.change(document.getElementById("agreement-start-month") as HTMLInputElement, { target: { value: "2026-10" } });
    await user.type(await screen.findByRole("spinbutton", { name: "A 월 분담액" }), "1000000");
    await user.click(screen.getByRole("button", { name: "기준 제안하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A와 B의 월 분담액을 모두 입력해 주세요.");
    expect(fetchMock.mock.calls.filter(([input]) => (input as Request).method === "POST")).toHaveLength(0);
  });

  it("uses the server round for a proposal and the response for the refreshed list", async () => {
    mockAgreementEndpoints([]);
    const { user } = renderPage();

    await user.click(await screen.findByRole("button", { name: "새 기준 제안하기" }));
    await user.type(await screen.findByRole("textbox", { name: "기준 내용" }), "매월 함께 낼 금액을 정해요.");
    await user.type(await screen.findByRole("textbox", { name: "정한 범위" }), "주거비와 식비");
    fireEvent.change(document.getElementById("agreement-start-month") as HTMLInputElement, { target: { value: "2026-10" } });
    await user.type(await screen.findByRole("spinbutton", { name: "A 월 분담액" }), "1000000");
    await user.type(await screen.findByRole("spinbutton", { name: "B 월 분담액" }), "1000000");
    await user.click(screen.getByRole("button", { name: "기준 제안하기" }));

    const proposalRequest = fetchMock.mock.calls
      .map(([input]) => input as Request)
      .find((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/agreements"));
    expect(proposalRequest).toBeDefined();
    expect(await proposalRequest?.json()).toMatchObject({ expectedRound: 2, terms: { monthlyContributions: { A: 1_000_000, B: 1_000_000 } } });
    expect(await screen.findByText("매월 100만 원씩 공동비로 사용해요.")).toBeInTheDocument();
  });

  it("hides monthly-only fields after choosing another topic", async () => {
    mockAgreementEndpoints([]);
    const { user } = renderPage();

    await user.click(await screen.findByRole("button", { name: "새 기준 제안하기" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "주제" }), "savings");

    expect(screen.queryByLabelText("A 월 분담액")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("B 월 분담액")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "공동비 포함 항목" })).not.toBeInTheDocument();
  });

  it("uses expectedVersion for confirmation and keeps the received partner flag", async () => {
    mockAgreementEndpoints([agreement({ partnerConfirmed: true })]);
    const { user } = renderPage();

    await screen.findByText("월 분담");
    await user.click(await screen.findByRole("button", { name: "이 기준 확인하기" }));

    const request = fetchMock.mock.calls
      .map(([input]) => input as Request)
      .find((input) => new URL(input.url).pathname.endsWith("/confirm"));
    expect(request).toBeDefined();
    expect(await request?.json()).toEqual({ expectedVersion: 1 });
    expect(screen.getByText(/상대 확인:/)).toHaveTextContent("상대 확인: 확인했어요.");
  });
});
