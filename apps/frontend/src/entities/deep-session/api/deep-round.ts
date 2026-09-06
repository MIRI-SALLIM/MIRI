import { apiClient, requestApi, type components } from "@/shared/api";

export type DeepRoundState = components["schemas"]["RoundStateResponse"];

export const deepRoundStateQueryKey = (sessionId: string) => ["deep-round-state", sessionId] as const;

export const fetchDeepRoundState = async (sessionId: string): Promise<DeepRoundState> =>
  requestApi(
    apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/rounds", {
      params: { path: { session_id: sessionId } },
    }),
  );
