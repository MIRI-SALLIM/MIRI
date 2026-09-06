import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

import { WithdrawDeepSessionButton } from "./WithdrawDeepSessionButton";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

beforeEach(() => {
  fetchMock.mockReset();
  sessionStorage.clear();
  sessionStorage.setItem("deepActiveSessionId", "deep-session-a");
});

it("requires confirmation before closing a session and clears its public id", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ status: "closed" }), { headers: { "content-type": "application/json" } }),
  );
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MemoryRouter initialEntries={["/deep/waiting/deep-session-a"]}>
        <Routes>
          <Route element={<WithdrawDeepSessionButton sessionId="deep-session-a" />} path="/deep/waiting/:sessionId" />
          <Route element={<h1>딥모드 시작</h1>} path="/deep" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole("button", { name: "세션 나가기" }));
  expect(screen.getByRole("button", { name: "세션 닫기" })).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "세션 닫기" }));

  expect(await screen.findByRole("heading", { name: "딥모드 시작" })).toBeInTheDocument();
  expect(sessionStorage.getItem("deepActiveSessionId")).toBeNull();
});
