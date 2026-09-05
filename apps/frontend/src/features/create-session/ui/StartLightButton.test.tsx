import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

import { StartLightButton } from "./StartLightButton";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

beforeEach(() => {
  fetchMock.mockReset();
  sessionStorage.clear();
});

it("retries session creation with the same key and starts the next operation with a new key", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("response lost"));
  const response = () => new Response(JSON.stringify({
    id: "session-a", invitationCode: "INV-A", mode: "light", myRole: "creator",
    status: "in_progress", createdAt: "2026-09-05T00:00:00Z",
    participants: [{ role: "creator", nickname: null, hasSubmitted: false }],
  }), { status: 201, headers: { "content-type": "application/json" } });
  fetchMock.mockImplementation(response);
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const user = userEvent.setup();
  const view = () => render(<QueryClientProvider client={queryClient}>
    <MemoryRouter><Routes>
      <Route path="/" element={<StartLightButton />} />
      <Route path="/light/1" element={<h1>질문 시작</h1>} />
    </Routes></MemoryRouter>
  </QueryClientProvider>);
  const firstView = view();
  await user.click(screen.getByRole("button", { name: "가볍게 맞춰보기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("세션을 시작하지 못했어요");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(sessionStorage.length).toBe(0);
  await user.click(screen.getByRole("button", { name: "가볍게 맞춰보기" }));
  expect(await screen.findByRole("heading", { name: "질문 시작" })).toBeInTheDocument();
  const keys = () => fetchMock.mock.calls.map(([request]) => (request as Request).headers.get("Idempotency-Key"));
  expect(keys()[0]).toBeTruthy();
  expect(keys()[1]).toBe(keys()[0]);
  expect(sessionStorage.length).toBe(1);
  firstView.unmount();
  view();
  await user.click(screen.getByRole("button", { name: "가볍게 맞춰보기" }));
  expect(await screen.findByRole("heading", { name: "질문 시작" })).toBeInTheDocument();
  expect(keys()[2]).not.toBe(keys()[0]);
});
