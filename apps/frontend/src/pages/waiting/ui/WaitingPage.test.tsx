import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lightResultQueryKey } from "@/features/get-light-result";
import { SESSION_STATUS_POLL_INTERVAL_MS } from "@/features/poll-session-status";

import { WaitingPage } from "./WaitingPage";

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

function sessionStatus(overrides: Record<string, unknown> = {}) {
  return {
    expiresAt: "2026-08-19T12:00:00Z",
    meCompleted: true,
    partnerCompleted: false,
    partnerJoined: false,
    partnerNudgedAt: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(code: string, status: number) {
  return jsonResponse({ error: { code, message: "실패" } }, status);
}

function respondWith({
  me = () => jsonResponse(activeSession, 200),
  nudge = () => jsonResponse({ message: "알림을 전송했습니다.", status: "success" }, 200),
  status = () => jsonResponse(sessionStatus(), 200),
}: {
  me?: () => Response;
  nudge?: () => Response;
  status?: () => Response;
}) {
  fetchMock.mockImplementation(async (request: Request) => {
    const { pathname } = new URL(request.url);

    if (pathname.endsWith("/status")) {
      return status();
    }

    if (pathname.endsWith("/nudge")) {
      return nudge();
    }

    if (pathname === "/api/v1/me/session") {
      return me();
    }

    throw new Error(`unexpected request: ${pathname}`);
  });
}

function statusCallCount() {
  return fetchMock.mock.calls.filter(([request]) =>
    new URL((request as Request).url).pathname.endsWith("/status"),
  ).length;
}

/**
 * @testing-library/dom 10.4.1의 `jestFakeTimersAreEnabled`는 `jest`만 감지해서
 * vitest 가짜 타이머 아래에서는 `findBy*`/`waitFor`가 스스로 타이머를 못 돌린다.
 * 그래서 타이머가 필요한 테스트는 직접 흘려보낸다.
 */
async function flush(milliseconds = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

function renderWaiting(queryClient = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/waiting/session-a"]}>
        <Routes>
          <Route element={<WaitingPage />} path="/waiting/:sessionId" />
          <Route element={<h1>라이트 결과</h1>} path="/result/light/:sessionId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fetchMock.mockReset();
  respondWith({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WaitingPage", () => {
  it("offers the invitation link again while the partner has not joined", async () => {
    const user = userEvent.setup();
    renderWaiting();

    expect(await screen.findByText("아직 상대가 들어오지 않았어요")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "초대 링크 복사" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "알림 보내기" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "잠긴 결과 미리보기" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "초대 링크 복사" }));
    await expect(navigator.clipboard.readText()).resolves.toContain("/invite/INV-A");
  });

  it("nudges the partner once they joined but have not submitted", async () => {
    respondWith({ status: () => jsonResponse(sessionStatus({ partnerJoined: true }), 200) });

    const user = userEvent.setup();
    renderWaiting();

    expect(await screen.findByText("상대가 답을 고르는 중이에요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 링크 복사" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "잠긴 결과 미리보기" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "알림 보내기" }));

    expect(await screen.findByText("상대에게 알림을 보냈어요.")).toBeInTheDocument();
  });

  it("explains when the nudge hits the daily limit", async () => {
    respondWith({
      nudge: () => errorResponse("TOO_MANY_REQUESTS", 429),
      status: () => jsonResponse(sessionStatus({ partnerJoined: true }), 200),
    });

    const user = userEvent.setup();
    renderWaiting();

    await user.click(await screen.findByRole("button", { name: "알림 보내기" }));

    expect(
      await screen.findByText("알림은 24시간에 한 번만 보낼 수 있어요. 내일 다시 시도해 주세요."),
    ).toBeInTheDocument();
  });

  it("unlocks the result only when both sides submitted", async () => {
    respondWith({
      status: () => jsonResponse(sessionStatus({ partnerCompleted: true, partnerJoined: true }), 200),
    });

    renderWaiting();

    expect(await screen.findByText("결과가 준비됐어요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "결과 보기" })).toHaveAttribute(
      "href",
      "/result/light/session-a",
    );
    expect(screen.queryByRole("img", { name: "잠긴 결과 미리보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "알림 보내기" })).not.toBeInTheDocument();
  });

  it("drops a cached waiting result once the reveal unlocks", async () => {
    respondWith({
      status: () => jsonResponse(sessionStatus({ partnerCompleted: true, partnerJoined: true }), 200),
    });

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(lightResultQueryKey("session-a"), {
      partnerCompleted: false,
      status: "waiting",
    });

    renderWaiting(queryClient);

    expect(await screen.findByText("결과가 준비됐어요")).toBeInTheDocument();
    expect(queryClient.getQueryData(lightResultQueryKey("session-a"))).toBeUndefined();
  });

  it("reports an expired session", async () => {
    respondWith({ status: () => errorResponse("SESSION_EXPIRED", 410) });

    renderWaiting();

    expect(await screen.findByText("이 세션은 만료됐어요")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "잠긴 결과 미리보기" })).not.toBeInTheDocument();
  });

  it("shows the copied feedback for 1.6 seconds", async () => {
    vi.useFakeTimers();
    renderWaiting();
    await flush();
    // 초대 링크 조회는 상태 응답을 받은 다음에야 시작한다.
    await flush();

    // 가짜 타이머 아래에서는 user-event의 내부 대기가 진행되지 않아 fireEvent를 쓴다.
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 복사" }));
    await flush();

    expect(screen.getByRole("button", { name: "복사됨" })).toBeInTheDocument();

    await flush(1_600);

    expect(screen.getByRole("button", { name: "초대 링크 복사" })).toBeInTheDocument();
  });

  it("polls the session status at the configured interval while waiting", async () => {
    vi.useFakeTimers();
    renderWaiting();
    await flush();

    expect(screen.getByText("아직 상대가 들어오지 않았어요")).toBeInTheDocument();
    const before = statusCallCount();

    await flush(SESSION_STATUS_POLL_INTERVAL_MS);

    expect(statusCallCount()).toBe(before + 1);
  });

  it("polls well inside the three-second reveal budget", () => {
    // 스펙의 3초 공개 예산(vertical-slice-design.md:27)보다 주기가 크거나 같으면
    // 대기 중인 참가자가 다음 tick을 기다리는 것만으로 예산을 넘긴다.
    // 하한은 잠그지 않는다 -- 요청 예산이 정해지지 않아 어떤 값도 임의가 된다.
    expect(SESSION_STATUS_POLL_INTERVAL_MS).toBeLessThan(3_000);
  });

  it("stops polling once the result is ready", async () => {
    respondWith({
      status: () => jsonResponse(sessionStatus({ partnerCompleted: true, partnerJoined: true }), 200),
    });

    vi.useFakeTimers();
    renderWaiting();
    await flush();

    expect(screen.getByText("결과가 준비됐어요")).toBeInTheDocument();
    const before = statusCallCount();

    await flush(9_000);

    expect(statusCallCount()).toBe(before);
  });
});
