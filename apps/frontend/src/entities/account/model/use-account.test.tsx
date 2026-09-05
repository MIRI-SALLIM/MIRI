import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";

const getAccount = vi.hoisted(() => vi.fn());

vi.mock("../api/account", () => ({
  accountQueryKey: ["account", "me"],
  getAccount,
}));

import { useAccount } from "./use-account";

function AccountProbe() {
  const account = useAccount();

  return <output data-testid="account-state">{`${account.state}:${account.userId ?? ""}`}</output>;
}

function renderAccount() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProbe />
    </QueryClientProvider>,
  );
}

describe("useAccount", () => {
  it("reports loading before the account request resolves", () => {
    getAccount.mockReturnValue(new Promise(() => undefined));
    renderAccount();

    expect(screen.getByTestId("account-state")).toHaveTextContent("loading:");
  });

  it("reports an authenticated account after a 200 response", async () => {
    getAccount.mockResolvedValue({ userId: "account-user" });
    renderAccount();

    await waitFor(() => expect(screen.getByTestId("account-state")).toHaveTextContent("authenticated:account-user"));
  });

  it("reports unauthenticated for the existing 401 error kind", async () => {
    getAccount.mockRejectedValue(new ApiError({ status: 401, code: "AUTH_REQUIRED", kind: "unauthorized" }));
    renderAccount();

    await waitFor(() => expect(screen.getByTestId("account-state")).toHaveTextContent("unauthenticated:"));
  });

  it("reports disabled for the existing 404 error kind", async () => {
    getAccount.mockRejectedValue(new ApiError({ status: 404, code: null, kind: "not-found" }));
    renderAccount();

    await waitFor(() => expect(screen.getByTestId("account-state")).toHaveTextContent("disabled:"));
  });

  it("reports other failures as an error", async () => {
    getAccount.mockRejectedValue(new ApiError({ status: 503, code: null, kind: "unavailable" }));
    renderAccount();

    await waitFor(() => expect(screen.getByTestId("account-state")).toHaveTextContent("error:"));
  });
});
