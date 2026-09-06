import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/shared/api";

import { accountQueryKey, getAccount } from "../api/account";

export type AccountState =
  | "authenticated"
  | "unauthenticated"
  | "disabled"
  | "loading"
  | "error";

export interface AccountStatus {
  state: AccountState;
  userId: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
}

export function useAccount(): AccountStatus {
  const query = useQuery({
    queryKey: accountQueryKey,
    queryFn: getAccount,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (query.isPending) {
    return { state: "loading", userId: null, displayName: null, profileImageUrl: null };
  }

  if (query.data !== undefined) {
    return {
      state: "authenticated",
      userId: query.data.userId,
      displayName: query.data.displayName ?? null,
      profileImageUrl: query.data.profileImageUrl ?? null,
    };
  }

  if (query.error instanceof ApiError && query.error.kind === "unauthorized") {
    return { state: "unauthenticated", userId: null, displayName: null, profileImageUrl: null };
  }

  if (query.error instanceof ApiError && query.error.kind === "not-found") {
    return { state: "disabled", userId: null, displayName: null, profileImageUrl: null };
  }

  return { state: "error", userId: null, displayName: null, profileImageUrl: null };
}
