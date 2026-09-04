import { apiClient, requestApi, type components } from "@/shared/api";

export type ActiveSession = components["schemas"]["SessionResponse"];

export const activeSessionQueryKey = ["session", "active"] as const;

/**
 * 참여자 쿠키로 현재 활성 세션을 복구한다. 초대 코드는 여기서만 읽고
 * 웹 저장소에 저장하지 않는다.
 */
export const fetchActiveSession = (): Promise<ActiveSession> =>
  requestApi(apiClient.GET("/api/v1/me/session"));
