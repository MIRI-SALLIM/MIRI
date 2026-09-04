import { QueryClient } from "@tanstack/react-query";

import { shouldRetryQuery } from "@/shared/api";

export const createAppQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
      },
      mutations: {
        retry: false,
      },
    },
  });
