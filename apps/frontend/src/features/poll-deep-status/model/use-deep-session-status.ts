import { useQuery } from "@tanstack/react-query";

import {
  deepSessionStatusQueryKey,
  fetchDeepSessionStatus,
  type DeepSessionStatus,
} from "@/entities/deep-session";
import { ApiError, isTerminalApiError } from "@/shared/api";
import { POLLING_INTERVAL_MS, usePollingWindow } from "@/shared/lib";

export const DEEP_STATUS_POLL_INTERVAL_MS = POLLING_INTERVAL_MS;

const isReady = (status: DeepSessionStatus | undefined): boolean =>
  status?.status === "ready";

export type DeepStatusTerminalError = "expired" | "unauthorized" | "not-found" | null;

const getTerminalError = (error: unknown): DeepStatusTerminalError => {
  if (!(error instanceof ApiError)) {
    return null;
  }

  if (error.kind === "expired" || error.kind === "unauthorized" || error.kind === "not-found") {
    return error.kind;
  }

  return null;
};

export interface DeepSessionStatusResult {
  terminalError: DeepStatusTerminalError;
  isExpired: boolean;
  isFailed: boolean;
  isPending: boolean;
  isReady: boolean;
  isTimedOut: boolean;
  refetch: () => Promise<unknown>;
  restartPolling: () => void;
  status: DeepSessionStatus | null;
}

/** 파트너 완료를 감지할 때까지 확인하고, ready·만료·인증 오류에서 멈춘다. */
export function useDeepSessionStatus(sessionId: string): DeepSessionStatusResult {
  const polling = usePollingWindow(sessionId !== "");
  const query = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchDeepSessionStatus(sessionId),
    queryKey: deepSessionStatusQueryKey(sessionId),
    refetchInterval: ({ state }) => {
      if (isTerminalApiError(state.error) || isReady(state.data)) {
        return false;
      }

      return polling.getInterval();
    },
    refetchIntervalInBackground: false,
  });

  const refetch = async () => {
    polling.restart();
    return query.refetch();
  };

  return {
    terminalError: getTerminalError(query.error),
    isExpired: query.error instanceof ApiError && query.error.kind === "expired",
    isFailed: query.isError,
    isPending: query.isPending,
    isReady: isReady(query.data),
    isTimedOut: polling.isTimedOut && !isReady(query.data),
    refetch,
    restartPolling: polling.restart,
    status: query.data ?? null,
  };
}
