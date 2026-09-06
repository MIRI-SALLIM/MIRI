import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDeepInput, saveDeepInput } from "./deep-input";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const input = {
  inputVersion: "deep-input-v3" as const,
  assetsStatus: "known" as const,
  debtsStatus: "known" as const,
  livingTogether: null,
};

const response = { input, revision: 4 };

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 });

beforeEach(() => {
  fetchMock.mockReset();
});

describe("deep input API", () => {
  it("reads the current input and revision", async () => {
    fetchMock.mockResolvedValue(jsonResponse(response));

    await expect(fetchDeepInput("session-a")).resolves.toEqual(response);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/session-a/me/input");
  });

  it("updates with the expected revision and complete input document", async () => {
    fetchMock.mockResolvedValue(jsonResponse(response));

    await expect(saveDeepInput("session-a", 4, input)).resolves.toEqual(response);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("PATCH");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/session-a/me/input");
    expect(await request.json()).toEqual({ expectedRevision: 4, input });
  });
});
