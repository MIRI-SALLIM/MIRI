import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POLLING_INTERVAL_MS, POLLING_TIMEOUT_MS } from "@/shared/lib";

import { useMeetingContext, useMeetingExplanation } from "./use-meeting-polling";

const { fetchContextMock, fetchExplanationMock } = vi.hoisted(() => ({
  fetchContextMock: vi.fn(),
  fetchExplanationMock: vi.fn(),
}));

vi.mock("@/entities/deep-meeting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-meeting")>();
  return {
    ...actual,
    fetchMeetingContext: fetchContextMock,
    fetchMeetingExplanation: fetchExplanationMock,
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  fetchContextMock.mockReset();
  fetchExplanationMock.mockReset();
});

describe("meeting polling", () => {
  it("polls a waiting explanation with the shared five-second cadence", async () => {
    vi.useFakeTimers();
    try {
      fetchExplanationMock
        .mockResolvedValueOnce({ status: "waiting" })
        .mockResolvedValueOnce({ status: "ready", source: "template", reason: "disabled", brief: {}, cards: [] });
      const { result } = renderHook(() => useMeetingExplanation("session-a"), { wrapper });

      await vi.waitFor(() => expect(result.current.isWaiting).toBe(true));
      await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS);
      await vi.waitFor(() => expect(result.current.isReady).toBe(true));
      expect(fetchExplanationMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the same timeout window for a waiting context", async () => {
    vi.useFakeTimers();
    try {
      fetchContextMock.mockResolvedValue({ status: "waiting" });
      const { result } = renderHook(() => useMeetingContext("session-a"), { wrapper });

      await vi.waitFor(() => expect(result.current.isWaiting).toBe(true));
      await vi.advanceTimersByTimeAsync(POLLING_TIMEOUT_MS);
      expect(result.current.isTimedOut).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
