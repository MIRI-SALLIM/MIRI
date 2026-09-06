import { apiClient, requestApi, type components } from "@/shared/api";

import { parseDeepInputV3, type DeepInputV3 } from "../model/schema";

export type DeepInputResponse = Omit<components["schemas"]["OwnInputV3"], "input"> & {
  input: DeepInputV3;
};

export const deepInputQueryKey = (sessionId: string) => ["deep-input", sessionId] as const;

const parseDeepInputResponse = (response: components["schemas"]["OwnInputV3"]): DeepInputResponse => ({
  ...response,
  input: parseDeepInputV3(response.input),
});

export const fetchDeepInput = async (sessionId: string): Promise<DeepInputResponse> =>
  parseDeepInputResponse(
    await requestApi(
      apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/me/input", {
        params: { path: { session_id: sessionId } },
      }),
    ),
  );

export const saveDeepInput = async (
  sessionId: string,
  expectedRevision: number,
  input: DeepInputV3,
): Promise<DeepInputResponse> =>
  parseDeepInputResponse(
    await requestApi(
      apiClient.PATCH("/api/v1/deep/v3/sessions/{session_id}/me/input", {
        body: { expectedRevision, input: parseDeepInputV3(input) },
        params: { path: { session_id: sessionId } },
      }),
    ),
  );
