import createClient, { type ClientOptions } from "openapi-fetch";

import type { AllowedPaths } from "./allowed-operations";
import { ApiError, createApiError, createNetworkApiError, createTimeoutApiError } from "./errors";

// No request-level SLA or response-time distribution is recorded in this repository.
// Ten seconds is an evidence-limited operational default for releasing no-response waits,
// not a performance guarantee; replace it after measuring a request-level SLA.
export const API_REQUEST_TIMEOUT_MS = 10_000;

class RequestTimeoutError extends Error {}

type ApiFetch = NonNullable<ClientOptions["fetch"]>;

const withRequestTimeout = (fetch: ApiFetch): ApiFetch => async (input) => {
  if (input.signal.aborted) {
    return fetch(input);
  }

  // The cap applies to reads and Light mutations. POST /sessions and POST /invitations/{code}/join
  // replay their Idempotency-Key; PATCH /sessions/{id}/me/input replaces the complete answer and
  // guess arrays; POST /sessions/{id}/me/submit returns the persisted completedAt when already
  // submitted; and POST /sessions/{id}/nudge atomically records at most one nudge per 24 hours
  // on the production Mongo path
  // (a replay may return its documented 429, but cannot apply a duplicate nudge).

  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(input.signal.reason);
  input.signal.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetch(new Request(input, { signal: controller.signal }));
    if (didTimeout) {
      throw new RequestTimeoutError();
    }
    return response;
  } catch (error) {
    if (didTimeout) {
      throw new RequestTimeoutError();
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    input.signal.removeEventListener("abort", abortFromCaller);
  }
};

export const createApiClient = (options: Pick<ClientOptions, "baseUrl" | "fetch"> = {}) => {
  const { fetch: configuredFetch, ...clientOptions } = options;

  return createClient<AllowedPaths>({
    baseUrl: globalThis.location?.origin,
    credentials: "include",
    ...clientOptions,
    fetch: withRequestTimeout(configuredFetch ?? globalThis.fetch),
  });
};

export const apiClient = createApiClient();

type ApiResponse<Data> = {
  data?: Data;
  error?: unknown;
  response: Response;
};

export const requestApi = async <Data>(request: Promise<ApiResponse<Data>>): Promise<Data> => {
  try {
    const result = await request;

    if (result.response.ok) {
      return result.data as Data;
    }

    throw createApiError(result.response, result.error);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof RequestTimeoutError) {
      throw createTimeoutApiError();
    }

    throw createNetworkApiError();
  }
};
