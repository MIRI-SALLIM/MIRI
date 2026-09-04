import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/shared/api";

import { fetchSessionStatus, sessionStatusQueryKey, type SessionStatus } from "../api/session-status";

// 상대가 참여한 뒤에는 양측 제출과 결과 공개를 빠르게 감지해야 하므로 1000ms를 유지한다.
export const SESSION_STATUS_PARTNER_JOINED_POLL_INTERVAL_MS = 1_000;

// 요청 예산은 아직 정해지지 않았지만, 미참여 화면에서 1초 대비 요청 빈도를 절반으로 줄이면서
// 3초 공개 예산 안에 남도록 2000ms를 사용한다.
export const SESSION_STATUS_PARTNER_NOT_JOINED_POLL_INTERVAL_MS = 2_000;

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
    refetchInterval: ({ state }) => {
      if (isTerminal(state.error) || isResultReady(state.data)) {
        return false;
      }

      return state.data?.partnerJoined
        ? SESSION_STATUS_PARTNER_JOINED_POLL_INTERVAL_MS
        : SESSION_STATUS_PARTNER_NOT_JOINED_POLL_INTERVAL_MS;
    },
  });

  return {
    isExpired: statusQuery.error instanceof ApiError && statusQuery.error.kind === "expired",
    isFailed: statusQuery.isError,
    isPending: statusQuery.isPending,
    isReady: isResultReady(statusQuery.data),
    status: statusQuery.data ?? null,
  };
}
