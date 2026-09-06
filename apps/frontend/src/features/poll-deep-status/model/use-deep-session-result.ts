import { useQuery } from "@tanstack/react-query";

import { deepResultQueryKey, fetchDeepResult, type DeepResult } from "@/entities/deep-report";
import { ApiError, isTerminalApiError } from "@/shared/api";
import { usePollingWindow } from "@/shared/lib";

const isReady = (result: DeepResult | undefined): boolean => result?.status === "ready";
const isWaiting = (result: DeepResult | undefined): boolean => result?.status === "waiting";

export interface DeepSessionResultResult {
  isExpired: boolean;
  isFailed: boolean;
  isPending: boolean;
  isReady: boolean;
  isTimedOut: boolean;
  isWaiting: boolean;
  refetch: () => Promise<unknown>;
  result: DeepResult | null;
  terminalError: "expired" | "not-found" | "unauthorized" | null;
}

export function useDeepSessionResult(sessionId: string): DeepSessionResultResult {
  const polling = usePollingWindow(sessionId !== "");
  const query = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchDeepResult(sessionId),
    queryKey: deepResultQueryKey(sessionId),
    refetchInterval: ({ state }) => polling.getInterval(isTerminalApiError(state.error) || isReady(state.data)),
    refetchIntervalInBackground: false,
    retry: false,
  });
  const refetch = async () => {
    polling.restart();
    return query.refetch();
  };

  const terminalError = query.error instanceof ApiError && isTerminalApiError(query.error) &&
    (query.error.kind === "expired" || query.error.kind === "not-found" || query.error.kind === "unauthorized")
    ? query.error.kind
    : null;

  return {
    isExpired: query.error instanceof ApiError && query.error.kind === "expired",
    isFailed: query.isError,
    isPending: query.isPending,
    isReady: isReady(query.data),
    isTimedOut: polling.isTimedOut && !isReady(query.data),
    isWaiting: isWaiting(query.data),
    refetch,
    result: query.data ?? null,
    terminalError,
  };
}
