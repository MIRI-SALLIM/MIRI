import { z } from "zod";

import type { components } from "@/shared/api";

import { amountSchema, deepInputV3Schema } from "./schema";

type SchemaDeepInputV3 = z.infer<typeof deepInputV3Schema>;
type ApiDeepInputV3 = components["schemas"]["DeepInputV3-Input"];

declare const fromSchema: SchemaDeepInputV3;
declare const fromApi: ApiDeepInputV3;

const apiAcceptsSchema: ApiDeepInputV3 = fromSchema;

// assets/debts는 v3 미러가 각각 배분/처분 필드를 의미적으로 좁히므로 제외한다.
// 나머지 top-level 값 집합은 API가 넓어지면 이 역방향 할당이 깨져 GET→PATCH 드리프트를 잡는다.
const schemaAcceptsApiExceptNarrowed: Omit<SchemaDeepInputV3, "assets" | "debts"> = fromApi;

// v3는 disposition을 "keep"으로, 자산 배분을 0으로 의도적으로 좁힌다. 값 수준의 좁힘이라
// 부분집합 관계만 성립하고 상호 할당은 성립하지 않는다.
const schemaIsApiSubset: SchemaDeepInputV3 extends ApiDeepInputV3 ? true : false = true;

// 부분집합 확인만으로는 백엔드가 기본값 있는 선택 필드를 추가할 때 통과해 버린다.
// 그런데 `PATCH me/input`은 전체 치환이라, GET한 초안에 새 필드가 실려 오면 strict 미러가
// 그 키를 거부해 **저장이 막힌다.** 그래서 키 집합은 양방향으로 같아야 한다.
type MissingFromSchema = Exclude<keyof ApiDeepInputV3, keyof SchemaDeepInputV3>;
type ExtraInSchema = Exclude<keyof SchemaDeepInputV3, keyof ApiDeepInputV3>;

const noMissingKeys: MissingFromSchema extends never ? true : false = true;
const noExtraKeys: ExtraInSchema extends never ? true : false = true;

// 되돌려 보내는 왕복에서 실제로 문제가 되는 중첩 객체도 같은 이유로 고정한다.
type ApiFunding = NonNullable<ApiDeepInputV3["funding"]>;
type SchemaFunding = NonNullable<SchemaDeepInputV3["funding"]>;
const noMissingFundingKeys: Exclude<keyof ApiFunding, keyof SchemaFunding> extends never ? true : false = true;
const noExtraFundingKeys: Exclude<keyof SchemaFunding, keyof ApiFunding> extends never ? true : false = true;

type ApiContribution = NonNullable<ApiDeepInputV3["contribution"]>;
type SchemaContribution = NonNullable<SchemaDeepInputV3["contribution"]>;
const noMissingContributionKeys: Exclude<keyof ApiContribution, keyof SchemaContribution> extends never
  ? true
  : false = true;
const noExtraContributionKeys: Exclude<keyof SchemaContribution, keyof ApiContribution> extends never
  ? true
  : false = true;

type ApiIncome = NonNullable<ApiDeepInputV3["income"]>;
type SchemaIncome = NonNullable<SchemaDeepInputV3["income"]>;
const noMissingIncomeKeys: Exclude<keyof ApiIncome, keyof SchemaIncome> extends never ? true : false = true;
const noExtraIncomeKeys: Exclude<keyof SchemaIncome, keyof ApiIncome> extends never ? true : false = true;

// 키 이름 비교만으로는 배열 원소의 optional 필드 삭제를 잡지 못한다. 왕복에서 실제로
// 보존해야 하는 정산 모양과 공용 Amount의 핵심 필드를 직접 대입해 고정한다.
type SchemaSettlement = NonNullable<NonNullable<SchemaDeepInputV3["funding"]>["settlements"]>[number];
type ApiSettlement = NonNullable<NonNullable<ApiFunding["settlements"]>>[number];
const noMissingSettlementKeys: Exclude<keyof ApiSettlement, keyof SchemaSettlement> extends never ? true : false = true;
const noExtraSettlementKeys: Exclude<keyof SchemaSettlement, keyof ApiSettlement> extends never ? true : false = true;
const settlementWithOptionalFields: SchemaSettlement = {
  id: "settlement-a",
  debtId: "debt-a",
  dueOn: null,
  amount: { value: 0, status: "known", precision: "exact" },
  parts: [{ sourceId: "source-a", amountWon: 0 }],
};
type ApiAmount = components["schemas"]["Amount"];
type SchemaAmount = z.output<typeof amountSchema>;
const noMissingAmountKeys: Exclude<keyof ApiAmount, keyof SchemaAmount> extends never ? true : false = true;
const noExtraAmountKeys: Exclude<keyof SchemaAmount, keyof ApiAmount> extends never ? true : false = true;
const amountWithRequiredFields: SchemaAmount = {
  value: 0,
  status: "known",
  precision: "exact",
};

// 값이 좁혀지지 않은 배열 원소는 API와 미러를 양방향으로 할당해 값 집합까지 고정한다.
type ApiFundingSource = components["schemas"]["FundingSource"];
type SchemaFundingSource = NonNullable<NonNullable<SchemaFunding["sources"]>>[number];
declare const fromApiFundingSource: ApiFundingSource;
declare const fromSchemaFundingSource: SchemaFundingSource;
const apiAcceptsFundingSource: ApiFundingSource = fromSchemaFundingSource;
const schemaAcceptsFundingSource: SchemaFundingSource = fromApiFundingSource;
const noMissingFundingSourceKeys: Exclude<keyof ApiFundingSource, keyof SchemaFundingSource> extends never
  ? true
  : false = true;
const noExtraFundingSourceKeys: Exclude<keyof SchemaFundingSource, keyof ApiFundingSource> extends never
  ? true
  : false = true;

type ApiPlanConstraint = components["schemas"]["PlanConstraint"];
type SchemaPlanConstraint = NonNullable<NonNullable<SchemaDeepInputV3["constraints"]>>[number];
declare const fromApiPlanConstraint: ApiPlanConstraint;
declare const fromSchemaPlanConstraint: SchemaPlanConstraint;
const apiAcceptsPlanConstraint: ApiPlanConstraint = fromSchemaPlanConstraint;
const schemaAcceptsPlanConstraint: SchemaPlanConstraint = fromApiPlanConstraint;
const noMissingPlanConstraintKeys: Exclude<keyof ApiPlanConstraint, keyof SchemaPlanConstraint> extends never
  ? true
  : false = true;
const noExtraPlanConstraintKeys: Exclude<keyof SchemaPlanConstraint, keyof ApiPlanConstraint> extends never
  ? true
  : false = true;

// 자산 배분은 v3에서 funding으로 옮겼으므로 0으로, 부채 처분은 keep으로 좁힌다.
// 좁힌 키만 제외한 API→미러와 전체 Schema→API를 함께 두어 나머지 값 드리프트는 잡는다.
type ApiAsset = components["schemas"]["AssetInput"];
type SchemaAsset = NonNullable<NonNullable<SchemaDeepInputV3["assets"]>>[number];
declare const fromApiAsset: ApiAsset;
declare const fromSchemaAsset: SchemaAsset;
const apiAcceptsAsset: ApiAsset = fromSchemaAsset;
const schemaAcceptsAssetExceptNarrowed: Omit<SchemaAsset, "housingAllocationWon" | "goalAllocationWon"> = fromApiAsset;
const noMissingAssetKeys: Exclude<keyof ApiAsset, keyof SchemaAsset> extends never ? true : false = true;
const noExtraAssetKeys: Exclude<keyof SchemaAsset, keyof ApiAsset> extends never ? true : false = true;

type ApiDebt = components["schemas"]["DebtInput-Input"];
type SchemaDebt = NonNullable<NonNullable<SchemaDeepInputV3["debts"]>>[number];
declare const fromApiDebt: ApiDebt;
declare const fromSchemaDebt: SchemaDebt;
const apiAcceptsDebt: ApiDebt = fromSchemaDebt;
const schemaAcceptsDebtExceptNarrowed: Omit<SchemaDebt, "disposition"> = fromApiDebt;
const noMissingDebtKeys: Exclude<keyof ApiDebt, keyof SchemaDebt> extends never ? true : false = true;
const noExtraDebtKeys: Exclude<keyof SchemaDebt, keyof ApiDebt> extends never ? true : false = true;

void apiAcceptsSchema;
void schemaAcceptsApiExceptNarrowed;
void schemaIsApiSubset;
void noMissingKeys;
void noExtraKeys;
void noMissingFundingKeys;
void noExtraFundingKeys;
void noMissingContributionKeys;
void noExtraContributionKeys;
void noMissingIncomeKeys;
void noExtraIncomeKeys;
void noMissingSettlementKeys;
void noExtraSettlementKeys;
void noMissingAmountKeys;
void noExtraAmountKeys;
void settlementWithOptionalFields;
void amountWithRequiredFields;
void apiAcceptsFundingSource;
void schemaAcceptsFundingSource;
void noMissingFundingSourceKeys;
void noExtraFundingSourceKeys;
void apiAcceptsPlanConstraint;
void schemaAcceptsPlanConstraint;
void noMissingPlanConstraintKeys;
void noExtraPlanConstraintKeys;
void apiAcceptsAsset;
void schemaAcceptsAssetExceptNarrowed;
void noMissingAssetKeys;
void noExtraAssetKeys;
void apiAcceptsDebt;
void schemaAcceptsDebtExceptNarrowed;
void noMissingDebtKeys;
void noExtraDebtKeys;
