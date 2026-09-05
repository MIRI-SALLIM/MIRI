import { describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
const requestApi = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api", () => ({
  apiClient: { GET: get },
  requestApi,
}));

import { accountQueryKey, getAccount } from "./account";

describe("account API", () => {
  it("uses the account me operation and returns its response", async () => {
    const account = { userId: "account-user" };
    const request = Promise.resolve({ response: new Response(null, { status: 200 }) });
    get.mockReturnValue(request);
    requestApi.mockResolvedValue(account);

    await expect(getAccount()).resolves.toEqual(account);
    expect(get).toHaveBeenCalledWith("/api/v1/auth/me");
    expect(requestApi).toHaveBeenCalledWith(request);
  });

  it("shares a stable query key for the current account", () => {
    expect(accountQueryKey).toEqual(["account", "me"]);
  });
});
