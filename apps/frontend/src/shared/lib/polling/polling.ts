import { useCallback, useEffect, useRef, useState } from "react";

export const POLLING_INTERVAL_MS = 5_000;
export const POLLING_TIMEOUT_MS = 60_000;

export interface PollingIntervalOptions {
  startedAt: number;
  now?: number;
  stopped?: boolean;
  visible?: boolean;
}

export type PollingInterval = false | typeof POLLING_INTERVAL_MS;

/**
 * Return the one polling cadence used by long-running deep flows.
 * The caller owns the terminal condition; this utility owns the cap and pause rules.
 */
export const getPollingInterval = ({
  now = Date.now(),
  startedAt,
  stopped = false,
  visible = true,
}: PollingIntervalOptions): PollingInterval => {
  if (stopped || !visible || now - startedAt >= POLLING_TIMEOUT_MS) {
    return false;
  }

  return POLLING_INTERVAL_MS;
};

const isDocumentVisible = (): boolean =>
  typeof document === "undefined" || document.visibilityState !== "hidden";

export interface PollingWindow {
  getInterval: (stopped?: boolean) => PollingInterval;
  isPolling: boolean;
  isTimedOut: boolean;
  restart: () => void;
}

/**
 * Keeps a query's polling window bounded and pauses it while the tab is hidden.
 * TanStack Query also avoids background refetches, but the visibility state is kept
 * here so consumers can share the same stop/restart behavior and tests can verify it.
 */
export function usePollingWindow(enabled: boolean): PollingWindow {
  const startedAt = useRef<number | null>(null);
  const [isVisible, setIsVisible] = useState(isDocumentVisible);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const onVisibilityChange = () => setIsVisible(isDocumentVisible());
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!enabled) {
      startedAt.current = null;
      return;
    }

    startedAt.current ??= Date.now();
    const remaining = Math.max(0, POLLING_TIMEOUT_MS - (Date.now() - startedAt.current));
    const timeoutId = globalThis.setTimeout(() => setIsTimedOut(true), remaining);

    return () => globalThis.clearTimeout(timeoutId);
  }, [enabled, generation]);

  const restart = useCallback(() => {
    startedAt.current = Date.now();
    setIsTimedOut(false);
    setGeneration((current) => current + 1);
  }, []);

  const getInterval = useCallback(
    (stopped = false): PollingInterval =>
      getPollingInterval({
        startedAt: startedAt.current ?? Date.now(),
        stopped: !enabled || stopped || isTimedOut,
        visible: isVisible,
      }),
    [enabled, isTimedOut, isVisible],
  );

  return {
    getInterval,
    isPolling: enabled && isVisible && !isTimedOut,
    isTimedOut,
    restart,
  };
}
