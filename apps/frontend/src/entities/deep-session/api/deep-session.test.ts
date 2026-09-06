import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearActiveDeepSessionId,
  createDeepSession,
  DEEP_ACTIVE_SESSION_STORAGE_KEY,
  fetchDeepSessionStatus,
  joinDeepSession,
  readActiveDeepSessionId,
  saveActiveDeepSessionId,
  submitDeepSession,
  withdrawDeepSession,
} from "./deep-session";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const session = {
  id: "deep-session-a",
  invitationCode: "INV-DEEP-A",
  questionVersion: "deep-v3" as const,
  role: "A" as const,
  round: 1,
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

beforeEach(() => {
  fetchMock.mockReset();
  sessionStorage.clear();
});

describe("deep session API", () => {
  it("creates a v3 session with an idempotency key and an empty payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse(session, 201));

    await expect(createDeepSession("attempt-a")).resolves.toEqual(session);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions");
    expect(request.headers.get("Idempotency-Key")).toBe("attempt-a");
    expect(await request.text()).toBe("{}");
  });

  it("joins, checks status, and withdraws through the v3 contracts", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(session))
      .mockResolvedValueOnce(jsonResponse({ mySubmitted: false, partnerCompleted: false, status: "waiting" }))
      .mockResolvedValueOnce(jsonResponse({ status: "closed" }));

    await expect(joinDeepSession("INV-DEEP-A", "attempt-b")).resolves.toEqual(session);
    await expect(fetchDeepSessionStatus(session.id)).resolves.toEqual({
      mySubmitted: false,
      partnerCompleted: false,
      status: "waiting",
    });
    await expect(withdrawDeepSession(session.id)).resolves.toEqual({ status: "closed" });

    const [joinRequest, statusRequest, withdrawRequest] = fetchMock.mock.calls.map(([request]) => request as Request);
    expect(new URL(joinRequest.url).pathname).toBe("/api/v1/deep/v3/invitations/INV-DEEP-A/join");
    expect(joinRequest.headers.get("Idempotency-Key")).toBe("attempt-b");
    expect(new URL(statusRequest.url).pathname).toBe(`/api/v1/deep/v3/sessions/${session.id}/status`);
    expect(new URL(withdrawRequest.url).pathname).toBe(`/api/v1/deep/v3/sessions/${session.id}/withdraw`);
    expect(await withdrawRequest.text()).toBe("{}");
  });

  it("submits the latest revision and plan version with both sharing choices", async () => {
    const response = { mySubmitted: true, partnerCompleted: false, status: "waiting" as const };
    fetchMock.mockResolvedValue(jsonResponse(response));

    await expect(
      submitDeepSession("deep-session-a", {
        expectedRevision: 7,
        planVersion: 3,
        consentVersion: "deep-sharing-v2",
        shareFinance: true,
        shareValues: false,
      }),
    ).resolves.toEqual(response);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/v1/deep/v3/sessions/deep-session-a/me/submit");
    await expect(request.json()).resolves.toEqual({
      expectedRevision: 7,
      planVersion: 3,
      consentVersion: "deep-sharing-v2",
      shareFinance: true,
      shareValues: false,
    });
  });
});

describe("active deep session storage", () => {
  it("stores only the public session id and clears it without touching another session", () => {
    saveActiveDeepSessionId("session-a");
    expect(readActiveDeepSessionId()).toBe("session-a");
    expect(sessionStorage.getItem(DEEP_ACTIVE_SESSION_STORAGE_KEY)).toBe("session-a");

    clearActiveDeepSessionId("session-b");
    expect(readActiveDeepSessionId()).toBe("session-a");

    clearActiveDeepSessionId("session-a");
    expect(readActiveDeepSessionId()).toBeNull();
  });

  it("does not fail the successful session flow when storage is blocked", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(() => saveActiveDeepSessionId("session-a")).not.toThrow();
    expect(readActiveDeepSessionId()).toBeNull();

    setItem.mockRestore();
  });
});
