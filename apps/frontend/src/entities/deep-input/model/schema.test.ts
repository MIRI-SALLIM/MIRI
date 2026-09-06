import { describe, expect, it } from "vitest";

import { deepInputV3Schema, safeParseDeepInputV3 } from "./schema";

const amount = (value: number | null = null, status: "known" | "unknown" | "withheld" = value === null ? "unknown" : "known") => ({
  value,
  status,
  precision: "exact" as const,
});

const source = (overrides: Record<string, unknown> = {}) => ({
  id: "source-a",
  kind: "cashSavings",
  grossAmount: amount(1_000),
  certainty: "confirmed",
  ...overrides,
});

const debt = (overrides: Record<string, unknown> = {}) => ({
  id: "debt-a",
  type: "loan",
  balance: amount(1_000),
  disposition: "keep",
  repaymentType: "unknown",
  ...overrides,
});

const validInput = () => ({
  inputVersion: "deep-input-v3" as const,
  assetsStatus: "known" as const,
  debtsStatus: "known" as const,
});

function expectCode(input: Record<string, unknown>, code: string) {
  const result = deepInputV3Schema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((issue) => issue.message === code)).toBe(true);
  }
}

describe("DeepInputV3 request schema", () => {
  it.each([
    ["AMOUNT_STATUS_MISMATCH", { housingCost: amount(null, "known") }],
    ["ITEMS_REQUIRE_KNOWN_COLLECTION", { assetsStatus: "unknown", assets: [{ id: "asset-a", kind: "cashSavings" }] }],
    ["DUPLICATE_ITEM_ID", { assetsStatus: "known", assets: [{ id: "asset-a", kind: "cashSavings" }, { id: "asset-a", kind: "cashSavings" }] }],
    ["DUPLICATE_ITEM_ID", { debtsStatus: "known", debts: [debt(), debt()] }],
    ["DUPLICATE_IMPORTANT_AREA", { importantAreas: ["savings", "savings"] }],
    ["DUPLICATE_SKIPPED_QUESTION", { skippedQuestionIds: ["D1", "D1"] }],
    ["SKIPPED_QUESTION_HAS_ANSWER", { values: { D1: 3 }, skippedQuestionIds: ["D1"] }],
    ["UNKNOWN_CONTEXT_KEY", { contextNotes: { unknown: "note" } }],
    ["UNKNOWN_EXPENSE_CATEGORY", { fixedExpenses: { unknown: amount(1) } }],
    ["UNKNOWN_EXPENSE_CATEGORY", { variableExpenses: { unknown: amount(1) } }],
    ["DUPLICATE_CONSTRAINT", { constraints: [{ id: "constraint-a", kind: "other", scope: "self", strength: "preferred" }, { id: "constraint-a", kind: "other", scope: "self", strength: "preferred" }] }],
    ["UNKNOWN_POST_SETTLEMENT_DEBT", { afterSettlementMonthlyPayments: { missing: amount(1) } }],
    ["FUNDING_ITEMS_REQUIRE_KNOWN_COLLECTION", { funding: { sourcesStatus: "unknown", sources: [source()] } }],
    ["FUNDING_ITEMS_REQUIRE_KNOWN_COLLECTION", { funding: { sourcesStatus: "known", settlementsStatus: "unknown", sources: [source()], settlements: [{ id: "settlement-a", debtId: "debt-a", parts: [] }] } }],
    ["DUPLICATE_FUNDING_ID", { funding: { sourcesStatus: "known", sources: [source(), source()] } }],
    ["UNKNOWN_FUNDING_REFERENCE", { funding: { sourcesStatus: "known", settlementsStatus: "known", sources: [source()], settlements: [{ id: "settlement-a", debtId: "missing", parts: [] }] } }],
    ["SETTLEMENT_PARTS_MISMATCH", { debts: [debt()], funding: { sourcesStatus: "known", settlementsStatus: "known", sources: [source()], settlements: [{ id: "settlement-a", debtId: "debt-a", amount: amount(100), parts: [{ sourceId: "source-a", amountWon: 99 }] }] } }],
    ["SETTLEMENT_EXCEEDS_DEBT", { debts: [debt({ balance: amount(100) })], funding: { sourcesStatus: "known", settlementsStatus: "known", sources: [source()], settlements: [{ id: "settlement-a", debtId: "debt-a", amount: amount(101), parts: [] }] } }],
    ["ALLOCATION_EXCEEDS_NET_SOURCE", { funding: { sourcesStatus: "known", sources: [source({ housingAllocationWon: 1_001 })] } }],
    ["FUNDING_EXCEEDS_OWN_ASSET", { assets: [{ id: "source-a", kind: "cashSavings", balance: amount(100) }], funding: { sourcesStatus: "known", sources: [source({ grossAmount: amount(101) })] } }],
    ["FUNDING_ASSET_REFERENCE_MISMATCH", { funding: { sourcesStatus: "known", sources: [source({ id: "missing" })] } }],
    ["EXTERNAL_SOURCE_DUPLICATES_ASSET", { assets: [{ id: "support-a", kind: "cashSavings" }], funding: { sourcesStatus: "known", sources: [source({ id: "support-a", kind: "support" })] } }],
    ["DUPLICATE_SETTLEMENT_SOURCE", {
      assets: [{ id: "source-a", kind: "cashSavings", balance: amount(10) }],
      debts: [debt({ id: "debt-a", balance: amount(10) })],
      funding: {
        sourcesStatus: "known",
        settlementsStatus: "known",
        sources: [source({ id: "source-a", grossAmount: amount(10) })],
        settlements: [{
          id: "settlement-a",
          debtId: "debt-a",
          amount: amount(2),
          parts: [{ sourceId: "source-a", amountWon: 1 }, { sourceId: "source-a", amountWon: 1 }],
        }],
      },
    }],
    ["UNSAFE_FUNDING_TOTAL", {
      assets: [{ id: "source-a", kind: "cashSavings", balance: amount(Number.MAX_SAFE_INTEGER) }],
      funding: {
        sourcesStatus: "known",
        sources: [
          source({ id: "source-a", grossAmount: amount(Number.MAX_SAFE_INTEGER) }),
          source({ id: "support-a", kind: "support", grossAmount: amount(1) }),
        ],
      },
    }],
  ] as const)("emits %s for the matching contract violation", (code, input) => {
    expectCode({ ...validInput(), ...input }, code);
  });

  it("rejects values outside the D1-D10 question set", () => {
    const result = deepInputV3Schema.safeParse({ ...validInput(), values: { D11: 3 } });

    expect(result.success).toBe(false);
  });

  it("rejects asset allocations that v3 represents in funding sources", () => {
    const result = deepInputV3Schema.safeParse({
      ...validInput(),
      assets: [{ id: "asset-a", kind: "cashSavings", balance: amount(100), housingAllocationWon: 101 }],
    });

    expect(result.success).toBe(false);
  });

  it.each(["1.5", "0.035", 0.035, null] as const)("accepts a server-compatible annual rate %s", (annualRate) => {
    const result = deepInputV3Schema.safeParse({ ...validInput(), debts: [debt({ annualRate })] });

    expect(result.success).toBe(true);
  });

  it.each(["-1", "abc"] as const)("rejects an invalid annual rate %s", (annualRate) => {
    const result = deepInputV3Schema.safeParse({ ...validInput(), debts: [debt({ annualRate })] });

    expect(result.success).toBe(false);
  });

  it("rejects allocation and settlement fields that v3 represents elsewhere", () => {
    const result = deepInputV3Schema.safeParse({
      ...validInput(),
      assets: [{ id: "asset-a", kind: "cashSavings", balance: amount(1_000), housingAllocationWon: 1_000 }],
      debts: [debt({ disposition: "settle" })],
    });

    expect(result.success).toBe(false);
  });

  it("accepts a future source on the storage date.max but rejects it for an actual preview date", () => {
    const input = {
      ...validInput(),
      assets: [{ id: "source-a", kind: "cashSavings", balance: amount(1_000) }],
      funding: { sourcesStatus: "known", sources: [source({ certainty: "available", availableOn: "2026-10-01" })] },
    };

    expect(deepInputV3Schema.safeParse(input).success).toBe(true);
    const result = safeParseDeepInputV3(input, { asOf: "2026-09-01" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "AVAILABLE_SOURCE_REQUIRES_PAST_OR_CURRENT_DATE")).toBe(true);
    }
  });

  it("requires an availability date when a source is marked available", () => {
    const result = deepInputV3Schema.safeParse({
      ...validInput(),
      assets: [{ id: "source-a", kind: "cashSavings", balance: amount(1_000) }],
      funding: { sourcesStatus: "known", sources: [source({ certainty: "available", availableOn: null })] },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "AVAILABLE_SOURCE_REQUIRES_PAST_OR_CURRENT_DATE")).toBe(true);
    }
  });
});
