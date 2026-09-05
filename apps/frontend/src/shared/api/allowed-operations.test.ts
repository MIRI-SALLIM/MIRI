import { describe, expect, it } from "vitest";

import { allowedOperations } from "./allowed-operations";

describe("F2 API operation allowlist", () => {
  it("contains only the operations used by the frontend", () => {
    expect(allowedOperations).toEqual([
      { method: "get", path: "/api/v1/auth/me" },
      { method: "post", path: "/api/v1/sessions" },
      { method: "get", path: "/api/v1/me/session" },
      { method: "get", path: "/api/v1/light/questions" },
      { method: "get", path: "/api/v1/invitations/{code}" },
      { method: "post", path: "/api/v1/invitations/{code}/join" },
      { method: "get", path: "/api/v1/sessions/{session_id}/me/input" },
      { method: "patch", path: "/api/v1/sessions/{session_id}/me/input" },
      { method: "post", path: "/api/v1/sessions/{session_id}/me/submit" },
      { method: "post", path: "/api/v1/sessions/{session_id}/nudge" },
      { method: "get", path: "/api/v1/sessions/{session_id}/result" },
      { method: "get", path: "/api/v1/sessions/{session_id}/status" },
      { method: "post", path: "/api/v1/deep/funding/preview" },
      { method: "post", path: "/api/v1/deep/v3/sessions" },
      { method: "post", path: "/api/v1/deep/v3/invitations/{code}/join" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/status" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/me/input" },
      { method: "patch", path: "/api/v1/deep/v3/sessions/{session_id}/me/input" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/me/questions" },
      { method: "post", path: "/api/v1/deep/v3/sessions/{session_id}/me/submit" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/plan" },
      { method: "patch", path: "/api/v1/deep/v3/sessions/{session_id}/plan" },
      { method: "post", path: "/api/v1/deep/v3/sessions/{session_id}/plan/confirm" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/result" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/rounds" },
      { method: "post", path: "/api/v1/deep/v3/sessions/{session_id}/rounds" },
      { method: "post", path: "/api/v1/deep/v3/sessions/{session_id}/withdraw" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/agreements" },
      { method: "post", path: "/api/v1/deep/v3/sessions/{session_id}/agreements" },
      { method: "patch", path: "/api/v1/deep/v3/sessions/{session_id}/agreements/{agreement_id}" },
      { method: "post", path: "/api/v1/deep/v3/sessions/{session_id}/agreements/{agreement_id}/confirm" },
      { method: "post", path: "/api/v1/deep/v3/sessions/{session_id}/agreements/{agreement_id}/defer" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/meeting/guide" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/meeting/me" },
      { method: "patch", path: "/api/v1/deep/v3/sessions/{session_id}/meeting/me" },
      { method: "delete", path: "/api/v1/deep/v3/sessions/{session_id}/meeting/me/consent" },
      { method: "post", path: "/api/v1/deep/v3/sessions/{session_id}/meeting/me/consent" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/meeting/context" },
      { method: "get", path: "/api/v1/deep/v3/sessions/{session_id}/meeting/explanation" },
      { method: "post", path: "/api/v1/deep/v3/sessions/{session_id}/meeting/explanation" },
      { method: "post", path: "/api/v1/deep/v3/sessions/{session_id}/meeting/complete" },
    ]);
  });
});
