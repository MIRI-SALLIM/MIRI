import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeepEntryPage } from "./DeepEntryPage";

const { fetchMock, useAccountMock } = vi.hoisted(() => ({ fetchMock: vi.fn(), useAccountMock: vi.fn() }));

vi.mock("@/entities/account", () => ({ useAccount: useAccountMock }));
vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const STORAGE_KEY = "deepActiveSessionId";

function respondWith(status: number, body: unknown) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input.clone() : new Request(input, init);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/v1/deep/v3/sessions/session-a/status") {
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
    }
    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
  });
}

function renderHub() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/deep"]}>
        <DeepEntryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DeepEntryPage active session", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sessionStorage.clear();
    useAccountMock.mockReturnValue({ state: "authenticated", userId: "u1" });
    sessionStorage.setItem(STORAGE_KEY, "session-a");
  });

  it("does not offer a new session while a transient failure leaves the answer unknown", async () => {
    // 딥에는 세션 목록 조회가 없다. 여기서 새로 만들면 저장된 UUID가 덮어써지고
    // 원래 세션은 복구 경로를 영구히 잃는다. 한 번의 503을 "없음"으로 읽으면 안 된다.
    respondWith(503, { error: { code: "DEEP_UNAVAILABLE", message: "" } });
    renderHub();

    expect(await screen.findByRole("heading", { name: "진행 중인 세션을 확인하지 못했어요" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "새 세션을 시작해요" })).not.toBeInTheDocument();
  });

  it("offers a new session once the server says the old one is gone", async () => {
    respondWith(410, { error: { code: "SESSION_EXPIRED_OR_CLOSED", message: "" } });
    renderHub();

    // 만료·종료는 확정된 답이라 새로 시작해도 잃을 것이 없다.
    expect(await screen.findByRole("heading", { name: "새 세션을 시작해요" })).toBeInTheDocument();
  });

  it("offers only the resume path while a session is live", async () => {
    respondWith(200, { status: "waiting", mySubmitted: false, partnerCompleted: false });
    renderHub();

    expect(await screen.findByRole("link", { name: "이어서 하기" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "새 세션을 시작해요" })).not.toBeInTheDocument();
  });
});
