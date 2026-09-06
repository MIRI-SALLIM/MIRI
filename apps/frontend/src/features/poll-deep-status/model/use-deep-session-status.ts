import { useQuery } from "@tanstack/react-query";

import {
  deepSessionStatusQueryKey,
  fetchDeepSessionStatus,
  type DeepSessionStatus,
} from "@/entities/deep-session";
import { ApiError, isTerminalApiError } from "@/shared/api";

export const DEEP_STATUS_WAITING_POLL_INTERVAL_MS = 2_000;
export const DEEP_STATUS_SUBMITTED_POLL_INTERVAL_MS = 1_000;

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
  refetch: () => Promise<unknown>;
  status: DeepSessionStatus | null;
}

/** 파트너 완료를 감지할 때까지 적응형으로 확인하고, ready·만료·인증 오류에서 멈춘다. */
export function useDeepSessionStatus(sessionId: string): DeepSessionStatusResult {
  const query = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchDeepSessionStatus(sessionId),
    queryKey: deepSessionStatusQueryKey(sessionId),
    refetchInterval: ({ state }) => {
      if (isTerminalApiError(state.error) || isReady(state.data)) {
        return false;
      }

      return state.data?.mySubmitted
        ? DEEP_STATUS_SUBMITTED_POLL_INTERVAL_MS
        : DEEP_STATUS_WAITING_POLL_INTERVAL_MS;
    },
  });

  return {
    terminalError: getTerminalError(query.error),
    isExpired: query.error instanceof ApiError && query.error.kind === "expired",
    isFailed: query.isError,
    isPending: query.isPending,
    isReady: isReady(query.data),
    refetch: query.refetch,
    status: query.data ?? null,
  };
}
