import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/shared/api";

import { fetchSessionStatus, sessionStatusQueryKey, type SessionStatus } from "../api/session-status";

export const SESSION_STATUS_POLL_INTERVAL_MS = 3_000;

const terminalKinds = ["expired", "not-found", "unauthorized"];

const isTerminal = (error: unknown): boolean =>
  error instanceof ApiError && terminalKinds.includes(error.kind);

const isResultReady = (status: SessionStatus | undefined): boolean =>
  status !== undefined && status.meCompleted && status.partnerCompleted;

export interface SessionStatusResult {
  isExpired: boolean;
  isFailed: boolean;
  isPending: boolean;
  isReady: boolean;
  status: SessionStatus | null;
}

/** 결과가 열리기 전까지만 폴링한다. 준비 완료·만료·언마운트에서 멈춘다. */
export function useSessionStatus(sessionId: string): SessionStatusResult {
  const statusQuery = useQuery({
    queryFn: () => fetchSessionStatus(sessionId),
    queryKey: sessionStatusQueryKey(sessionId),
    refetchInterval: ({ state }) =>
      isTerminal(state.error) || isResultReady(state.data) ? false : SESSION_STATUS_POLL_INTERVAL_MS,
  });

  return {
    isExpired: statusQuery.error instanceof ApiError && statusQuery.error.kind === "expired",
    isFailed: statusQuery.isError,
    isPending: statusQuery.isPending,
    isReady: isResultReady(statusQuery.data),
    status: statusQuery.data ?? null,
  };
}
