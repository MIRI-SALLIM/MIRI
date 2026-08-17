import { apiClient, createIdempotencyKey, requestApi, type components } from "@/shared/api";

export type CreatedSession = components["schemas"]["SessionResponse"];

export interface CreateSessionInput {
  nickname: string;
}

/** 3분 모드는 계약상 `mode` 문자열이 고정이다. */
export const LIGHT_MODE = "light";

/** 공개 세션 UUID만 담는다. 닉네임과 답변은 절대 넣지 않는다. */
export const ACTIVE_SESSION_STORAGE_KEY = "activeSessionId";

export const activeSessionQueryKey = ["session", "active"] as const;

export const createSession = ({ nickname }: CreateSessionInput): Promise<CreatedSession> =>
  requestApi(
    apiClient.POST("/api/v1/sessions", {
      body: { mode: LIGHT_MODE, nickname },
      headers: { "Idempotency-Key": createIdempotencyKey() },
    }),
  );
