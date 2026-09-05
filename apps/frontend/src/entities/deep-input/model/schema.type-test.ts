import { z } from "zod";

import type { components } from "@/shared/api";

import { deepInputV3Schema } from "./schema";

type SchemaDeepInputV3 = z.infer<typeof deepInputV3Schema>;
type ApiDeepInputV3 = components["schemas"]["DeepInputV3-Input"];

declare const fromSchema: SchemaDeepInputV3;
declare const fromApi: ApiDeepInputV3;

const apiAcceptsSchema: ApiDeepInputV3 = fromSchema;
const schemaAcceptsApi: SchemaDeepInputV3 = fromApi;

void apiAcceptsSchema;
void schemaAcceptsApi;
