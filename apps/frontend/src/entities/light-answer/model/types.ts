import type { components } from "@/shared/api";

export type LightAnswerValue = components["schemas"]["SaveInputRequest"]["answers"][number];
export type LightInput = components["schemas"]["SaveInputRequest"];
export type LightInputResponse = components["schemas"]["UserInputData"];
