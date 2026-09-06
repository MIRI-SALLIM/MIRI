export {
  amountSchema,
  createDeepInputV3Schema,
  deepInputV3Schema,
  parseDeepInputV3,
  safeParseDeepInputV3,
} from "./model/schema";
export type { DeepInputV3, DeepInputV3ValidationOptions } from "./model/schema";
export {
  deepInputQueryKey,
  fetchDeepInput,
  saveDeepInput,
} from "./api/deep-input";
export type { DeepInputResponse } from "./api/deep-input";
