import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEEP_STATUS_POLL_INTERVAL_MS,
  useDeepSessionStatus,
} from "./use-deep-session-status";
import { POLLING_INTERVAL_MS, POLLING_TIMEOUT_MS } from "@/shared/lib";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const response = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  fetchMock.mockReset();
});

describe("useDeepSessionStatus", () => {
  it("uses the shared five-second polling cadence", async () => {
    expect(DEEP_STATUS_POLL_INTERVAL_MS).toBe(POLLING_INTERVAL_MS);
    fetchMock.mockResolvedValue(response({ mySubmitted: false, partnerCompleted: false, status: "waiting" }));

    const { result } = renderHook(() => useDeepSessionStatus("deep-session-a"), { wrapper });
    await waitFor(() => expect(result.current.status?.status).toBe("waiting"));
    expect(result.current.isReady).toBe(false);
  });

  it("stops polling after the shared sixty-second cap", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(response({ mySubmitted: false, partnerCompleted: false, status: "waiting" }));
      const { result } = renderHook(() => useDeepSessionStatus("deep-session-a"), { wrapper });
      await vi.waitFor(() => expect(result.current.status?.status).toBe("waiting"));

      await vi.advanceTimersByTimeAsync(POLLING_TIMEOUT_MS);
      expect(result.current.isTimedOut).toBe(true);
      const calls = fetchMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 2);
      expect(fetchMock).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops at the terminal ready state", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(response({ mySubmitted: true, partnerCompleted: true, status: "ready" }));
      const { result } = renderHook(() => useDeepSessionStatus("deep-session-a"), { wrapper });
      await vi.waitFor(() => expect(result.current.isReady).toBe(true));
      const calls = fetchMock.mock.calls.length;

      await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 2);
      expect(fetchMock).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes an unauthorized terminal error for the session page", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), {
        headers: { "content-type": "application/json" },
        status: 401,
      }),
    );

    const { result } = renderHook(() => useDeepSessionStatus("deep-session-a"), { wrapper });
    await waitFor(() => expect(result.current.terminalError).toBe("unauthorized"));
  });

  it("exposes a not-found terminal error for the session page", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "SESSION_NOT_FOUND" } }), {
        headers: { "content-type": "application/json" },
        status: 404,
      }),
    );

    const { result } = renderHook(() => useDeepSessionStatus("deep-session-a"), { wrapper });
    await waitFor(() => expect(result.current.terminalError).toBe("not-found"));
  });
});
