import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeepWaitingPage } from "./DeepWaitingPage";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const status = (overrides: Record<string, unknown> = {}) => ({
  status: "waiting",
  mySubmitted: false,
  partnerCompleted: false,
  ...overrides,
});

function mockStatus(body: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input.clone() : new Request(input, init);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/v1/deep/v3/sessions/session-a/status") {
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 });
    }
    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
  });
}

function renderWaiting(search = "?inviteCode=INVITE-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/deep/waiting/session-a${search}`]}>
          <Routes>
            <Route element={<DeepWaitingPage />} path="/deep/waiting/:sessionId" />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("DeepWaitingPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("copies the join URL, not the current waiting URL", async () => {
    mockStatus(status());
    const { user } = renderWaiting();
    const button = await screen.findByRole("button", { name: "초대 링크 복사" });

    // userEvent.setup()이 자체 clipboard를 심으므로 그 뒤에 덮어써야 한다.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await user.click(button);

    // 대기 URL을 복사하면 상대는 참여 버튼이 없는 화면에 도착한다.
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/deep/invite/INVITE-1`);
  });

  it("offers the next step without waiting for the partner", async () => {
    mockStatus(status());
    renderWaiting();

    // 서버는 파트너 참여 여부를 알려주지 않고, 계획·입력은 혼자서도 저장된다.
    expect(await screen.findByRole("link", { name: "다음 단계 보기" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지금 시작할 수 있어요" })).toBeInTheDocument();
  });

  it("says it is waiting for the partner only once I have submitted", async () => {
    mockStatus(status({ mySubmitted: true }));
    renderWaiting();

    expect(await screen.findByText("내 제출은 끝났어요. 상대의 제출을 기다리고 있어요.")).toBeInTheDocument();
  });
});
