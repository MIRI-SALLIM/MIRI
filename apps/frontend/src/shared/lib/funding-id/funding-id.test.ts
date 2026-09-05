import { describe, expect, it } from "vitest";

import { createFundingId } from "./funding-id";

describe("createFundingId", () => {
  it("creates a backend-compatible ID with a useful prefix", () => {
    const id = createFundingId("housing");

    expect(id).toMatch(/^housing-[a-z0-9-]+$/);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("sanitizes arbitrary prefixes", () => {
    expect(createFundingId("주거 비용")).toMatch(/^funding-[a-z0-9-]+$/);
  });

  it("keeps generated IDs unique even when the prefix is long", () => {
    const prefix = "a".repeat(100);
    const first = createFundingId(prefix);
    const second = createFundingId(prefix);

    expect(first).not.toBe(second);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(second.length).toBeLessThanOrEqual(64);
  });
});
