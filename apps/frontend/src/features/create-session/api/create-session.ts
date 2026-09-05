import { apiClient, requestApi, type components } from "@/shared/api";

export type CreatedSession = components["schemas"]["SessionResponse"];

/** 3분 모드는 계약상 `mode` 문자열이 고정이다. */
export const LIGHT_MODE = "light";

/** 공개 세션 UUID만 담는다. 답변은 절대 넣지 않는다. */
export const ACTIVE_SESSION_STORAGE_KEY = "activeSessionId";

export const activeSessionQueryKey = ["session", "active"] as const;

/**
 * 무기명 진입이다. 계약상 `nickname`이 선택 필드이므로 아예 보내지 않는다.
 * 이름을 받지 않는 것은 설계 스펙 2.3의 요구사항이다.
 */
export const createSession = (idempotencyKey: string): Promise<CreatedSession> =>
  requestApi(
    apiClient.POST("/api/v1/sessions", {
      body: { mode: LIGHT_MODE },
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  );
