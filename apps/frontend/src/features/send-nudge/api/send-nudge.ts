import { apiClient, createIdempotencyKey, requestApi, type components } from "@/shared/api";

export type NudgeResult = components["schemas"]["NudgeResponse"];

/** 알림은 발신 참여자별 24시간 1회로 서버에서 제한한다(429). */
export const sendNudge = (sessionId: string): Promise<NudgeResult> =>
  requestApi(
    apiClient.POST("/api/v1/sessions/{session_id}/nudge", {
      headers: { "Idempotency-Key": createIdempotencyKey() },
      params: { path: { session_id: sessionId } },
    }),
  );
