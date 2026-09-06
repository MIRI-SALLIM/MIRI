import { apiClient, requestApi, type components } from "@/shared/api";

export type SessionV3 = components["schemas"]["SessionV3"];
export type DeepSessionStatus = components["schemas"]["DeepStatusResponse"];
export type ClosedDeepSession = components["schemas"]["ClosedDeepResponse"];
export type DeepSubmitRequest = components["schemas"]["SubmitV3"];
export type DeepInvitation = components["schemas"]["InvitationV3"];
export type DeepSessionRole = "A" | "B";

export const DEEP_ACTIVE_SESSION_STORAGE_KEY = "deepActiveSessionId";
export const DEEP_ACTIVE_SESSION_ROLE_STORAGE_KEY = "deepActiveSessionRole";

export const deepSessionStatusQueryKey = (sessionId: string) =>
  ["deep-session", sessionId, "status"] as const;

export const deepSessionInvitationQueryKey = (sessionId: string) =>
  ["deep-session", sessionId, "invitation"] as const;

/** 딥 세션 생성은 빈 객체와 시도 단위 멱등 키만 보낸다. */
export const createDeepSession = (idempotencyKey: string): Promise<SessionV3> =>
  requestApi(
    apiClient.POST("/api/v1/deep/v3/sessions", {
      body: {},
      params: { header: { "Idempotency-Key": idempotencyKey } },
    }),
  );

/** 이미 참여한 본인의 재요청도 200으로 같은 SessionV3를 돌려준다. */
export const joinDeepSession = (code: string, idempotencyKey: string): Promise<SessionV3> =>
  requestApi(
    apiClient.POST("/api/v1/deep/v3/invitations/{code}/join", {
      body: {},
      params: { header: { "Idempotency-Key": idempotencyKey }, path: { code } },
    }),
  );

export const fetchDeepSessionStatus = (sessionId: string): Promise<DeepSessionStatus> =>
  requestApi(
    apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/status", {
      params: { path: { session_id: sessionId } },
    }),
  );

export const fetchDeepInvitation = (sessionId: string): Promise<DeepInvitation> =>
  requestApi(
    apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/invitation", {
      params: { path: { session_id: sessionId } },
    }),
  );

export const submitDeepSession = (
  sessionId: string,
  body: DeepSubmitRequest,
): Promise<DeepSessionStatus> =>
  requestApi(
    apiClient.POST("/api/v1/deep/v3/sessions/{session_id}/me/submit", {
      body,
      params: { path: { session_id: sessionId } },
    }),
  );

export const withdrawDeepSession = (sessionId: string): Promise<ClosedDeepSession> =>
  requestApi(
    apiClient.POST("/api/v1/deep/v3/sessions/{session_id}/withdraw", {
      body: {},
      params: { path: { session_id: sessionId } },
    }),
  );

export const readActiveDeepSessionId = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage.getItem(DEEP_ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const readActiveDeepSessionRole = (): DeepSessionRole | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const role = window.sessionStorage.getItem(DEEP_ACTIVE_SESSION_ROLE_STORAGE_KEY);
    return role === "A" || role === "B" ? role : null;
  } catch {
    return null;
  }
};

export const saveActiveDeepSessionId = (sessionId: string, role: DeepSessionRole): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(DEEP_ACTIVE_SESSION_STORAGE_KEY, sessionId);
    window.sessionStorage.setItem(DEEP_ACTIVE_SESSION_ROLE_STORAGE_KEY, role);
  } catch {
    // A blocked sessionStorage should not turn a successful session into a failed mutation.
  }
};

export const clearActiveDeepSessionId = (sessionId?: string): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (sessionId === undefined || readActiveDeepSessionId() === sessionId) {
      window.sessionStorage.removeItem(DEEP_ACTIVE_SESSION_STORAGE_KEY);
      window.sessionStorage.removeItem(DEEP_ACTIVE_SESSION_ROLE_STORAGE_KEY);
    }
  } catch {
    // A blocked sessionStorage should not make a closed session unusable.
  }
};
