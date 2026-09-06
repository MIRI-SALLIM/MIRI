import { apiClient, requestApi, type components } from "@/shared/api";

export type Account = components["schemas"]["AccountResponse"];
export type AuthProviders = components["schemas"]["AuthProvidersResponse"];

export const accountQueryKey = ["account", "me"] as const;
export const authProvidersQueryKey = ["account", "providers"] as const;

export const getAccount = (): Promise<Account> =>
  requestApi(apiClient.GET("/api/v1/auth/me"));

export const fetchAuthProviders = (): Promise<AuthProviders> =>
  requestApi(apiClient.GET("/api/v1/auth/providers"));

export const logout = (): Promise<void> =>
  requestApi(apiClient.POST("/api/v1/auth/logout"));
