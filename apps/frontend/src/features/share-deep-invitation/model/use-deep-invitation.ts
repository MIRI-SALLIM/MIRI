import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  deepSessionInvitationQueryKey,
  fetchDeepInvitation,
  type DeepInvitation,
  type DeepSessionRole,
  type DeepSessionStatus,
} from "@/entities/deep-session";
import { ApiError } from "@/shared/api";

export type DeepInvitationErrorKind = "forbidden" | "hidden" | "rate-limited" | "unavailable" | null;

export interface DeepInvitationStatusGate {
  isReady: boolean;
  status: DeepSessionStatus | null;
}

export interface DeepInvitationResult {
  data: DeepInvitation | undefined;
  error: unknown;
  errorKind: DeepInvitationErrorKind;
  hasRequested: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  request: () => void;
}

export const getDeepInvitationErrorKind = (error: unknown): DeepInvitationErrorKind => {
  if (error === null || error === undefined) {
    return null;
  }

  if (!(error instanceof ApiError)) {
    return "unavailable";
  }

  // The response status is the stable contract. Error codes can describe participant access
  // as "unauthorized" even when the caller is correctly authenticated.
  if (error.status === 403) {
    return "forbidden";
  }

  if (error.status === 401 || error.status === 404 || error.status === 410) {
    return "hidden";
  }

  if (error.status === 429) {
    return "rate-limited";
  }

  return "unavailable";
};

export function useDeepInvitation(
  sessionId: string,
  role: DeepSessionRole | null,
  statusGate: DeepInvitationStatusGate,
): DeepInvitationResult {
  const [manualRequested, setManualRequested] = useState(false);
  const statusAllowsLookup =
    statusGate.status !== null && !statusGate.isReady && !statusGate.status.partnerCompleted;
  const hasRequested = role === "A" || manualRequested;
  const query = useQuery({
    enabled: sessionId !== "" && statusAllowsLookup && (role === "A" || (role === null && manualRequested)),
    queryFn: () => fetchDeepInvitation(sessionId),
    queryKey: deepSessionInvitationQueryKey(sessionId),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  return {
    data: query.data,
    error: query.error,
    errorKind: getDeepInvitationErrorKind(query.error),
    hasRequested,
    isFetching: query.isFetching,
    refetch: async () => query.refetch(),
    request: () => setManualRequested(true),
  };
}
