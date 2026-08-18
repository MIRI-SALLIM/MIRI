import type { components } from "@/shared/api";

export type LightResult = components["schemas"]["LightComparisonResultData"];
export type LightResultResponse =
  | components["schemas"]["ResultWaitingResponse"]
  | components["schemas"]["ResultReadyResponse"];
export type LightResultQuestion = components["schemas"]["QuestionComparisonItem"];
export type LightResultType = components["schemas"]["TypeClassificationResult"];
