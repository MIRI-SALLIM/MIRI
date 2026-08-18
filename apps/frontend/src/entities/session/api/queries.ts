import { useQuery } from "@tanstack/react-query";
import { apiClient, parseApiError } from "@/shared/api";
import type {
  InvitationResponse,
  QuestionSet,
  SessionResponse,
  SessionResultResponse,
  SessionStatusResponse,
  UserInputData,
} from "../model/types";

export const sessionKeys = {
  all: ["session"] as const,
  mySession: () => [...sessionKeys.all, "me"] as const,
  questions: (version: string = "light-v1") => ["questions", version] as const,
  invitation: (code: string) => ["invitation", code] as const,
  status: (sessionId: string) => [...sessionKeys.all, sessionId, "status"] as const,
  input: (sessionId: string) => [...sessionKeys.all, sessionId, "input"] as const,
  result: (sessionId: string) => [...sessionKeys.all, sessionId, "result"] as const,
};

export function useMySessionQuery() {
  return useQuery<SessionResponse, Error>({
    queryKey: sessionKeys.mySession(),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET("/api/v1/me/session");
      if (error || !data) {
        throw parseApiError(error, response.status);
      }
      return data;
    },
    retry: false,
  });
}

export function useLightQuestionsQuery(version: string = "light-v1") {
  return useQuery<QuestionSet, Error>({
    queryKey: sessionKeys.questions(version),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET("/api/v1/light/questions", {
        params: { query: { version } },
      });
      if (error || !data) {
        throw parseApiError(error, response.status);
      }
      return data;
    },
    staleTime: 1000 * 60 * 10, // 질문은 10분간 캐시
  });
}

export function useInvitationQuery(code: string) {
  return useQuery<InvitationResponse, Error>({
    queryKey: sessionKeys.invitation(code),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET("/api/v1/invitations/{code}", {
        params: { path: { code } },
      });
      if (error || !data) {
        throw parseApiError(error, response.status);
      }
      return data;
    },
    enabled: Boolean(code && code.startsWith("INV-")),
    retry: false,
  });
}

export function useSessionStatusQuery(sessionId: string, enabled: boolean = true) {
  return useQuery<SessionStatusResponse, Error>({
    queryKey: sessionKeys.status(sessionId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        "/api/v1/sessions/{session_id}/status",
        {
          params: { path: { session_id: sessionId } },
        }
      );
      if (error || !data) {
        throw parseApiError(error, response.status);
      }
      return data;
    },
    enabled: Boolean(sessionId) && enabled,
    refetchInterval: enabled ? 3000 : false, // 대기 중 3초 주기 폴링
  });
}

export function useMyInputQuery(sessionId: string) {
  return useQuery<UserInputData, Error>({
    queryKey: sessionKeys.input(sessionId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        "/api/v1/sessions/{session_id}/me/input",
        {
          params: { path: { session_id: sessionId } },
        }
      );
      if (error || !data) {
        throw parseApiError(error, response.status);
      }
      return data;
    },
    enabled: Boolean(sessionId),
  });
}

export function useSessionResultQuery(sessionId: string, enabled: boolean = true) {
  return useQuery<SessionResultResponse, Error>({
    queryKey: sessionKeys.result(sessionId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        "/api/v1/sessions/{session_id}/result",
        {
          params: { path: { session_id: sessionId } },
        }
      );
      if (error || !data) {
        throw parseApiError(error, response.status);
      }
      return data;
    },
    enabled: Boolean(sessionId) && enabled,
  });
}
