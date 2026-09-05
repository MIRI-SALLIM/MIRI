import { apiClient, requestApi } from "@/shared/api";

export type DeepValueQuestion = {
  id: string;
  area: string;
  category: string;
  reverse: boolean;
  text: string;
  left: string;
  right: string;
};

export type DeepPlanningQuestion = {
  id: string;
  text: string;
  type: string;
  bindings: string[];
  options: string[];
  optional: boolean;
  requiresSharedBudget: boolean;
};

export type DeepFollowupQuestion = {
  id: string;
  text: string;
  bindings: string[];
};

export type DeepQuestionConsent = {
  version: "deep-sharing-v2";
  finance: string;
  values: string;
  privateNotes: string;
};

export type DeepQuestions = {
  version: "deep-v3";
  title: string;
  valueQuestions: DeepValueQuestion[];
  scaleLabels: string[];
  planningQuestions: DeepPlanningQuestion[];
  followups: DeepFollowupQuestion[];
  consent: DeepQuestionConsent;
};

export class DeepQuestionsParseError extends Error {
  constructor(field: string) {
    super(`딥 질문 응답의 ${field} 형식이 올바르지 않아요.`);
    this.name = "DeepQuestionsParseError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: Record<string, unknown>, field: string): string => {
  if (typeof value[field] !== "string") {
    throw new DeepQuestionsParseError(field);
  }

  return value[field];
};

const readBoolean = (value: Record<string, unknown>, field: string): boolean => {
  if (typeof value[field] !== "boolean") {
    throw new DeepQuestionsParseError(field);
  }

  return value[field];
};

const readStringArray = (value: Record<string, unknown>, field: string): string[] => {
  if (!Array.isArray(value[field]) || !value[field].every((item) => typeof item === "string")) {
    throw new DeepQuestionsParseError(field);
  }

  return value[field];
};

const readArray = (value: Record<string, unknown>, field: string): unknown[] => {
  if (!Array.isArray(value[field])) {
    throw new DeepQuestionsParseError(field);
  }

  return value[field];
};

const parseValueQuestion = (value: unknown, index: number): DeepValueQuestion => {
  if (!isRecord(value)) {
    throw new DeepQuestionsParseError(`valueQuestions[${index}]`);
  }

  return {
    id: readString(value, "id"),
    area: readString(value, "area"),
    category: readString(value, "category"),
    reverse: readBoolean(value, "reverse"),
    text: readString(value, "text"),
    left: readString(value, "left"),
    right: readString(value, "right"),
  };
};

const parsePlanningQuestion = (value: unknown, index: number): DeepPlanningQuestion => {
  if (!isRecord(value)) {
    throw new DeepQuestionsParseError(`planningQuestions[${index}]`);
  }

  return {
    id: readString(value, "id"),
    text: readString(value, "text"),
    type: readString(value, "type"),
    bindings: readStringArray(value, "bindings"),
    options: readStringArray(value, "options"),
    optional: readBoolean(value, "optional"),
    requiresSharedBudget: readBoolean(value, "requiresSharedBudget"),
  };
};

const parseFollowupQuestion = (value: unknown, index: number): DeepFollowupQuestion => {
  if (!isRecord(value)) {
    throw new DeepQuestionsParseError(`followups[${index}]`);
  }

  return {
    id: readString(value, "id"),
    text: readString(value, "text"),
    bindings: readStringArray(value, "bindings"),
  };
};

const parseConsent = (value: unknown): DeepQuestionConsent => {
  if (!isRecord(value)) {
    throw new DeepQuestionsParseError("consent");
  }

  if (value.version !== "deep-sharing-v2") {
    throw new DeepQuestionsParseError("consent.version");
  }

  return {
    version: "deep-sharing-v2",
    finance: readString(value, "finance"),
    values: readString(value, "values"),
    privateNotes: readString(value, "privateNotes"),
  };
};

export const parseDeepQuestions = (value: unknown): DeepQuestions => {
  if (!isRecord(value)) {
    throw new DeepQuestionsParseError("root");
  }

  if (value.version !== "deep-v3") {
    throw new DeepQuestionsParseError("version");
  }

  return {
    version: "deep-v3",
    title: readString(value, "title"),
    valueQuestions: readArray(value, "valueQuestions").map(parseValueQuestion),
    scaleLabels: readStringArray(value, "scaleLabels"),
    planningQuestions: readArray(value, "planningQuestions").map(parsePlanningQuestion),
    followups: readArray(value, "followups").map(parseFollowupQuestion),
    consent: parseConsent(value.consent),
  };
};

export const deepQuestionsQueryKey = (sessionId: string) => ["deep-questions", sessionId] as const;

export const getDeepQuestions = async (sessionId: string): Promise<DeepQuestions> => {
  const response = await requestApi(
    apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/me/questions", {
      params: { path: { session_id: sessionId } },
    }),
  );

  return parseDeepQuestions(response);
};
