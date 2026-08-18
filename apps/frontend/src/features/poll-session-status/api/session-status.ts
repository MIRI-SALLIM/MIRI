import { apiClient, requestApi, type components } from "@/shared/api";

export type SessionStatus = components["schemas"]["SessionStatusResponse"];

export const sessionStatusQueryKey = (sessionId: string) =>
  ["session", sessionId, "status"] as const;

/** 닉네임 없이 boolean 플래그만 돌려주는 계약이라 대기 화면은 이것만으로 충분하다. */
export const fetchSessionStatus = (sessionId: string): Promise<SessionStatus> =>
  requestApi(
    apiClient.GET("/api/v1/sessions/{session_id}/status", {
      params: { path: { session_id: sessionId } },
    }),
  );
