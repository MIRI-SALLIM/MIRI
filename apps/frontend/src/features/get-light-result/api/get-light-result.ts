import { apiClient, requestApi } from "@/shared/api";
import type { LightResultResponse } from "@/entities/light-result";

export const lightResultQueryKey = (sessionId: string) =>
  ["session", sessionId, "result"] as const;

export const fetchLightResult = (sessionId: string): Promise<LightResultResponse> =>
  requestApi(
    apiClient.GET("/api/v1/sessions/{session_id}/result", {
      params: { path: { session_id: sessionId } },
    }),
  );
