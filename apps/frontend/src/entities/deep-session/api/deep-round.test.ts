import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDeepRoundState } from "./deep-round";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 });

beforeEach(() => fetchMock.mockReset());

describe("deep round API", () => {
  it("reads the current round before a new agreement proposal", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ round: 3, myRequested: false, partnerRequested: false }));

    await expect(fetchDeepRoundState("session-a")).resolves.toEqual({
      round: 3,
      myRequested: false,
      partnerRequested: false,
    });

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/session-a/rounds");
  });
});
