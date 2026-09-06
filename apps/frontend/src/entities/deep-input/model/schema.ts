import { z } from "zod";

import type { components } from "@/shared/api";
import { isCalendarDate, isServerDecimal } from "@/shared/lib";

const SAFE_MONEY = Number.MAX_SAFE_INTEGER;
const STORAGE_AS_OF = "9999-12-31";

const knowledgeSchema = z.enum(["known", "unknown", "withheld"]);
const moneySchema = z.number().int().min(0).max(SAFE_MONEY);
const fundingIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const monthSchema = z.string().regex(/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/);
const questionIdSchema = z.enum(["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"]);
const areaSchema = z.enum(["savings", "spending", "investment", "debt", "jointManagement"]);
const contextKeySchema = z.enum([
  "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10",
  "savings", "spending", "investment", "debt", "jointManagement",
]);
const fixedExpenseCategories = new Set(["communication", "insurance", "subscriptions", "familySupport", "other"]);
const variableExpenseCategories = new Set(["food", "transport", "shopping", "leisure", "other"]);

const calendarDateSchema = z.string().refine(isCalendarDate, "유효하지 않은 날짜입니다.");

// apps/backend/deep/schemas.py 의 DebtInput.annualRate 제약이다.
const ANNUAL_RATE_LIMITS = { maxDigits: 14, decimalPlaces: 10 } as const;

const annualRateSchema = z
  .union([z.number().finite(), z.string(), z.null()])
  .optional()
  .refine(
    (value) => value == null || isServerDecimal(value, ANNUAL_RATE_LIMITS),
    "유효하지 않은 연이율입니다.",
  );

const amountSchema = z
  .object({
    value: moneySchema.nullable().optional(),
    status: knowledgeSchema.default("unknown"),
    precision: z.enum(["exact", "estimate"]).default("exact"),
  })
  .strict()
  .superRefine((amount, context) => {
    if ((amount.status === "known") !== (amount.value !== null && amount.value !== undefined)) {
      context.addIssue({ code: "custom", message: "AMOUNT_STATUS_MISMATCH" });
    }
  });

const assetSchema = z
  .object({
    id: fundingIdSchema,
    kind: z.enum(["cashSavings", "rentalDeposit", "investments", "subscription", "realEstate", "other"]),
    balance: amountSchema.optional(),
    availableOn: calendarDateSchema.nullable().optional(),
    housingAllocationWon: z.literal(0).default(0),
    goalAllocationWon: z.literal(0).default(0),
  })
  .strict();

const debtSchema = z
  .object({
    id: fundingIdSchema,
    type: z.string().min(1).max(50),
    balance: amountSchema.optional(),
    monthlyPayment: amountSchema.optional(),
    annualRate: annualRateSchema,
    remainingMonths: z.number().int().min(1).max(1200).nullable().optional(),
    repaymentType: z.enum(["equalPayment", "equalPrincipal", "bulletMaturity", "unknown"]).default("unknown"),
    disposition: z.literal("keep").default("keep"),
  })
  .strict();

const sourceSchema = z
  .object({
    id: fundingIdSchema,
    kind: z.enum(["cashSavings", "rentalDeposit", "investments", "subscription", "realEstate", "other", "support", "newBorrowing"]),
    grossAmount: amountSchema.optional(),
    availableOn: calendarDateSchema.nullable().optional(),
    certainty: z.enum(["available", "confirmed", "expected", "unknown"]).default("unknown"),
    housingAllocationWon: moneySchema.default(0),
    goalAllocationWon: moneySchema.default(0),
    reserveAllocationWon: moneySchema.default(0),
  })
  .strict();

const settlementPartSchema = z
  .object({ sourceId: fundingIdSchema, amountWon: moneySchema })
  .strict();

const settlementSchema = z
  .object({
    id: fundingIdSchema,
    debtId: fundingIdSchema,
    amount: amountSchema.optional(),
    dueOn: calendarDateSchema.nullable().optional(),
    parts: settlementPartSchema.array().max(100).optional(),
  })
  .strict();

const personalFundingSchema = z
  .object({
    sourcesStatus: knowledgeSchema.default("unknown"),
    sources: sourceSchema.array().max(100).optional(),
    settlementsStatus: knowledgeSchema.default("unknown"),
    settlements: settlementSchema.array().max(60).optional(),
  })
  .strict();

const contributionSchema = z
  .object({
    ownMonthly: amountSchema.optional(),
    expectedPartnerMonthly: amountSchema.optional(),
    personalSpendingFloor: amountSchema.optional(),
    personalSavingFloor: amountSchema.optional(),
    discussionState: z.enum(["unknown", "notDiscussed", "discussing", "believeAgreed"]).default("unknown"),
  })
  .strict();

const constraintSchema = z
  .object({
    id: fundingIdSchema,
    kind: z.enum(["housingCost", "debtPayment", "borrowing", "personalSpending", "other"]),
    scope: z.enum(["household", "self"]),
    strength: z.enum(["required", "preferred"]),
    amount: amountSchema.optional(),
    allowBorrowing: z.boolean().nullable().optional(),
    note: z.string().max(300).default(""),
  })
  .strict();

const incomeSchema = z
  .object({
    monthlyNetIncome: amountSchema.optional(),
    annualNetBonus: amountSchema.optional(),
    bonusIncludedInMonthlyIncome: z.boolean().default(false),
    bonusMonth: z.number().int().min(1).max(12).nullable().optional(),
    referenceMonth: monthSchema.nullable().optional(),
  })
  .strict();

const deepInputObjectSchema = z
  .object({
    inputVersion: z.literal("deep-input-v3"),
    income: incomeSchema.optional(),
    fixedExpenses: z.record(z.string(), amountSchema).optional(),
    variableExpenses: z.record(z.string(), amountSchema).optional(),
    housingCost: amountSchema.optional(),
    debts: debtSchema.array().max(30).optional(),
    debtsStatus: knowledgeSchema.default("unknown"),
    assets: assetSchema.array().max(100).optional(),
    assetsStatus: knowledgeSchema.default("unknown"),
    livingTogether: z.boolean().nullable().optional(),
    values: z.partialRecord(questionIdSchema, z.number().int().min(1).max(5).nullable()).optional(),
    skippedQuestionIds: questionIdSchema.array().max(10).optional(),
    importantAreas: areaSchema.array().max(2).optional(),
    contextNotes: z.record(z.string(), z.string().max(300)).optional(),
    funding: personalFundingSchema.optional(),
    contribution: contributionSchema.optional(),
    constraints: constraintSchema.array().max(20).optional(),
    afterSettlementMonthlyPayments: z.record(z.string(), amountSchema).optional(),
  })
  .strict();

type ValidationContext = z.RefinementCtx;

const addCode = (context: ValidationContext, code: string) =>
  context.addIssue({ code: "custom", message: code });

const hasDuplicate = <T>(items: T[]) => new Set(items).size !== items.length;
const hasDuplicateId = (items: Array<{ id: string }>) => new Set(items.map((item) => item.id)).size !== items.length;

const sumValues = (values: Array<number | null | undefined>) =>
  values.reduce<bigint>((sum, value) => sum + BigInt(value ?? 0), 0n);

const validateDeepInput = (
  input: z.output<typeof deepInputObjectSchema>,
  context: ValidationContext,
  asOf: string,
) => {
  const assets = input.assets ?? [];
  const debts = input.debts ?? [];
  const funding = input.funding;
  const sources = funding?.sources ?? [];
  const settlements = funding?.settlements ?? [];

  for (const [items, status] of [
    [assets, input.assetsStatus],
    [debts, input.debtsStatus],
  ] as const) {
    if (items.length > 0 && status !== "known") {
      addCode(context, "ITEMS_REQUIRE_KNOWN_COLLECTION");
    }
  }

  if (funding) {
    for (const [items, status] of [
      [sources, funding.sourcesStatus],
      [settlements, funding.settlementsStatus],
    ] as const) {
      if (items.length > 0 && status !== "known") {
        addCode(context, "FUNDING_ITEMS_REQUIRE_KNOWN_COLLECTION");
      }
    }
  }

  if (hasDuplicateId(assets) || hasDuplicateId(debts)) {
    addCode(context, "DUPLICATE_ITEM_ID");
  }

  if (Object.keys(input.fixedExpenses ?? {}).some((key) => !fixedExpenseCategories.has(key))
      || Object.keys(input.variableExpenses ?? {}).some((key) => !variableExpenseCategories.has(key))) {
    addCode(context, "UNKNOWN_EXPENSE_CATEGORY");
  }

  if (Object.keys(input.contextNotes ?? {}).some((key) => !contextKeySchema.safeParse(key).success)) {
    addCode(context, "UNKNOWN_CONTEXT_KEY");
  }

  if (hasDuplicateId(sources) || hasDuplicateId(settlements)) {
    addCode(context, "DUPLICATE_FUNDING_ID");
  }

  if (input.importantAreas && hasDuplicate(input.importantAreas)) {
    addCode(context, "DUPLICATE_IMPORTANT_AREA");
  }

  if (input.skippedQuestionIds && hasDuplicate(input.skippedQuestionIds)) {
    addCode(context, "DUPLICATE_SKIPPED_QUESTION");
  }

  if (input.skippedQuestionIds?.some((questionId) => input.values?.[questionId] !== undefined && input.values[questionId] !== null)) {
    addCode(context, "SKIPPED_QUESTION_HAS_ANSWER");
  }

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const debtsById = new Map(debts.map((debt) => [debt.id, debt]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const sourceParts = new Map(sources.map((source) => [source.id, 0n]));
  const debtPaid = new Map(debts.map((debt) => [debt.id, 0n]));

  if (hasDuplicateId(input.constraints ?? [])) {
    addCode(context, "DUPLICATE_CONSTRAINT");
  }

  if (Object.keys(input.afterSettlementMonthlyPayments ?? {}).some((debtId) => !debtsById.has(debtId))) {
    addCode(context, "UNKNOWN_POST_SETTLEMENT_DEBT");
  }

  for (const settlement of settlements) {
    if (!debtsById.has(settlement.debtId) || (settlement.parts ?? []).some((part) => !sourcesById.has(part.sourceId))) {
      addCode(context, "UNKNOWN_FUNDING_REFERENCE");
    }

    const parts = settlement.parts ?? [];
    if (hasDuplicateId(parts.map((part) => ({ id: part.sourceId })))) {
      addCode(context, "DUPLICATE_SETTLEMENT_SOURCE");
    }
    const partsTotal = parts.reduce<bigint>((sum, part) => sum + BigInt(part.amountWon), 0n);
    if (parts.length > 0 && (settlement.amount?.value === undefined || settlement.amount.value === null || partsTotal !== BigInt(settlement.amount.value))) {
      addCode(context, "SETTLEMENT_PARTS_MISMATCH");
    }

    if (settlement.amount?.value !== undefined && settlement.amount.value !== null && debtsById.has(settlement.debtId)) {
      debtPaid.set(settlement.debtId, (debtPaid.get(settlement.debtId) ?? 0n) + BigInt(settlement.amount.value));
    }

    for (const part of parts) {
      if (sourcesById.has(part.sourceId)) {
        sourceParts.set(part.sourceId, (sourceParts.get(part.sourceId) ?? 0n) + BigInt(part.amountWon));
      }
    }
  }

  for (const [debtId, paid] of debtPaid) {
    const balance = debtsById.get(debtId)?.balance?.value;
    if (balance !== undefined && balance !== null && paid > BigInt(balance)) {
      addCode(context, "SETTLEMENT_EXCEEDS_DEBT");
    }
  }

  for (const source of sources) {
    if (source.certainty === "available" && (source.availableOn === undefined || source.availableOn === null || source.availableOn > asOf)) {
      addCode(context, "AVAILABLE_SOURCE_REQUIRES_PAST_OR_CURRENT_DATE");
    }

    const allocation = BigInt(source.housingAllocationWon) + BigInt(source.goalAllocationWon) + BigInt(source.reserveAllocationWon);
    const grossAmount = source.grossAmount?.value;
    if (grossAmount !== undefined && grossAmount !== null) {
      const netSource = BigInt(grossAmount) - (sourceParts.get(source.id) ?? 0n);
      if (allocation > (netSource > 0n ? netSource : 0n)) {
        addCode(context, "ALLOCATION_EXCEEDS_NET_SOURCE");
      }
    }
    if (allocation > BigInt(SAFE_MONEY)) {
      addCode(context, "UNSAFE_FUNDING_TOTAL");
    }

    const asset = assetsById.get(source.id);
    if (source.kind === "support" || source.kind === "newBorrowing") {
      if (asset !== undefined) {
        addCode(context, "EXTERNAL_SOURCE_DUPLICATES_ASSET");
      }
    } else if (asset === undefined || asset.kind !== source.kind) {
      addCode(context, "FUNDING_ASSET_REFERENCE_MISMATCH");
    } else if (grossAmount !== undefined && grossAmount !== null && asset.balance?.value !== undefined && asset.balance.value !== null && grossAmount > asset.balance.value) {
      addCode(context, "FUNDING_EXCEEDS_OWN_ASSET");
    }
  }

  if (funding) {
    const inflows = sumValues(sources.map((source) => source.grossAmount?.value));
    const outflows = sumValues(settlements.map((settlement) => settlement.amount?.value));
    const totalDebtPaid = [...debtPaid.values()].reduce<bigint>((sum, value) => sum + value, 0n);
    if ([inflows, outflows, totalDebtPaid].some((total) => total > BigInt(SAFE_MONEY))) {
      addCode(context, "UNSAFE_FUNDING_TOTAL");
    }
  }
};

export type DeepInputV3 = components["schemas"]["DeepInputV3-Input"];
export type DeepInputV3ValidationOptions = { asOf?: string };

export const createDeepInputV3Schema = ({ asOf = STORAGE_AS_OF }: DeepInputV3ValidationOptions = {}) =>
  deepInputObjectSchema.superRefine((input, context) => validateDeepInput(input, context, asOf));

export const deepInputV3Schema = createDeepInputV3Schema();

export const parseDeepInputV3 = (input: unknown, options?: DeepInputV3ValidationOptions): DeepInputV3 =>
  createDeepInputV3Schema(options).parse(input);

export const safeParseDeepInputV3 = (input: unknown, options?: DeepInputV3ValidationOptions) =>
  createDeepInputV3Schema(options).safeParse(input);

export { amountSchema };
