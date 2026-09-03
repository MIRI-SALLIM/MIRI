import createClient, { type ClientOptions } from "openapi-fetch";

import type { AllowedPaths } from "./allowed-operations";
import { ApiError, createApiError, createNetworkApiError } from "./errors";

export const createApiClient = (options: Pick<ClientOptions, "baseUrl" | "fetch"> = {}) =>
  createClient<AllowedPaths>({
    baseUrl: globalThis.location?.origin,
    credentials: "include",
    ...options,
  });

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

    throw createNetworkApiError();
  }
};
