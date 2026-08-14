import { describe, expect, it, vi } from "vitest";

import { createApiClient, requestApi } from "./client";

const activeSession = {
  createdAt: "2026-08-14T00:00:00Z",
  id: "session-a",
  invitationCode: "INV-A",
  mode: "light",
  myRole: "creator",
  status: "in_progress",
};

describe("apiClient", () => {
  it("uses the same-origin OpenAPI path and includes participant cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(activeSession), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const apiClient = createApiClient({ fetch: fetchMock });

    await expect(requestApi(apiClient.GET("/api/v1/me/session"))).resolves.toEqual(activeSession);

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(new URL(request.url).origin).toBe(window.location.origin);
    expect(new URL(request.url).pathname).toBe("/api/v1/me/session");
    expect(request.credentials).toBe("include");
  });

  it("throws an ApiError with contract status and code for non-2xx responses", async () => {
    const apiClient = createApiClient({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "PARTICIPANT_UNAUTHORIZED",
              message: "expired cookie",
            },
          }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    });

    await expect(requestApi(apiClient.GET("/api/v1/me/session"))).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      code: "PARTICIPANT_UNAUTHORIZED",
      kind: "unauthorized",
    });
  });
});
