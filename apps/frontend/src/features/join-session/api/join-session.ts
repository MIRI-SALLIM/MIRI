import { apiClient, createIdempotencyKey, requestApi, type components } from "@/shared/api";

export type Invitation = components["schemas"]["InvitationResponse"];
export type JoinedSession = components["schemas"]["SessionResponse"];

export const invitationQueryKey = (code: string) => ["invitation", code] as const;

export const fetchInvitation = (code: string): Promise<Invitation> =>
  requestApi(
    apiClient.GET("/api/v1/invitations/{code}", {
      params: { path: { code } },
    }),
  );

/** 참가자 인증은 서버 쿠키가 맡고, 클라이언트는 멱등성 키만 전송한다. */
export const joinSession = (code: string): Promise<JoinedSession> =>
  requestApi(
    apiClient.POST("/api/v1/invitations/{code}/join", {
      headers: { "Idempotency-Key": createIdempotencyKey() },
      params: { path: { code } },
    }),
  );
