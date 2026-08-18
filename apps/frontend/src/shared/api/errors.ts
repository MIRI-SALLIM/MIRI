import type { components } from "./schema";

export type ApiErrorResponse = components["schemas"]["ErrorResponse"];
export type ApiErrorDetail = components["schemas"]["ErrorDetail"];

export const ERROR_MESSAGES: Record<string, string> = {
  QUESTION_SET_NOT_FOUND: "질문 세트를 찾을 수 없습니다.",
  PARTICIPANT_UNAUTHORIZED: "참여자 인증 정보가 유효하지 않거나 만료되었습니다.",
  SESSION_EXPIRED: "진단 세션이 만료되었습니다. 새로운 진단을 시작해 주세요.",
  INVITATION_NOT_FOUND: "유효하지 않거나 만료된 초대 링크입니다.",
  SESSION_ALREADY_JOINED: "이미 상대방이 참여한 세션입니다.",
  SESSION_ALREADY_SUBMITTED: "이미 최종 제출이 완료되어 수정할 수 없습니다.",
  INPUT_INCOMPLETE: "모든 문항에 대한 본인 답변과 상대방 예측을 완료해야 제출할 수 있습니다.",
  NUDGE_RATE_LIMITED: "넛지(알림)는 24시간에 한 번만 보낼 수 있습니다.",
  NUDGE_TARGET_UNAVAILABLE: "상대방이 이미 제출했거나 아직 참여하지 않아 넛지를 보낼 수 없습니다.",
  DATABASE_UNAVAILABLE: "일시적인 서버 데이터베이스 점검 중입니다.",
  VALIDATION_ERROR: "입력값이 올바르지 않습니다.",
  NETWORK_ERROR: "네트워크 연결 상태를 확인해 주세요.",
  UNKNOWN_ERROR: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

export class AppApiError extends Error {
  readonly code: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly status?: number;

  constructor(detail: Partial<ApiErrorDetail> & { status?: number }) {
    const code = detail.code || "UNKNOWN_ERROR";
    const message = ERROR_MESSAGES[code] || detail.message || ERROR_MESSAGES.UNKNOWN_ERROR;
    super(message);
    this.name = "AppApiError";
    this.code = code;
    this.fieldErrors = detail.fieldErrors;
    this.status = detail.status;
  }
}

export function parseApiError(error: unknown, status?: number): AppApiError {
  if (error instanceof AppApiError) {
    return error;
  }

  if (typeof error === "object" && error !== null && "error" in error) {
    const apiError = (error as { error?: Partial<ApiErrorDetail> }).error;
    if (apiError && typeof apiError === "object") {
      return new AppApiError({ ...apiError, status });
    }
  }

  return new AppApiError({
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : undefined,
    status,
  });
}
