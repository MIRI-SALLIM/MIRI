import { z } from "zod";

import type { components } from "@/shared/api";

import { sharedPlanV3Schema } from "./schema";

type SchemaSharedPlanV3 = z.infer<typeof sharedPlanV3Schema>;
type ApiSharedPlanV3 = components["schemas"]["SharedPlanV3-Input"];

declare const fromSchema: SchemaSharedPlanV3;
declare const fromApi: ApiSharedPlanV3;

const apiAcceptsSchema: ApiSharedPlanV3 = fromSchema;
const schemaAcceptsApi: SchemaSharedPlanV3 = fromApi;

// 상호 할당만으로는 백엔드가 선택 필드를 추가할 때 통과한다(TS의 초과 속성 검사는
// 객체 리터럴에만 적용된다). `PATCH /plan`도 전체 치환이라 GET한 계획을 되돌려 보낼 때
// strict 미러가 새 키를 거부해 저장이 막히므로, 키 집합을 양방향으로 고정한다.
type MissingFromSchema = Exclude<keyof ApiSharedPlanV3, keyof SchemaSharedPlanV3>;
type ExtraInSchema = Exclude<keyof SchemaSharedPlanV3, keyof ApiSharedPlanV3>;

const noMissingKeys: MissingFromSchema extends never ? true : false = true;
const noExtraKeys: ExtraInSchema extends never ? true : false = true;

void apiAcceptsSchema;
void schemaAcceptsApi;
void noMissingKeys;
void noExtraKeys;
