import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DonePage } from "./DonePage";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();

  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const activeSession = {
  createdAt: "2026-08-17T00:00:00Z",
  id: "session-a",
  invitationCode: "INV-A",
  mode: "light",
  myRole: "creator",
  status: "in_progress",
};

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(activeSession), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );
});

describe("DonePage", () => {
  it("shows the invitation code, retention notice, and read-only next steps", async () => {
    sessionStorage.setItem("activeSessionId", "session-a");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/done"]}>
          <DonePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "제출 완료" })).toBeInTheDocument();
    expect(await screen.findByText("INV-A")).toBeInTheDocument();
    expect(screen.getByText(/7일 후/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "입력 다시 보기" })).toHaveAttribute("href", "/light/1");
    expect(screen.getByRole("link", { name: "상대방을 기다리러 가기" })).toHaveAttribute(
      "href",
      "/waiting/session-a",
    );
    expect(screen.getByRole("link", { name: "처음으로" })).toHaveAttribute("href", "/");
  });
});
