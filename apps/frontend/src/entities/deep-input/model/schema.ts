import { z } from "zod";

import type { components } from "@/shared/api";

const SAFE_MONEY = Number.MAX_SAFE_INTEGER;
const STORAGE_AS_OF = "9999-12-31";

const knowledgeSchema = z.enum(["known", "unknown", "withheld"]);
const moneySchema = z.number().int().min(0).max(SAFE_MONEY);
const fundingIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const monthSchema = z.string().regex(/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/);

const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

const calendarDateSchema = z.string().refine(isCalendarDate, "유효하지 않은 날짜입니다.");

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
    housingAllocationWon: moneySchema.default(0),
    goalAllocationWon: moneySchema.default(0),
  })
  .strict();

const debtSchema = z
  .object({
    id: fundingIdSchema,
    type: z.string().min(1).max(50),
    balance: amountSchema.optional(),
    monthlyPayment: amountSchema.optional(),
    annualRate: z.union([
      z.number().min(0).finite(),
      z.string().regex(/^(?!^[-+.]*$)[+-]?0*(?:\\d{0,4}|(?=[\\d.]{1,15}0*$)\\d{0,4}\\.\\d{0,10}0*$)/),
      z.null(),
    ]).optional(),
    remainingMonths: z.number().int().min(1).max(1200).nullable().optional(),
    repaymentType: z.enum(["equalPayment", "equalPrincipal", "bulletMaturity", "unknown"]).default("unknown"),
    disposition: z.enum(["keep", "settle"]).default("keep"),
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

const questionIdSchema = z.enum(["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"]);

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
    values: z.record(z.string(), z.number().int().min(1).max(5).nullable()).optional(),
    skippedQuestionIds: questionIdSchema.array().max(10).optional(),
    importantAreas: z.enum(["savings", "spending", "investment", "debt", "jointManagement"]).array().max(2).optional(),
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

const hasDuplicateId = (items: Array<{ id: string }>) => new Set(items.map((item) => item.id)).size !== items.length;

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

  if (hasDuplicateId(sources) || hasDuplicateId(settlements)) {
    addCode(context, "DUPLICATE_FUNDING_ID");
  }

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const debtsById = new Map(debts.map((debt) => [debt.id, debt]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const sourceParts = new Map(sources.map((source) => [source.id, 0]));
  const debtPaid = new Map(debts.map((debt) => [debt.id, 0]));

  for (const settlement of settlements) {
    if (!debtsById.has(settlement.debtId) || (settlement.parts ?? []).some((part) => !sourcesById.has(part.sourceId))) {
      addCode(context, "UNKNOWN_FUNDING_REFERENCE");
    }

    const parts = settlement.parts ?? [];
    if (parts.length > 0 && (settlement.amount?.value === undefined || settlement.amount.value === null || parts.reduce((sum, part) => sum + part.amountWon, 0) !== settlement.amount.value)) {
      addCode(context, "SETTLEMENT_PARTS_MISMATCH");
    }

    if (settlement.amount?.value !== undefined && settlement.amount.value !== null && debtsById.has(settlement.debtId)) {
      debtPaid.set(settlement.debtId, (debtPaid.get(settlement.debtId) ?? 0) + settlement.amount.value);
    }

    for (const part of parts) {
      if (sourcesById.has(part.sourceId)) {
        sourceParts.set(part.sourceId, (sourceParts.get(part.sourceId) ?? 0) + part.amountWon);
      }
    }
  }

  for (const [debtId, paid] of debtPaid) {
    const balance = debtsById.get(debtId)?.balance?.value;
    if (balance !== undefined && balance !== null && paid > balance) {
      addCode(context, "SETTLEMENT_EXCEEDS_DEBT");
    }
  }

  for (const source of sources) {
    if (source.certainty === "available" && (source.availableOn === undefined || source.availableOn === null || source.availableOn > asOf)) {
      addCode(context, "AVAILABLE_SOURCE_REQUIRES_PAST_OR_CURRENT_DATE");
    }

    const allocation = source.housingAllocationWon + source.goalAllocationWon + source.reserveAllocationWon;
    const grossAmount = source.grossAmount?.value;
    if (grossAmount !== undefined && grossAmount !== null && allocation > Math.max(0, grossAmount - (sourceParts.get(source.id) ?? 0))) {
      addCode(context, "ALLOCATION_EXCEEDS_NET_SOURCE");
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
