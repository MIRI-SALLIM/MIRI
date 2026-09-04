import { describe, expect, it, vi } from "vitest";

import { API_REQUEST_TIMEOUT_MS, createApiClient, requestApi } from "./client";

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

  it("aborts an unresponsive request at the cap and reports a timeout error", async () => {
    vi.useFakeTimers();

    try {
      const fetchMock = vi.fn(
        (request: Request) =>
          new Promise<Response>((_, reject) => {
            request.signal.addEventListener(
              "abort",
              () => reject(new DOMException("The request timed out", "AbortError")),
              { once: true },
            );
          }),
      );
      const apiClient = createApiClient({ fetch: fetchMock });
      const request = requestApi(apiClient.GET("/api/v1/me/session"));
      const rejectedRequest = expect(request).rejects.toMatchObject({
        kind: "timeout",
        status: null,
      });

      await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);

      const [requestArgument] = fetchMock.mock.calls[0] as [Request];
      expect(requestArgument.signal.aborted).toBe(true);
      await rejectedRequest;
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not abort a non-GET request after the cap", async () => {
    vi.useFakeTimers();

    try {
      let resolveRequest!: (response: Response) => void;
      const fetchMock = vi.fn(
        (request: Request) =>
          new Promise<Response>((resolve, reject) => {
            resolveRequest = resolve;
            request.signal.addEventListener(
              "abort",
              () => reject(new DOMException("The request timed out", "AbortError")),
              { once: true },
            );
          }),
      );
      const apiClient = createApiClient({ fetch: fetchMock });
      const request = requestApi(
        apiClient.POST("/api/v1/sessions", {
          body: { mode: "light" },
        }),
      );
      const requestResult = request.then(() => "resolved", () => "rejected");

      await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS * 2);

      const [requestArgument] = fetchMock.mock.calls[0] as [Request];
      expect(requestArgument.signal.aborted).toBe(false);
      resolveRequest(new Response("{}", { status: 200 }));
      await expect(requestResult).resolves.toBe("resolved");
    } finally {
      vi.useRealTimers();
    }
  });
});
