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
}

export function useAccount(): AccountStatus {
  const query = useQuery({
    queryKey: accountQueryKey,
    queryFn: getAccount,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (query.isPending) {
    return { state: "loading", userId: null };
  }

  if (query.data !== undefined) {
    return { state: "authenticated", userId: query.data.userId };
  }

  if (query.error instanceof ApiError && query.error.kind === "unauthorized") {
    return { state: "unauthenticated", userId: null };
  }

  if (query.error instanceof ApiError && query.error.kind === "not-found") {
    return { state: "disabled", userId: null };
  }

  return { state: "error", userId: null };
}
