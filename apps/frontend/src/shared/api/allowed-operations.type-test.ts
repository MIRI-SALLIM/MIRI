import createClient from "openapi-fetch";

import type { AllowedPaths } from "./allowed-operations";

const client = createClient<AllowedPaths>();

void client.GET("/api/v1/me/session");
void client.POST("/api/v1/deep/v3/sessions", {
  body: {},
  params: { header: { "Idempotency-Key": "test-key" } },
});
void client.DELETE("/api/v1/deep/v3/sessions/{session_id}/meeting/me/consent", {
  params: { path: { session_id: "session-a" } },
});

// @ts-expect-error Paths outside the frontend allowlist must not compile.
void client.GET("/api/v1/calculate/light");

// @ts-expect-error Methods outside the frontend allowlist must not compile.
void client.GET("/api/v1/sessions");

// @ts-expect-error Legacy v1/v2 deep paths must remain outside the frontend allowlist.
void client.GET("/api/v1/deep/sessions/session-a/status");

// @ts-expect-error Legacy v1/v2 deep paths must remain outside the frontend allowlist.
void client.GET("/api/v1/deep/questions");
