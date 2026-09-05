import { describe, expect, it } from "vitest";

import {
  ApiError,
  isApiErrorCode,
  isDeepApiErrorCode,
  isTerminalApiError,
  shouldRetryQuery,
} from "./errors";

const apiError = (status: number | null) => new ApiError({ status, code: null, kind: "unknown" });

describe("API retry policy", () => {
  it.each([401, 404, 409, 410, 422, 429])("does not retry a %i response", (status) => {
    expect(shouldRetryQuery(0, apiError(status))).toBe(false);
  });

  it("retries network and 5xx failures at most twice", () => {
    expect(shouldRetryQuery(0, apiError(null))).toBe(true);
    expect(shouldRetryQuery(1, apiError(500))).toBe(true);
    expect(shouldRetryQuery(2, apiError(503))).toBe(false);
  });

  it("does not retry a request timeout", () => {
    expect(shouldRetryQuery(0, new ApiError({ status: null, code: null, kind: "timeout" }))).toBe(false);
  });
});

describe("deep API error codes", () => {
  it("keeps distinct deep conflict codes available to callers", () => {
    const error = new ApiError({ status: 409, code: "PLAN_LOCKED", kind: "conflict" });

    expect(isApiErrorCode(error, "PLAN_LOCKED")).toBe(true);
    expect(isDeepApiErrorCode(error, "PLAN_LOCKED")).toBe(true);
    expect(isDeepApiErrorCode(error, "INPUT_LOCKED")).toBe(false);
  });

  it("does not treat an ordinary error as a matching API code", () => {
    expect(isApiErrorCode(new Error("no"), "PLAN_LOCKED")).toBe(false);
  });
});

describe("terminal API errors", () => {
  it.each(["expired", "not-found", "unauthorized"] as const)("treats %s as terminal", (kind) => {
    expect(isTerminalApiError(new ApiError({ status: null, code: null, kind }))).toBe(true);
  });

  it.each(["unavailable", "rate-limited", "unknown", "conflict", "validation"] as const)("does not treat %s as terminal", (kind) => {
    expect(isTerminalApiError(new ApiError({ status: null, code: null, kind }))).toBe(false);
  });

  it.each([new Error("ordinary error"), undefined, null, "error"])("rejects non-ApiError values: %s", (error) => {
    expect(isTerminalApiError(error)).toBe(false);
  });
});
