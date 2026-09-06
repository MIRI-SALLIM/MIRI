import { z } from "zod";

import type { components } from "@/shared/api";
import { isCalendarDate } from "@/shared/lib";

const SAFE_MONEY = Number.MAX_SAFE_INTEGER;

export const decisionTopicSchema = z.enum([
  "monthlyContribution",
  "housingFunding",
  "savings",
  "spending",
  "investment",
  "debt",
  "jointManagement",
  "other",
]);

export const agreementOwnerSchema = z.enum(["A", "B", "both"]);
export const commonCategorySchema = z.enum(["housing", "food", "transport", "subscriptions", "gifts", "other"]);

const monthSchema = z.string().regex(/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/);
const calendarDateSchema = z.string().refine(isCalendarDate, "유효하지 않은 날짜입니다.");
const moneySchema = z.number().int().min(0).max(SAFE_MONEY);

const monthlyContributionsSchema = z
  .object({
    A: moneySchema.optional(),
    B: moneySchema.optional(),
  })
  .strict();

const decisionTermsObjectSchema = z
  .object({
    topic: decisionTopicSchema,
    scope: z.string().min(1).max(300),
    owner: agreementOwnerSchema,
    startMonth: monthSchema,
    dueDay: z.number().int().min(1).max(31).nullable().optional(),
    monthlyContributions: monthlyContributionsSchema.optional(),
    commonScope: commonCategorySchema.array().max(6).optional(),
    exceptions: z.string().max(300).default(""),
  })
  .strict();

const addCode = (context: z.RefinementCtx, code: string) => {
  context.addIssue({ code: "custom", message: code });
};

const validateDecisionTerms = (
  terms: z.output<typeof decisionTermsObjectSchema>,
  context: z.RefinementCtx,
) => {
  const commonScope = terms.commonScope ?? [];
  const monthlyContributions = terms.monthlyContributions ?? {};

  if (new Set(commonScope).size !== commonScope.length) {
    addCode(context, "DUPLICATE_COMMON_SCOPE");
  }

  if (terms.topic !== "monthlyContribution" && commonScope.length > 0) {
    addCode(context, "COMMON_SCOPE_REQUIRES_MONTHLY_TOPIC");
  }

  const hasBothContributions = Object.hasOwn(monthlyContributions, "A")
    && monthlyContributions.A !== undefined
    && Object.hasOwn(monthlyContributions, "B")
    && monthlyContributions.B !== undefined;
  if (terms.topic === "monthlyContribution" && !hasBothContributions) {
    addCode(context, "BOTH_CONTRIBUTIONS_REQUIRED");
  }

  if (terms.topic !== "monthlyContribution" && Object.keys(monthlyContributions).length > 0) {
    addCode(context, "CONTRIBUTIONS_REQUIRE_MONTHLY_TOPIC");
  }

  const contributionTotal = Object.values(monthlyContributions).reduce<bigint>(
    (sum, value) => sum + BigInt(value ?? 0),
    0n,
  );
  if (contributionTotal > BigInt(SAFE_MONEY)) {
    addCode(context, "UNSAFE_CONTRIBUTION_TOTAL");
  }
};

export const decisionTermsSchema = decisionTermsObjectSchema.superRefine(validateDecisionTerms);

export const agreementContentSchema = z
  .object({
    text: z.string().min(1).max(1000),
    reviewOn: calendarDateSchema.nullable().optional(),
  })
  .strict();

export const agreementRequestSchema = agreementContentSchema.extend({
  expectedRound: z.number().int().min(1),
  terms: decisionTermsSchema,
}).strict();

export const editAgreementSchema = agreementContentSchema.extend({
  expectedVersion: z.number().int().min(1),
  terms: decisionTermsSchema,
}).strict();

export const agreementVersionRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
}).strict();

const agreementResponseSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().min(1),
    round: z.number().int().min(1),
    text: z.string().min(1).max(1000),
    reviewOn: calendarDateSchema.nullable(),
    status: z.enum(["proposed", "agreed", "deferred"]),
    myConfirmed: z.boolean(),
    partnerConfirmed: z.boolean(),
    terms: decisionTermsSchema,
    planVersion: z.number().int().min(1),
    sourceReportId: z.string().min(1),
  })
  .strict();

export type DecisionTerms = components["schemas"]["DecisionTerms"];
export type AgreementRequestV3 = components["schemas"]["AgreementRequestV3"];
export type EditAgreementV3 = components["schemas"]["EditAgreementV3"];
export type AgreementVersionRequest = components["schemas"]["VersionRequest"];
export type DeepAgreement = components["schemas"]["AgreementResponseV3"];

export const parseDecisionTerms = (input: unknown): DecisionTerms =>
  decisionTermsSchema.parse(input) as DecisionTerms;

export const safeParseDecisionTerms = (input: unknown) => decisionTermsSchema.safeParse(input);

export const parseAgreementRequest = (input: unknown): AgreementRequestV3 =>
  agreementRequestSchema.parse(input) as AgreementRequestV3;

export const parseEditAgreement = (input: unknown): EditAgreementV3 =>
  editAgreementSchema.parse(input) as EditAgreementV3;

export const parseAgreementVersionRequest = (input: unknown): AgreementVersionRequest =>
  agreementVersionRequestSchema.parse(input) as AgreementVersionRequest;

export const parseDeepAgreement = (input: unknown): DeepAgreement =>
  agreementResponseSchema.parse(input) as DeepAgreement;

export { agreementResponseSchema };
