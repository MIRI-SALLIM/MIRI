import type { components } from "@/shared/api";

export type LightQuestion = components["schemas"]["QuestionItem"];
export type LightQuestionOption = components["schemas"]["QuestionOption"];
export type LightQuestionSet = components["schemas"]["QuestionSet"];

export const LIGHT_QUESTION_VERSION = "light-v1";
