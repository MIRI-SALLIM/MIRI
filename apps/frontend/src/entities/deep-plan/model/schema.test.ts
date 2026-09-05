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

  it("emits BUDGET_ITEMS_REQUIRE_KNOWN_SCOPE for undisclosed common expenses", () => {
    expectCode({ ...validPlan(), commonExpensesStatus: "unknown", commonExpenses: { food: amount(100) } }, "BUDGET_ITEMS_REQUIRE_KNOWN_SCOPE");
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
