import { describe, expect, it } from "vitest";

import { sharedPlanV3Schema } from "./schema";

const amount = (value: number | null = null, status: "known" | "unknown" = value === null ? "unknown" : "known") => ({
  value,
  status,
  precision: "exact" as const,
});

const validPlan = () => ({
  planSchemaVersion: "deep-plan-v3" as const,
  fundingAsOf: "2026-09-01",
  startMonth: "2026-10",
  housingType: "rent" as const,
  commonExpensesStatus: "known" as const,
});

function expectCode(input: Record<string, unknown>, code: string) {
  const result = sharedPlanV3Schema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((issue) => issue.message === code)).toBe(true);
  }
}

describe("SharedPlanV3 request schema", () => {
  it("emits AMOUNT_STATUS_MISMATCH for nested amounts", () => {
    expectCode({ ...validPlan(), monthlyHousingCost: amount(null, "known") }, "AMOUNT_STATUS_MISMATCH");
  });

  it.each(["1.5", "0.035", 0.035, null] as const)("accepts a server-compatible annual rate %s", (annualRate) => {
    const result = sharedPlanV3Schema.safeParse({
      ...validPlan(),
      newHousingLoan: { id: "new-loan", type: "housing", annualRate },
    });

    expect(result.success).toBe(true);
  });

  it.each(["-1", "abc"] as const)("rejects an invalid annual rate %s", (annualRate) => {
    const result = sharedPlanV3Schema.safeParse({
      ...validPlan(),
      newHousingLoan: { id: "new-loan", type: "housing", annualRate },
    });

    expect(result.success).toBe(false);
  });

  it.each(["2026-99-99", "2026-02-31"] as const)("rejects a nonexistent calendar date %s", (fundingAsOf) => {
    const result = sharedPlanV3Schema.safeParse({ ...validPlan(), fundingAsOf });

    expect(result.success).toBe(false);
  });

  it("emits BUDGET_ITEMS_REQUIRE_KNOWN_SCOPE for undisclosed common expenses", () => {
    expectCode({ ...validPlan(), commonExpensesStatus: "unknown", commonExpenses: { food: amount(100) } }, "BUDGET_ITEMS_REQUIRE_KNOWN_SCOPE");
  });

  it("rejects common expense categories outside the server enum", () => {
    const result = sharedPlanV3Schema.safeParse({
      ...validPlan(),
      commonExpenses: { unknown: amount(100) },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // 어느 키가 막혔는지 고정한다. 실패 여부만 보면 엉뚱한 이유로 통과할 수 있다.
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("commonExpenses.unknown");
    }
  });

  it("emits UNSAFE_COMMON_BUDGET when common expenses exceed safe integer totals", () => {
    expectCode({
      ...validPlan(),
      commonExpenses: {
        housing: amount(Number.MAX_SAFE_INTEGER),
        food: amount(1),
      },
    }, "UNSAFE_COMMON_BUDGET");
  });

  it("emits DUPLICATE_FUNDING_DEADLINE for repeated deadline IDs", () => {
    const deadline = { id: "move-in", amount: amount(100) };
    expectCode({ ...validPlan(), fundingDeadlines: [deadline, deadline] }, "DUPLICATE_FUNDING_DEADLINE");
  });

  it("emits DEADLINE_TOTAL_MISMATCH when the dated amounts do not add up", () => {
    expectCode({
      ...validPlan(),
      housingPriceWon: amount(1_000),
      oneOffCostsWon: amount(100),
      fundingDeadlines: [{ id: "move-in", amount: amount(999) }],
    }, "DEADLINE_TOTAL_MISMATCH");
  });

  it("emits INVALID_NEW_HOUSING_LOAN for a loan on a keep plan", () => {
    expectCode({
      ...validPlan(),
      housingType: "keep",
      newHousingLoan: { id: "new-loan", type: "housing", disposition: "keep" },
    }, "INVALID_NEW_HOUSING_LOAN");
  });
});
