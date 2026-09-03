import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/shared/api";

import { fetchSessionStatus, sessionStatusQueryKey, type SessionStatus } from "../api/session-status";

// 스펙은 양측 제출 후 3초 이내 공개를 요구한다(vertical-slice-design.md:27).
// 이 화면에서 준비를 알아내는 수단은 폴링뿐이라 주기가 곧 공개 지연의 하한이고,
// 3000ms로는 대기 중인 참가자가 다음 tick을 기다리는 동안 예산을 다 쓸 수 있어 줄였다.
// 대기가 얼마나 길어지는지는 프론트엔드가 통제하지 못하므로 폴링 요청 총량에 상한이 없다.
// 1000ms는 그 비용을 감수하고 고른 값이며, 근거가 되는 요청 예산은 아직 정해지지 않았다.
export const SESSION_STATUS_POLL_INTERVAL_MS = 1_000;

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
