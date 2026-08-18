import type { components } from "@/shared/api";

export type SessionResponse = components["schemas"]["SessionResponse"];
export type SessionParticipant = components["schemas"]["SessionParticipant"];
export type SessionStatusResponse = components["schemas"]["SessionStatusResponse"];
export type ResultWaitingResponse = components["schemas"]["ResultWaitingResponse"];
export type ResultReadyResponse = components["schemas"]["ResultReadyResponse"];
export type SessionResultResponse = ResultWaitingResponse | ResultReadyResponse;
export type LightComparisonResultData = components["schemas"]["LightComparisonResultData"];
export type QuestionItem = components["schemas"]["QuestionItem"];
export type QuestionSet = components["schemas"]["QuestionSet"];
export type QuestionComparisonItem = components["schemas"]["QuestionComparisonItem"];
export type TypeClassificationResult = components["schemas"]["TypeClassificationResult"];
export type InvitationResponse = components["schemas"]["InvitationResponse"];
export type UserInputData = components["schemas"]["UserInputData"];
