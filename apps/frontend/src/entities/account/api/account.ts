import { apiClient, requestApi, type components } from "@/shared/api";

export type Account = components["schemas"]["AccountResponse"];

export const accountQueryKey = ["account", "me"] as const;

export const getAccount = (): Promise<Account> =>
  requestApi(apiClient.GET("/api/v1/auth/me"));
