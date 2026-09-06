import { useQuery } from "@tanstack/react-query";

import { authProvidersQueryKey, fetchAuthProviders } from "../api/account";

export interface AuthProvidersStatus {
  kakao: boolean | null;
}

export function useAuthProviders(): AuthProvidersStatus {
  const query = useQuery({
    queryKey: authProvidersQueryKey,
    queryFn: fetchAuthProviders,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  return { kakao: query.data?.kakao ?? null };
}
