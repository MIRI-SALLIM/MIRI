import {
  apiClient,
  createIdempotencyKey,
  requestApi,
  type components,
} from "@/shared/api";

import { LIGHT_QUESTION_VERSION } from "@/entities/light-question";

export type ActiveSession = components["schemas"]["SessionResponse"];
export type LightInput = components["schemas"]["SaveInputRequest"];
export type LightInputResponse = components["schemas"]["UserInputData"];
export type LightQuestions = components["schemas"]["QuestionSet"];

export const getActiveSession = (): Promise<ActiveSession> =>
  requestApi(apiClient.GET("/api/v1/me/session"));

export const getLightQuestions = (): Promise<LightQuestions> =>
  requestApi(
    apiClient.GET("/api/v1/light/questions", {
      params: { query: { version: LIGHT_QUESTION_VERSION } },
    }),
  );

export const getLightInput = (sessionId: string): Promise<LightInputResponse> =>
  requestApi(
    apiClient.GET("/api/v1/sessions/{session_id}/me/input", {
      params: { path: { session_id: sessionId } },
    }),
  );

export const saveLightInput = (sessionId: string, input: LightInput): Promise<LightInputResponse> =>
  requestApi(
    apiClient.PATCH("/api/v1/sessions/{session_id}/me/input", {
      body: input,
      headers: { "Idempotency-Key": createIdempotencyKey() },
      params: { path: { session_id: sessionId } },
    }),
  );
