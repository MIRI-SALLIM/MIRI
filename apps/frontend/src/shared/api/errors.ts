export type ApiErrorKind =
  | "unauthorized"
  | "not-found"
  | "conflict"
  | "expired"
  | "validation"
  | "rate-limited"
  | "timeout"
  | "unavailable"
  | "unknown";

export type ApiFieldErrors = Record<string, string[]>;

export const deepApiErrorCodes = [
  "REVISION_CONFLICT",
  "INPUT_LOCKED",
  "PLAN_VERSION_CONFLICT",
  "PLAN_LOCKED",
  "ROUND_VERSION_CONFLICT",
  "AGREEMENT_VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "SELF_INVITATION",
  "SESSION_FULL",
  "UNTRUSTED_ORIGIN",
  "INVALID_DEEP_INPUT",
  "INPUT_INCOMPLETE",
  "DEEP_UNAVAILABLE",
] as const;

export type DeepApiErrorCode = (typeof deepApiErrorCodes)[number];

const terminalKinds: ApiErrorKind[] = ["expired", "not-found", "unauthorized"];

export interface ApiErrorInit {
  status: number | null;
  code: string | null;
  kind: ApiErrorKind;
  fieldErrors?: ApiFieldErrors;
}

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly kind: ApiErrorKind;
  readonly fieldErrors?: ApiFieldErrors;

  constructor({ status, code, kind, fieldErrors }: ApiErrorInit) {
    super("API request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.kind = kind;
    this.fieldErrors = fieldErrors;
  }
}

type ErrorEnvelope = {
  error?: {
    code?: unknown;
    fieldErrors?: unknown;
  };
};

const codeKinds: Record<string, ApiErrorKind> = {
  PARTICIPANT_UNAUTHORIZED: "unauthorized",
  INVITATION_NOT_FOUND: "not-found",
  QUESTION_SET_NOT_FOUND: "not-found",
  SESSION_EXPIRED: "expired",
  GONE: "expired",
  VALIDATION_ERROR: "validation",
  TOO_MANY_REQUESTS: "rate-limited",
  INTERNAL_SERVER_ERROR: "unavailable",
  REVISION_CONFLICT: "conflict",
  INPUT_LOCKED: "conflict",
  PLAN_VERSION_CONFLICT: "conflict",
  PLAN_LOCKED: "conflict",
  ROUND_VERSION_CONFLICT: "conflict",
  AGREEMENT_VERSION_CONFLICT: "conflict",
  IDEMPOTENCY_CONFLICT: "conflict",
  SELF_INVITATION: "conflict",
  SESSION_FULL: "conflict",
  UNTRUSTED_ORIGIN: "unknown",
  INVALID_DEEP_INPUT: "validation",
  INPUT_INCOMPLETE: "validation",
  DEEP_UNAVAILABLE: "unavailable",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readFieldErrors = (value: unknown): ApiFieldErrors | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value);
  if (!entries.every(([, messages]) => Array.isArray(messages) && messages.every((message) => typeof message === "string"))) {
    return undefined;
  }

  return Object.fromEntries(entries) as ApiFieldErrors;
};

const kindFromStatus = (status: number | null): ApiErrorKind => {
  if (status === null) {
    return "unavailable";
  }

  if (status === 401) {
    return "unauthorized";
  }

  if (status === 404) {
    return "not-found";
  }

  if (status === 409) {
    return "conflict";
  }

  if (status === 410) {
    return "expired";
  }

  if (status === 422) {
    return "validation";
  }

  if (status === 429) {
    return "rate-limited";
  }

  if (status >= 500) {
    return "unavailable";
  }

  return "unknown";
};

export const createApiError = (response: Response, payload: unknown): ApiError => {
  const detail = isRecord(payload) && isRecord((payload as ErrorEnvelope).error)
    ? (payload as ErrorEnvelope).error
    : undefined;
  const code = typeof detail?.code === "string" ? detail.code : null;

  return new ApiError({
    status: response.status,
    code,
    kind: code === null ? kindFromStatus(response.status) : (codeKinds[code] ?? kindFromStatus(response.status)),
    fieldErrors: readFieldErrors(detail?.fieldErrors),
  });
};

export const createNetworkApiError = (): ApiError =>
  new ApiError({ status: null, code: null, kind: "unavailable" });

export const createTimeoutApiError = (): ApiError =>
  new ApiError({ status: null, code: null, kind: "timeout" });

export const isApiErrorCode = <Code extends string>(
  error: unknown,
  code: Code,
): error is ApiError & { readonly code: Code } => error instanceof ApiError && error.code === code;

export const isDeepApiErrorCode = (
  error: unknown,
  code: DeepApiErrorCode,
): error is ApiError & { readonly code: DeepApiErrorCode } => isApiErrorCode(error, code);

export const isTerminalApiError = (error: unknown): boolean =>
  error instanceof ApiError && terminalKinds.includes(error.kind);

export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  if (!(error instanceof ApiError)) {
    return false;
  }

  // A timeout already consumed the request's full wait budget. Retrying it here would
  // allow one unresponsive operation to block for up to three timeout windows.
  return failureCount < 2 && error.kind !== "timeout" && (error.status === null || error.status >= 500);
};
