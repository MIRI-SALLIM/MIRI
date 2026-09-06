import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEEP_STATUS_SUBMITTED_POLL_INTERVAL_MS,
  DEEP_STATUS_WAITING_POLL_INTERVAL_MS,
  useDeepSessionStatus,
} from "./use-deep-session-status";

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
  it("uses slower waiting polls and faster submitted polls", async () => {
    expect(DEEP_STATUS_WAITING_POLL_INTERVAL_MS).toBeGreaterThan(DEEP_STATUS_SUBMITTED_POLL_INTERVAL_MS);
    fetchMock.mockResolvedValue(response({ mySubmitted: false, partnerCompleted: false, status: "waiting" }));

    const { result } = renderHook(() => useDeepSessionStatus("deep-session-a"), { wrapper });
    await waitFor(() => expect(result.current.status?.status).toBe("waiting"));
    expect(result.current.isReady).toBe(false);
  });

  it("stops at the terminal ready state", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(response({ mySubmitted: true, partnerCompleted: true, status: "ready" }));
      const { result } = renderHook(() => useDeepSessionStatus("deep-session-a"), { wrapper });
      await vi.waitFor(() => expect(result.current.isReady).toBe(true));
      const calls = fetchMock.mock.calls.length;

      await vi.advanceTimersByTimeAsync(DEEP_STATUS_WAITING_POLL_INTERVAL_MS * 2);
      expect(fetchMock).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });
});
