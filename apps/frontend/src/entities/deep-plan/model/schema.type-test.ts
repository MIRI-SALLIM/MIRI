import { z } from "zod";

import type { components } from "@/shared/api";

import { sharedPlanV3Schema } from "./schema";

type SchemaSharedPlanV3 = z.infer<typeof sharedPlanV3Schema>;
type ApiSharedPlanV3 = components["schemas"]["SharedPlanV3-Input"];

declare const fromSchema: SchemaSharedPlanV3;
declare const fromApi: ApiSharedPlanV3;

const apiAcceptsSchema: ApiSharedPlanV3 = fromSchema;
const schemaAcceptsApi: SchemaSharedPlanV3 = fromApi;

void apiAcceptsSchema;
void schemaAcceptsApi;
