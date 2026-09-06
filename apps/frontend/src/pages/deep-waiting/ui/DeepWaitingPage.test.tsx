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

function renderWaiting(search = "?inviteCode=INVITE-1&role=A") {
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

  it("links to the completed F11 plan step without exposing later unfinished steps", async () => {
    mockStatus(status());
    renderWaiting();

    expect(await screen.findByRole("heading", { name: "지금 시작할 수 있어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공동 계획 시작하기" })).toHaveAttribute("href", "/deep/plan/session-a");
    expect(screen.queryByRole("link", { name: "결과 보기" })).not.toBeInTheDocument();
  });

  it("uses partnerCompleted to distinguish partner waiting from report preparation", async () => {
    mockStatus(status({ mySubmitted: true, partnerCompleted: false }));
    renderWaiting();

    expect(await screen.findByText("내 제출은 끝났어요. 상대의 제출을 기다리고 있어요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "결과 준비 상태 보기" })).toHaveAttribute(
      "href",
      "/deep/result/session-a",
    );
  });

  it("does not infer partner waiting from a waiting report when partnerCompleted is true", async () => {
    mockStatus(status({ mySubmitted: true, partnerCompleted: true, status: "waiting" }));
    renderWaiting();

    expect(await screen.findByText("두 분 모두 제출했어요. 공동 리포트를 준비하고 있어요.")).toBeInTheDocument();
    expect(screen.queryByText("내 제출은 끝났어요. 상대의 제출을 기다리고 있어요.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "결과 준비 상태 보기" })).toHaveAttribute(
      "href",
      "/deep/result/session-a",
    );
  });

  it("links a published status to the result screen", async () => {
    mockStatus(status({ mySubmitted: true, partnerCompleted: true, status: "ready" }));
    renderWaiting();

    expect(await screen.findByRole("heading", { name: "공동 리포트가 준비됐어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "결과 보기" })).toHaveAttribute("href", "/deep/result/session-a");
  });

  it("does not show an invitation card to the joined participant", async () => {
    mockStatus(status());
    renderWaiting("?inviteCode=INVITE-1&role=B");

    expect(await screen.findByRole("heading", { name: "지금 시작할 수 있어요" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "상대를 초대해요" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("deep-invite-url")).not.toBeInTheDocument();
  });

  it("explains when the creator has no invitation URL to share", async () => {
    mockStatus(status());
    renderWaiting("?role=A");

    expect(await screen.findByRole("heading", { name: "초대 링크를 다시 만들 수 없어요" })).toBeInTheDocument();
    expect(screen.getByText(/현재 세션을 닫으면/)).toBeInTheDocument();
  });

  it("offers a login path when the status request is unauthorized", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), {
        headers: { "content-type": "application/json" },
        status: 401,
      }),
    );
    renderWaiting();

    expect(await screen.findByRole("heading", { name: "로그인이 만료됐어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인하기" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fdeep%2Fwaiting%2Fsession-a",
    );
    expect(screen.queryByText(/자동으로 다시 확인/)).not.toBeInTheDocument();
  });

  it("offers a retry action for a recoverable status request failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("network failed"));
    renderWaiting();

    expect(await screen.findByRole("heading", { name: "세션 상태를 불러오지 못했어요" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 확인하기" })).toBeInTheDocument();
    expect(screen.queryByText(/자동으로 다시 확인/)).not.toBeInTheDocument();
  });

  it("keeps a role-unknown resumed session neutral", async () => {
    mockStatus(status());
    renderWaiting("?inviteCode=INVITE-1");

    expect(await screen.findByRole("heading", { name: "지금 시작할 수 있어요" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "상대를 초대해요" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "초대 링크를 다시 만들 수 없어요" })).not.toBeInTheDocument();
    expect(screen.queryByText(/상대를 초대하고/)).not.toBeInTheDocument();
  });
});
