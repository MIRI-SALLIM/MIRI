import type { components } from "@/shared/api";

export const deepInputV3Fixture = {
  inputVersion: "deep-input-v3",
  income: {
    monthlyNetIncome: { status: "known", value: 3_000_000, precision: "exact" },
    annualNetBonus: { status: "known", value: 0, precision: "exact" },
    bonusIncludedInMonthlyIncome: false,
    bonusMonth: null,
    referenceMonth: "2026-09",
  },
  fixedExpenses: {
    communication: { status: "known", value: 0, precision: "exact" },
    insurance: { status: "known", value: 0, precision: "exact" },
    subscriptions: { status: "known", value: 0, precision: "exact" },
    familySupport: { status: "known", value: 0, precision: "exact" },
    other: { status: "known", value: 0, precision: "exact" },
  },
  variableExpenses: {
    food: { status: "known", value: 0, precision: "exact" },
    transport: { status: "known", value: 0, precision: "exact" },
    shopping: { status: "known", value: 0, precision: "exact" },
    leisure: { status: "known", value: 0, precision: "exact" },
    other: { status: "known", value: 0, precision: "exact" },
  },
  housingCost: { status: "known", value: 0, precision: "exact" },
  livingTogether: false,
  debtsStatus: "known",
  debts: [],
  assetsStatus: "known",
  assets: [
    {
      id: "savings",
      kind: "cashSavings",
      balance: { status: "known", value: 10_000_000, precision: "exact" },
      availableOn: "2026-09-01",
      housingAllocationWon: 0,
      goalAllocationWon: 0,
    },
  ],
  funding: {
    sourcesStatus: "known",
    sources: [
      {
        id: "savings",
        kind: "cashSavings",
        grossAmount: { status: "known", value: 10_000_000, precision: "exact" },
        availableOn: "2026-09-01",
        certainty: "available",
        housingAllocationWon: 10_000_000,
        goalAllocationWon: 0,
        reserveAllocationWon: 0,
      },
    ],
    settlementsStatus: "known",
    settlements: [],
  },
  contribution: {
    ownMonthly: { status: "known", value: 800_000, precision: "exact" },
    expectedPartnerMonthly: { status: "known", value: 1_200_000, precision: "exact" },
    personalSpendingFloor: { status: "unknown", value: null, precision: "exact" },
    personalSavingFloor: { status: "unknown", value: null, precision: "exact" },
    discussionState: "notDiscussed",
  },
  constraints: [],
  afterSettlementMonthlyPayments: {},
  values: {
    D1: 3,
    D2: 3,
    D3: 3,
    D4: 3,
    D5: 3,
    D6: 3,
    D7: 3,
    D8: 3,
    D9: 3,
    D10: 3,
  },
  skippedQuestionIds: [],
  importantAreas: [],
  contextNotes: {},
} as const satisfies components["schemas"]["DeepInputV3-Input"];

export const deepInputV3 = deepInputV3Fixture;
