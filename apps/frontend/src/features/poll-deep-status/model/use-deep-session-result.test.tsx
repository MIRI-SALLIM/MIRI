import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POLLING_INTERVAL_MS, POLLING_TIMEOUT_MS } from "@/shared/lib";

import { useDeepSessionResult } from "./use-deep-session-result";

const { fetchDeepResultMock } = vi.hoisted(() => ({ fetchDeepResultMock: vi.fn() }));

vi.mock("@/entities/deep-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-report")>();
  return { ...actual, fetchDeepResult: fetchDeepResultMock };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  fetchDeepResultMock.mockReset();
});

describe("useDeepSessionResult", () => {
  it("keeps waiting until the result endpoint returns ready", async () => {
    vi.useFakeTimers();
    try {
      fetchDeepResultMock
        .mockResolvedValueOnce({ status: "waiting", partnerCompleted: false })
        .mockResolvedValueOnce({ status: "ready", report: {}, agreements: [], operatingStatus: {} });
      const { result } = renderHook(() => useDeepSessionResult("session-a"), { wrapper });

      await vi.waitFor(() => expect(result.current.isWaiting).toBe(true));
      await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS);
      await vi.waitFor(() => expect(result.current.isReady).toBe(true));
      expect(fetchDeepResultMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes the shared timeout when a partner result is still waiting", async () => {
    vi.useFakeTimers();
    try {
      fetchDeepResultMock.mockResolvedValue({ status: "waiting", partnerCompleted: true });
      const { result } = renderHook(() => useDeepSessionResult("session-a"), { wrapper });

      await vi.waitFor(() => expect(result.current.isWaiting).toBe(true));
      await vi.advanceTimersByTimeAsync(POLLING_TIMEOUT_MS);
      expect(result.current.isTimedOut).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
