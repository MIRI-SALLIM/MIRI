import { describe, expect, it } from "vitest";

import { allowedOperations } from "./allowed-operations";

describe("F2 API operation allowlist", () => {
  it("contains only the operations used by the frontend", () => {
    expect(allowedOperations).toEqual([
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
    ]);
  });
});
