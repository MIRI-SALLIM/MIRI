import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POLLING_INTERVAL_MS,
  POLLING_TIMEOUT_MS,
  getPollingInterval,
  usePollingWindow,
} from "./polling";

describe("bounded polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules five-second polls only inside the sixty-second window", () => {
    const startedAt = Date.now();

    expect(getPollingInterval({ startedAt, now: startedAt })).toBe(POLLING_INTERVAL_MS);
    expect(getPollingInterval({ startedAt, now: startedAt + POLLING_TIMEOUT_MS - 1 })).toBe(POLLING_INTERVAL_MS);
    expect(getPollingInterval({ startedAt, now: startedAt + POLLING_TIMEOUT_MS })).toBe(false);
    expect(getPollingInterval({ startedAt, now: startedAt, stopped: true })).toBe(false);
    expect(getPollingInterval({ startedAt, now: startedAt, visible: false })).toBe(false);
  });

  it("pauses while the document is hidden and resumes after visibility returns", () => {
    const { result } = renderHook(() => usePollingWindow(true));

    expect(result.current.isPolling).toBe(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current.isPolling).toBe(false);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current.isPolling).toBe(true);
  });

  it("does not schedule polls while disabled", () => {
    const { result } = renderHook(() => usePollingWindow(false));

    expect(result.current.isPolling).toBe(false);
    expect(result.current.getInterval()).toBe(false);
  });

  it("stops after the cap and restarts a fresh window when requested", () => {
    const { result } = renderHook(() => usePollingWindow(true));

    act(() => {
      vi.advanceTimersByTime(POLLING_TIMEOUT_MS);
    });
    expect(result.current.isTimedOut).toBe(true);
    expect(result.current.isPolling).toBe(false);

    act(() => {
      result.current.restart();
    });
    expect(result.current.isTimedOut).toBe(false);
    expect(result.current.isPolling).toBe(true);
  });

  it("cleans the visibility listener and timeout when unmounted", () => {
    const removeEventListener = vi.spyOn(document, "removeEventListener");
    const clearTimeout = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = renderHook(() => usePollingWindow(true));

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(clearTimeout).toHaveBeenCalled();
    removeEventListener.mockRestore();
    clearTimeout.mockRestore();
  });
});
