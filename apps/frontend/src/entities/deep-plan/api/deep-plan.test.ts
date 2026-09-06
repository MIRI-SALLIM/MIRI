import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmDeepPlan, fetchDeepPlan, updateDeepPlan } from "./deep-plan";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const plan = {
  planSchemaVersion: "deep-plan-v3" as const,
  fundingAsOf: "2026-09-01",
  startMonth: "2026-10",
  housingType: "rent" as const,
  commonExpensesStatus: "unknown" as const,
  newLoanCertainty: "unknown" as const,
};

const response = {
  version: 2,
  plan,
  myConfirmed: false,
  partnerConfirmed: true,
  locked: false,
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 });

beforeEach(() => {
  fetchMock.mockReset();
});

describe("deep plan API", () => {
  it("reads the current plan from the server", async () => {
    fetchMock.mockResolvedValue(jsonResponse(response));

    await expect(fetchDeepPlan("session-a")).resolves.toEqual(response);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/session-a/plan");
  });

  it("updates with the expected version and the complete plan", async () => {
    fetchMock.mockResolvedValue(jsonResponse(response));

    await expect(updateDeepPlan("session-a", 2, plan)).resolves.toEqual(response);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("PATCH");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/session-a/plan");
    expect(await request.json()).toEqual({ expectedVersion: 2, plan });
  });

  it("confirms the exact plan version", async () => {
    fetchMock.mockResolvedValue(jsonResponse(response));

    await expect(confirmDeepPlan("session-a", 2)).resolves.toEqual(response);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/session-a/plan/confirm");
    expect(await request.json()).toEqual({ planVersion: 2 });
  });
});
