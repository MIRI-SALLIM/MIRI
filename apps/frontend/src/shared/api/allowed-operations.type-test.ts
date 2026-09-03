import createClient from "openapi-fetch";

import type { AllowedPaths } from "./allowed-operations";

const client = createClient<AllowedPaths>();

void client.GET("/api/v1/me/session");

// @ts-expect-error Paths outside the frontend allowlist must not compile.
void client.GET("/api/v1/calculate/light");

// @ts-expect-error Methods outside the frontend allowlist must not compile.
void client.GET("/api/v1/sessions");
