import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDeepResult } from "./deep-report";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });

beforeEach(() => fetchMock.mockReset());

describe("deep report API", () => {
  it("reads the waiting-or-ready result endpoint", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "waiting", partnerCompleted: false }));

    await expect(fetchDeepResult("deep-session-a")).resolves.toEqual({
      status: "waiting",
      partnerCompleted: false,
    });

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/deep-session-a/result");
  });
});
