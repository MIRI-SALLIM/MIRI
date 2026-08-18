import { apiClient, createIdempotencyKey, requestApi, type components } from "@/shared/api";

export type SubmittedLightForm = components["schemas"]["SubmitResponse"];

export const submitLightForm = (sessionId: string): Promise<SubmittedLightForm> =>
  requestApi(
    apiClient.POST("/api/v1/sessions/{session_id}/me/submit", {
      headers: { "Idempotency-Key": createIdempotencyKey() },
      params: { path: { session_id: sessionId } },
    }),
  );
