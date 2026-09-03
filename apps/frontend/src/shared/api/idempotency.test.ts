import { afterEach, describe, expect, it, vi } from "vitest";

import { createIdempotencyKey } from "./idempotency";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createIdempotencyKey", () => {
  it("creates a fresh key for each logical request", () => {
    const randomUUID = vi.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2");
    vi.stubGlobal("crypto", { randomUUID });

    expect(createIdempotencyKey()).toBe("request-1");
    expect(createIdempotencyKey()).toBe("request-2");
  });
});
