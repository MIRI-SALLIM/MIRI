import { useQuery } from "@tanstack/react-query";

import {
  fetchMeetingContext,
  fetchMeetingExplanation,
  meetingContextQueryKey,
  meetingExplanationQueryKey,
  type MeetingContext,
  type MeetingExplanation,
} from "@/entities/deep-meeting";
import { ApiError, isTerminalApiError } from "@/shared/api";
import { usePollingWindow } from "@/shared/lib";

type MeetingPollingValue = { status: "waiting" | "ready" };

export interface MeetingPollingResult<T extends MeetingPollingValue> {
  data: T | null;
  isFailed: boolean;
  isPending: boolean;
  isReady: boolean;
  isTimedOut: boolean;
  isWaiting: boolean;
  refetch: () => Promise<unknown>;
  terminalError: "expired" | "not-found" | "unauthorized" | null;
}

const terminalErrorFor = (error: unknown): MeetingPollingResult<MeetingPollingValue>["terminalError"] => {
  if (!(error instanceof ApiError)) return null;
  return error.kind === "expired" || error.kind === "not-found" || error.kind === "unauthorized"
    ? error.kind
    : null;
};

function useMeetingPolling<T extends MeetingPollingValue>(
  sessionId: string,
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  shouldPoll = true,
): MeetingPollingResult<T> {
  const enabled = sessionId !== "" && shouldPoll;
  const polling = usePollingWindow(enabled);
  const query = useQuery({
    enabled,
    queryFn,
    queryKey,
    refetchInterval: ({ state }) => {
      if (state.data?.status === "ready" || isTerminalApiError(state.error)) return false;
      return polling.getInterval();
    },
    refetchIntervalInBackground: false,
    retry: false,
  });
  const refetch = async () => {
    polling.restart();
    return query.refetch();
  };
  const data = query.data ?? null;
  const isReady = data?.status === "ready";

  return {
    data,
    isFailed: query.isError,
    isPending: query.isPending,
    isReady,
    isTimedOut: polling.isTimedOut && !isReady,
    isWaiting: data?.status === "waiting",
    refetch,
    terminalError: terminalErrorFor(query.error),
  };
}

export function useMeetingContext(sessionId: string, shouldPoll = true): MeetingPollingResult<MeetingContext> {
  return useMeetingPolling(
    sessionId,
    meetingContextQueryKey(sessionId),
    () => fetchMeetingContext(sessionId),
    shouldPoll,
  );
}

export function useMeetingExplanation(sessionId: string, shouldPoll = true): MeetingPollingResult<MeetingExplanation> {
  return useMeetingPolling(
    sessionId,
    meetingExplanationQueryKey(sessionId),
    () => fetchMeetingExplanation(sessionId),
    shouldPoll,
  );
}
