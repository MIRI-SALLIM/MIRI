import { z } from "zod";

import type { components } from "@/shared/api";
import { isCalendarDate, isServerDecimal } from "@/shared/lib";

const SAFE_MONEY = Number.MAX_SAFE_INTEGER;
const moneySchema = z.number().int().min(0).max(SAFE_MONEY);
const knowledgeSchema = z.enum(["known", "unknown", "withheld"]);
const fundingIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const monthSchema = z.string().regex(/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/);
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

const debtSchema = z
  .object({
    id: fundingIdSchema,
    type: z.string().min(1).max(50),
    balance: amountSchema.optional(),
    monthlyPayment: amountSchema.optional(),
    annualRate: annualRateSchema,
    remainingMonths: z.number().int().min(1).max(1200).nullable().optional(),
    repaymentType: z.enum(["equalPayment", "equalPrincipal", "bulletMaturity", "unknown"]).default("unknown"),
    disposition: z.enum(["keep", "settle"]).default("keep"),
  })
  .strict();

const goalSchema = z
  .object({
    title: z.string().min(1).max(50),
    amountWon: moneySchema.min(1),
    targetMonth: monthSchema,
  })
  .strict();

const deadlineSchema = z
  .object({
    id: fundingIdSchema,
    dueOn: calendarDateSchema.nullable().optional(),
    amount: amountSchema.optional(),
  })
  .strict();

const sharedPlanObjectSchema = z
  .object({
    planSchemaVersion: z.literal("deep-plan-v3"),
    fundingAsOf: calendarDateSchema,
    startMonth: monthSchema,
    housingType: z.enum(["keep", "rent", "jeonse", "buy"]).default("keep"),
    monthlyHousingCost: amountSchema.optional(),
    housingPriceWon: amountSchema.optional(),
    oneOffCostsWon: amountSchema.optional(),
    newHousingLoan: debtSchema.nullable().optional(),
    target: goalSchema.nullable().optional(),
    fundingDeadlines: deadlineSchema.array().max(120).optional(),
    commonExpensesStatus: knowledgeSchema.default("unknown"),
    commonExpenses: z.record(z.string(), amountSchema).optional(),
    newLoanAvailableOn: calendarDateSchema.nullable().optional(),
    newLoanCertainty: z.enum(["confirmed", "expected", "unknown"]).default("unknown"),
  })
  .strict();

const addCode = (context: z.RefinementCtx, code: string) =>
  context.addIssue({ code: "custom", message: code });

const hasDuplicateId = (items: Array<{ id: string }>) => new Set(items.map((item) => item.id)).size !== items.length;

const validateSharedPlan = (plan: z.output<typeof sharedPlanObjectSchema>, context: z.RefinementCtx) => {
  const commonExpenses = plan.commonExpenses ?? {};
  const deadlines = plan.fundingDeadlines ?? [];

  if (Object.keys(commonExpenses).length > 0 && plan.commonExpensesStatus !== "known") {
    addCode(context, "BUDGET_ITEMS_REQUIRE_KNOWN_SCOPE");
  }

  if (hasDuplicateId(deadlines)) {
    addCode(context, "DUPLICATE_FUNDING_DEADLINE");
  }

  const housing = plan.housingType === "keep" ? 0 : plan.housingPriceWon?.value;
  const oneOffCosts = plan.oneOffCostsWon?.value;
  if (deadlines.length > 0 && housing !== undefined && housing !== null && oneOffCosts !== undefined && oneOffCosts !== null) {
    const deadlineValues = deadlines.map((deadline) => deadline.amount?.value);
    if (deadlineValues.every((value) => value !== undefined && value !== null)) {
      const total = deadlineValues.reduce((sum, value) => sum + (value ?? 0), 0);
      if (total !== housing + oneOffCosts) {
        addCode(context, "DEADLINE_TOTAL_MISMATCH");
      }
    }
  }

  if (plan.newHousingLoan && (plan.housingType === "keep" || plan.newHousingLoan.disposition !== "keep")) {
    addCode(context, "INVALID_NEW_HOUSING_LOAN");
  }
};

export type SharedPlanV3 = components["schemas"]["SharedPlanV3-Input"];

export const sharedPlanV3Schema = sharedPlanObjectSchema.superRefine(validateSharedPlan);
export const deepPlanV3Schema = sharedPlanV3Schema;

export const parseSharedPlanV3 = (input: unknown): SharedPlanV3 => sharedPlanV3Schema.parse(input);
export const safeParseSharedPlanV3 = (input: unknown) => sharedPlanV3Schema.safeParse(input);

export { amountSchema };
