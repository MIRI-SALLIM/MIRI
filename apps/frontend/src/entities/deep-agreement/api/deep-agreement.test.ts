import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmDeepAgreement,
  deferDeepAgreement,
  editDeepAgreement,
  fetchDeepAgreements,
  proposeDeepAgreement,
} from "./deep-agreement";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const terms = {
  topic: "monthlyContribution" as const,
  scope: "주거비와 식비",
  owner: "both" as const,
  startMonth: "2026-10",
  dueDay: 25,
  monthlyContributions: { A: 1_000_000, B: 1_000_000 },
  commonScope: ["housing", "food"] as ("housing" | "food")[],
  exceptions: "",
};

const agreement = {
  id: "agreement-a",
  version: 1,
  round: 2,
  text: "매월 100만 원씩 공동비로 사용해요.",
  reviewOn: null,
  status: "proposed" as const,
  myConfirmed: false,
  partnerConfirmed: false,
  terms,
  planVersion: 3,
  sourceReportId: "report-a",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });

beforeEach(() => {
  fetchMock.mockReset();
});

describe("deep agreement API", () => {
  it("reads the current agreement list", async () => {
    fetchMock.mockResolvedValue(jsonResponse([agreement]));

    await expect(fetchDeepAgreements("session-a")).resolves.toEqual([agreement]);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/session-a/agreements");
  });

  it("sends expectedRound only when proposing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(agreement, 201));
    const body = { expectedRound: 2, text: agreement.text, reviewOn: null, terms };

    await expect(proposeDeepAgreement("session-a", body)).resolves.toEqual(agreement);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/session-a/agreements");
    expect(await request.json()).toEqual(body);
  });

  it("sends expectedVersion when editing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(agreement));
    const body = { expectedVersion: 1, text: agreement.text, reviewOn: null, terms };

    await expect(editDeepAgreement("session-a", "agreement-a", body)).resolves.toEqual(agreement);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("PATCH");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/session-a/agreements/agreement-a");
    expect(await request.json()).toEqual(body);
  });

  it.each([
    ["confirm", confirmDeepAgreement, "/confirm"],
    ["defer", deferDeepAgreement, "/defer"],
  ] as const)("sends expectedVersion when requesting %s", async (_name, action, suffix) => {
    fetchMock.mockResolvedValue(jsonResponse(agreement));

    await expect(action("session-a", "agreement-a", 1)).resolves.toEqual(agreement);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe(`/api/v1/deep/v3/sessions/session-a/agreements/agreement-a${suffix}`);
    expect(await request.json()).toEqual({ expectedVersion: 1 });
  });

  it("blocks an invalid proposal before the network request", async () => {
    const invalid = { expectedRound: 2, text: agreement.text, reviewOn: null, terms: { ...terms, monthlyContributions: { A: 1 } } };

    await expect(proposeDeepAgreement("session-a", invalid)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
