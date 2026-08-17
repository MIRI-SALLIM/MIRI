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

async function openNicknameDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "가볍게 맞춰보기" }));

  return screen.getByRole("dialog", { name: "닉네임 입력" });
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

  it("asks for a nickname before creating a session", async () => {
    const { user } = renderLanding();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await openNicknameDialog(user);

    expect(screen.getByLabelText("닉네임")).toHaveValue("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a light session and moves to the first question", async () => {
    const { user } = renderLanding();

    await openNicknameDialog(user);
    await user.type(screen.getByLabelText("닉네임"), "예랑이");
    await user.click(screen.getByRole("button", { name: "시작하기" }));

    expect(await screen.findByRole("heading", { name: "라이트 질문" })).toBeInTheDocument();

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/v1/sessions");
    expect(request.headers.get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    await expect(request.json()).resolves.toEqual({ mode: "light", nickname: "예랑이" });
  });

  it("stores the public session id without the nickname", async () => {
    const { user } = renderLanding();

    await openNicknameDialog(user);
    await user.type(screen.getByLabelText("닉네임"), "예랑이");
    await user.click(screen.getByRole("button", { name: "시작하기" }));

    await waitFor(() => expect(sessionStorage.getItem("activeSessionId")).toBe("session-a"));
    expect(storageKeys(sessionStorage)).toEqual(["activeSessionId"]);
    expect(storageKeys(localStorage)).toEqual([]);
  });

  it("blocks an empty nickname", async () => {
    const { user } = renderLanding();

    await openNicknameDialog(user);
    await user.click(screen.getByRole("button", { name: "시작하기" }));

    expect(await screen.findByText("닉네임을 입력해 주세요.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "닉네임 입력" })).toBeInTheDocument();
  });

  it("blocks a nickname longer than 20 characters", async () => {
    const { user } = renderLanding();

    await openNicknameDialog(user);
    await user.type(screen.getByLabelText("닉네임"), "가".repeat(21));
    await user.click(screen.getByRole("button", { name: "시작하기" }));

    expect(await screen.findByText("닉네임은 20자까지 쓸 수 있어요.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the visitor on the landing page when the session request fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "INTERNAL_SERVER_ERROR", message: "실패" } }, 500),
    );

    const { user } = renderLanding();

    await openNicknameDialog(user);
    await user.type(screen.getByLabelText("닉네임"), "예랑이");
    await user.click(screen.getByRole("button", { name: "시작하기" }));

    expect(
      await screen.findByText("세션을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("activeSessionId")).toBeNull();
    expect(screen.queryByRole("heading", { name: "라이트 질문" })).not.toBeInTheDocument();
  });
});
