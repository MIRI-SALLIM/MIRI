import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/shared/api";

import { fetchSessionStatus, sessionStatusQueryKey, type SessionStatus } from "../api/session-status";

// 상대가 참여한 뒤에는 양측 제출과 결과 공개를 빠르게 감지해야 하므로 1000ms를 유지한다.
export const SESSION_STATUS_PARTNER_JOINED_POLL_INTERVAL_MS = 1_000;

// 이 값이 제한하는 것은 클라이언트 스케줄링 지연뿐이다. 네트워크 왕복·서버 처리·렌더는
// 포함하지 않으며 그 예산은 정해진 바 없으므로, 상수가 3초보다 작다는 사실만으로 스펙의
// 공개 약속이 보장되지는 않는다.
// 이 주기가 공개를 좌우하려면 상대가 한 tick 안에 참여·전 문항 답변·제출을 끝내야 한다.
// 문항마다 저장 왕복이 있어 현실적이지 않고, 그 창을 넘기면 다음 poll이 참여를 감지해
// 1000ms로 전환된다. 따라서 실질 공개 지연은 1000ms 주기가 좌우하며 이는 #28과 같다.
// 다만 이것은 행동적 논거이지 하드 보장이 아니다. 미참여 구간의 요청 빈도를 절반으로
// 줄이는 대가로 그 불확실성을 감수한다.
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
