import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvitePage } from "./InvitePage";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();

  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const invitation = {
  duration: "3분",
  expiresAt: "2026-08-19T12:00:00Z",
  mode: "light",
  nickname: "상대방 이름",
};

const joinedSession = {
  createdAt: "2026-08-17T00:00:00Z",
  id: "session-a",
  invitationCode: "INV-A",
  mode: "light",
  myRole: "invitee",
  participants: [{ hasSubmitted: false, nickname: "상대방 이름", role: "creator" }],
  status: "in_progress",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function renderInvite(queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/invite/INV-A"]}>
        <Routes>
          <Route element={<InvitePage />} path="/invite/:code" />
          <Route element={<h1>라이트 질문</h1>} path="/light/1" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  sessionStorage.clear();
  fetchMock.mockImplementation(async (request: Request) => {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/api/v1/invitations/INV-A") {
      return jsonResponse(invitation);
    }

    if (request.method === "POST" && pathname === "/api/v1/invitations/INV-A/join") {
      return jsonResponse(joinedSession);
    }

    throw new Error(`unexpected request: ${request.method} ${pathname}`);
  });
});

describe("InvitePage", () => {
  it("preserves join recovery when a background preview refetch sees the occupied invitation", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const keys: (string | null)[] = [];
    let previews = 0;
    fetchMock.mockImplementation(async (request: Request) => {
      if (request.method === "GET") {
        previews += 1;
        return previews === 1 ? jsonResponse(invitation)
          : jsonResponse({ error: { code: "INVITATION_NOT_FOUND", message: "없음" } }, 404);
      }
      keys.push(request.headers.get("Idempotency-Key"));
      if (keys.length === 1) throw new TypeError("response lost after successful join");
      return jsonResponse(joinedSession);
    });
    const user = userEvent.setup();
    renderInvite(queryClient);
    await user.click(await screen.findByRole("button", { name: "참여하고 시작하기" }));
    expect(await screen.findByText("참여하지 못했어요. 잠시 후 다시 시도해 주세요.")).toBeInTheDocument();
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["invitation", "INV-A"] }); });
    expect(previews).toBe(2);
    expect(keys).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "참여하고 시작하기" }));
    expect(await screen.findByRole("heading", { name: "라이트 질문" })).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("explains the anonymous partner invitation and simultaneous privacy before joining", async () => {
    renderInvite();

    expect(await screen.findByText("파트너가 함께 해보자고 초대했어요")).toBeInTheDocument();
    expect(screen.getByText("3분 모드")).toBeInTheDocument();
    expect(screen.getByText("예상 소요 3분")).toBeInTheDocument();
    expect(screen.getByText("둘 다 답변을 마치면 결과를 동시에 공개해요.")).toBeInTheDocument();
    expect(screen.getByText("답변은 결과가 준비될 때까지 상대에게 보이지 않아요.")).toBeInTheDocument();
    expect(screen.queryByText("상대방 이름")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "참여하고 시작하기" })).toBeInTheDocument();
  });

  it("explains when the invitation code is no longer available", async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ error: { code: "INVITATION_NOT_FOUND", message: "없음" } }, 404),
    );

    renderInvite();

    expect(await screen.findByText("사용할 수 없는 초대 링크예요")).toBeInTheDocument();
    expect(screen.getByText("초대 코드가 만료됐거나 이미 사용됐어요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "참여하고 시작하기" })).not.toBeInTheDocument();
  });

  it("stores the joined session id and starts the light flow", async () => {
    const user = userEvent.setup();
    renderInvite();

    await user.click(await screen.findByRole("button", { name: "참여하고 시작하기" }));

    expect(await screen.findByRole("heading", { name: "라이트 질문" })).toBeInTheDocument();
    expect(sessionStorage.getItem("activeSessionId")).toBe("session-a");
  });
});
