import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LandingPage } from "./LandingPage";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();

  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const createdSession = {
  createdAt: "2026-08-17T00:00:00Z",
  id: "session-a",
  invitationCode: "INV-A",
  mode: "light",
  myRole: "creator",
  status: "in_progress",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function storageKeys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index));
}

function renderLanding() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<LandingPage />} path="/" />
            <Route element={<h1>라이트 질문</h1>} path="/light/:step" />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

async function startSession(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "가볍게 맞춰보기" }));
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse(createdSession, 201));
});

describe("LandingPage", () => {
  it("introduces the light mode with the privacy promises", () => {
    renderLanding();

    expect(screen.getByText("둘이 함께하는 3분 재무 대화")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "돈 이야기, 다투기 전에 맞춰봐요" }),
    ).toBeInTheDocument();

    const promises = screen.getByRole("list", { name: "개인정보 약속" });
    expect(within(promises).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "회원가입도 로그인도 없어요",
      "내 답은 둘 다 제출한 뒤에만 열려요",
      "세션이 만료되면 입력한 내용도 사라져요",
    ]);
  });

  it("shows both mode cards and keeps the 15 minute mode disabled", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 3, name: "3분 모드" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "15분 모드" })).toBeInTheDocument();

    const deepModeCta = screen.getByRole("button", { name: "준비 중" });
    expect(deepModeCta).toBeDisabled();
  });

  it("lists the four steps of the shared flow", () => {
    renderLanding();

    const steps = screen.getByRole("list", { name: "함께하는 방법 4단계" });
    expect(within(steps).getAllByRole("heading", { level: 3 }).map((step) => step.textContent)).toEqual([
      "내가 먼저 답해요",
      "초대 링크를 보내요",
      "상대가 끝낼 때까지 기다려요",
      "결과를 동시에 열어요",
    ]);
  });

  it("renders the provided illustrations with their alt text", () => {
    renderLanding();

    expect(screen.getByAltText("이야기를 나누는 두 사람 일러스트")).toBeInTheDocument();
    expect(screen.getByAltText("3분 모드 아이콘")).toBeInTheDocument();
  });

  it("creates a light session with no name step and moves to the first question", async () => {
    const { user } = renderLanding();

    await startSession(user);

    expect(await screen.findByRole("heading", { name: "라이트 질문" })).toBeInTheDocument();

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/v1/sessions");
    expect(request.headers.get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    // 무기명 진입: 본문은 mode 하나뿐이고 nickname 키 자체가 없다.
    await expect(request.json()).resolves.toEqual({ mode: "light" });
  });

  it("never asks the visitor for a name", async () => {
    const { user } = renderLanding();

    await startSession(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("닉네임")).not.toBeInTheDocument();
  });

  it("stores only the public session id", async () => {
    const { user } = renderLanding();

    await startSession(user);

    await waitFor(() => expect(sessionStorage.getItem("activeSessionId")).toBe("session-a"));
    expect(storageKeys(sessionStorage)).toEqual(["activeSessionId"]);
    expect(storageKeys(localStorage)).toEqual([]);
  });

  it("keeps the visitor on the landing page when the session request fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "INTERNAL_SERVER_ERROR", message: "실패" } }, 500),
    );

    const { user } = renderLanding();

    await startSession(user);

    expect(
      await screen.findByText("세션을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("activeSessionId")).toBeNull();
    expect(screen.queryByRole("heading", { name: "라이트 질문" })).not.toBeInTheDocument();
  });
});
