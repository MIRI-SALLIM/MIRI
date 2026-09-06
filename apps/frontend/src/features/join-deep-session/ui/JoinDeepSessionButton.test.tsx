import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

import { JoinDeepSessionButton } from "./JoinDeepSessionButton";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const session = {
  id: "deep-session-a",
  invitationCode: "INV-DEEP-A",
  questionVersion: "deep-v3",
  role: "B",
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
      <MemoryRouter initialEntries={["/deep/invite/INV-DEEP-A"]}>
        <Routes>
          <Route element={<JoinDeepSessionButton code="INV-DEEP-A" />} path="/deep/invite/:code" />
          <Route element={<h1>딥 세션이 열렸어요</h1>} path="/deep/waiting/:sessionId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("reuses the same logical join key when the response is lost", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("response lost")).mockResolvedValueOnce(
    new Response(JSON.stringify(session), { headers: { "content-type": "application/json" }, status: 200 }),
  );
  const user = userEvent.setup();
  renderButton();

  await user.click(screen.getByRole("button", { name: "딥 세션 참여하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("참여하지 못했어요");
  await user.click(screen.getByRole("button", { name: "딥 세션 참여하기" }));

  expect(await screen.findByRole("heading", { name: "딥 세션이 열렸어요" })).toBeInTheDocument();
  expect((fetchMock.mock.calls[1][0] as Request).headers.get("Idempotency-Key")).toBe(
    (fetchMock.mock.calls[0][0] as Request).headers.get("Idempotency-Key"),
  );
  expect(sessionStorage.getItem("deepActiveSessionId")).toBe(session.id);
  expect(sessionStorage.getItem("deepActiveSessionRole")).toBe("B");
});

it.each([
  ["SELF_INVITATION", "내가 만든 세션에는 초대받아 참여할 수 없어요."],
  ["SESSION_FULL", "이 세션은 이미 두 사람이 참여했어요."],
  ["IDEMPOTENCY_CONFLICT", "참여 요청이 달라졌어요. 초대 링크를 다시 열어 주세요."],
] as const)("explains the %s conflict without treating it as a successful join", async (code, message) => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ error: { code } }), {
      headers: { "content-type": "application/json" },
      status: 409,
    }),
  );
  const user = userEvent.setup();
  renderButton();

  await user.click(screen.getByRole("button", { name: "딥 세션 참여하기" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByRole("heading", { name: "딥 세션이 열렸어요" })).not.toBeInTheDocument();
});
