import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JoinSessionButton } from "./JoinSessionButton";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();

  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const joinedSession = {
  createdAt: "2026-08-17T00:00:00Z",
  id: "session-a",
  invitationCode: "INV-A",
  mode: "light",
  myRole: "invitee",
  participants: [{ hasSubmitted: false, nickname: "상대방 이름", role: "creator" }],
  status: "in_progress",
};

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/invite/INV-A"]}>
        <Routes>
          <Route element={<JoinSessionButton code="INV-A" />} path="/invite/:code" />
          <Route element={<h1>라이트 질문</h1>} path="/light/1" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  sessionStorage.clear();
});

describe("JoinSessionButton", () => {
  it("joins without a nickname, sends an idempotency key, and stores only the public session id", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(joinedSession), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    const user = userEvent.setup();
    renderButton();

    expect(screen.queryByLabelText("닉네임")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "참여하고 시작하기" }));

    expect(await screen.findByRole("heading", { name: "라이트 질문" })).toBeInTheDocument();
    expect(sessionStorage.getItem("activeSessionId")).toBe("session-a");
    expect(sessionStorage.length).toBe(1);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/v1/invitations/INV-A/join");
    expect(request.headers.get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(await request.text()).toBe("");
  });
});
