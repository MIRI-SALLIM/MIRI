import { z } from "zod";

import type { components } from "@/shared/api";

import { deepInputV3Schema } from "./schema";

type SchemaDeepInputV3 = z.infer<typeof deepInputV3Schema>;
type ApiDeepInputV3 = components["schemas"]["DeepInputV3-Input"];

declare const fromSchema: SchemaDeepInputV3;

const apiAcceptsSchema: ApiDeepInputV3 = fromSchema;
// OpenAPI preserves the base DebtInput union, while v3 intentionally narrows
// disposition to "keep" and asset allocations to zero in the request mirror.
const schemaIsApiSubset: SchemaDeepInputV3 extends ApiDeepInputV3 ? true : false = true;

void apiAcceptsSchema;
void schemaIsApiSubset;
