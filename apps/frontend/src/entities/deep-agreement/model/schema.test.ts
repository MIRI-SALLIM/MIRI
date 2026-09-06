import { describe, expect, it } from "vitest";

import { decisionTermsSchema } from "./schema";

const validTerms = () => ({
  topic: "monthlyContribution" as const,
  scope: "주거비와 식비를 함께 관리해요",
  owner: "both" as const,
  startMonth: "2026-10",
  dueDay: 25,
  monthlyContributions: { A: 1_000_000, B: 1_000_000 },
  commonScope: ["housing", "food"] as const,
  exceptions: "예외가 생기면 다음 대화에서 다시 정해요.",
});

function expectCode(input: Record<string, unknown>, code: string) {
  const result = decisionTermsSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((issue) => issue.message === code)).toBe(true);
  }
}

describe("DecisionTerms request schema", () => {
  it("accepts a complete monthly contribution proposal", () => {
    expect(decisionTermsSchema.safeParse(validTerms()).success).toBe(true);
  });

  it("emits DUPLICATE_COMMON_SCOPE for duplicate categories", () => {
    expectCode({ ...validTerms(), commonScope: ["housing", "housing"] }, "DUPLICATE_COMMON_SCOPE");
  });

  it("emits COMMON_SCOPE_REQUIRES_MONTHLY_TOPIC outside monthly contributions", () => {
    expectCode({ ...validTerms(), topic: "savings", monthlyContributions: {}, commonScope: ["housing"] }, "COMMON_SCOPE_REQUIRES_MONTHLY_TOPIC");
  });

  it("requires both A and B contributions for a monthly contribution topic", () => {
    expectCode({ ...validTerms(), monthlyContributions: { A: 1_000_000 } }, "BOTH_CONTRIBUTIONS_REQUIRED");
  });

  it("emits CONTRIBUTIONS_REQUIRE_MONTHLY_TOPIC outside monthly contributions", () => {
    expectCode({ ...validTerms(), topic: "savings", monthlyContributions: { A: 1, B: 1 }, commonScope: [] }, "CONTRIBUTIONS_REQUIRE_MONTHLY_TOPIC");
  });

  it("uses bigint-safe arithmetic for UNSAFE_CONTRIBUTION_TOTAL", () => {
    expectCode({ ...validTerms(), monthlyContributions: { A: Number.MAX_SAFE_INTEGER, B: 1 } }, "UNSAFE_CONTRIBUTION_TOTAL");
  });
});
