import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { AppRouter } from "@/app/router";

import { AppErrorBoundary } from "./AppErrorBoundary";
import { createAppQueryClient } from "./query-client";

export function AppProviders() {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <AppRouter />
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
