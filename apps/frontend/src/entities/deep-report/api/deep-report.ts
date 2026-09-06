import { apiClient, requestApi } from "@/shared/api";

import { parseDeepResult, type DeepResult } from "../model/result";

export const deepResultQueryKey = (sessionId: string) => ["deep-result", sessionId] as const;

export const fetchDeepResult = async (sessionId: string): Promise<DeepResult> =>
  parseDeepResult(
    await requestApi(
      apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/result", {
        params: { path: { session_id: sessionId } },
      }),
    ),
  );
