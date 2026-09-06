import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

import { StartDeepSessionButton } from "./StartDeepSessionButton";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const session = {
  id: "deep-session-a",
  invitationCode: "INV-DEEP-A",
  questionVersion: "deep-v3",
  role: "A",
  round: 1,
};

beforeEach(() => {
  fetchMock.mockReset();
  sessionStorage.clear();
});

function renderButton() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/deep"]}>
        <Routes>
          <Route element={<StartDeepSessionButton />} path="/deep" />
          <Route element={<WaitingRoute />} path="/deep/waiting/:sessionId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function WaitingRoute() {
  const location = useLocation();
  return <h1 data-testid="waiting-location">{location.pathname}{location.search}</h1>;
}

it("creates a session, removes the invitation from the URL, and stores its id and role", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(session), { headers: { "content-type": "application/json" }, status: 201 }),
  );
  const user = userEvent.setup();
  renderButton();

  await user.click(screen.getByRole("button", { name: "딥 세션 시작하기" }));

  expect(await screen.findByTestId("waiting-location")).toHaveTextContent(
    "/deep/waiting/deep-session-a",
  );
  expect(sessionStorage).toHaveLength(2);
  expect(sessionStorage.getItem("deepActiveSessionId")).toBe(session.id);
  expect(sessionStorage.getItem("deepActiveSessionRole")).toBe("A");
  const request = fetchMock.mock.calls[0][0] as Request;
  expect(request.headers.get("Idempotency-Key")).toBeTruthy();
});

it("still opens the waiting page when session storage is blocked", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(session), { headers: { "content-type": "application/json" }, status: 201 }),
  );
  const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage blocked");
  });
  const user = userEvent.setup();
  renderButton();

  await user.click(screen.getByRole("button", { name: "딥 세션 시작하기" }));

  expect(await screen.findByTestId("waiting-location")).toHaveTextContent("/deep/waiting/deep-session-a");
  setItem.mockRestore();
});
