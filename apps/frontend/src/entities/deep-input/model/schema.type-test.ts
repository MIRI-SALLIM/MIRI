import { z } from "zod";

import type { components } from "@/shared/api";

import { deepInputV3Schema } from "./schema";

type SchemaDeepInputV3 = z.infer<typeof deepInputV3Schema>;
type ApiDeepInputV3 = components["schemas"]["DeepInputV3-Input"];

declare const fromSchema: SchemaDeepInputV3;

const apiAcceptsSchema: ApiDeepInputV3 = fromSchema;

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

type ApiContribution = NonNullable<ApiDeepInputV3["contribution"]>;
type SchemaContribution = NonNullable<SchemaDeepInputV3["contribution"]>;
const noMissingContributionKeys: Exclude<keyof ApiContribution, keyof SchemaContribution> extends never
  ? true
  : false = true;

type ApiIncome = NonNullable<ApiDeepInputV3["income"]>;
type SchemaIncome = NonNullable<SchemaDeepInputV3["income"]>;
const noMissingIncomeKeys: Exclude<keyof ApiIncome, keyof SchemaIncome> extends never ? true : false = true;

void apiAcceptsSchema;
void schemaIsApiSubset;
void noMissingKeys;
void noExtraKeys;
void noMissingFundingKeys;
void noMissingContributionKeys;
void noMissingIncomeKeys;
