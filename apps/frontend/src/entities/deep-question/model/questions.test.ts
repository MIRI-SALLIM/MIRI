import { describe, expect, it } from "vitest";

import { DeepQuestionsParseError, parseDeepQuestions } from "./questions";

const validQuestions = {
  version: "deep-v3",
  title: "함께 살 돈의 기준",
  valueQuestions: [{ id: "D1", area: "savings", category: "savings", reverse: false, text: "질문", left: "왼쪽", right: "오른쪽" }],
  scaleLabels: ["1", "2", "3", "4", "5"],
  planningQuestions: [{ id: "C1", text: "얼마인가요?", type: "amount", bindings: ["contribution.ownMonthly"], options: ["known"], optional: true, requiresSharedBudget: true }],
  followups: [{ id: "P8", text: "공동비를 정해 주세요.", bindings: ["commonExpenses"] }],
  consent: { version: "deep-sharing-v2", finance: "재무", values: "가치관", privateNotes: "개인 메모" },
};

describe("deep question response parser", () => {
  it("parses the hand-written v3 question response shape", () => {
    expect(parseDeepQuestions(validQuestions)).toEqual(validQuestions);
  });

  it("fails explicitly when a required section is missing", () => {
    expect(() => parseDeepQuestions({ ...validQuestions, planningQuestions: undefined })).toThrow(DeepQuestionsParseError);
  });

  it("fails explicitly when a value question has the wrong field type", () => {
    expect(() => parseDeepQuestions({ ...validQuestions, valueQuestions: [{ ...validQuestions.valueQuestions[0], reverse: "false" }] })).toThrow(DeepQuestionsParseError);
  });
});
