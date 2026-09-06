import { describe, expect, it } from "vitest";

import { DeepResultParseError, parseDeepResult } from "./result";

const block = (overrides: Record<string, unknown> = {}) => ({
  status: "available",
  missingFields: [],
  assumptions: [],
  data: { amountWon: 120000 },
  reason: null,
  ...overrides,
});

const serverLimitations = {
  explanation: "templates_only",
  policyMatching: "unavailable",
  agreementBasis: "submitted_intentions_not_current_agreement",
  notice: "입력한 수치에 따른 참고 계산이며 자산·대출 승인 여부를 검증하지 않습니다. 차이 자체를 관계 평가나 합의로 판정하지 않습니다.",
};

const ready = (overrides: Record<string, unknown> = {}) => ({
  status: "ready",
  report: {
    versions: { report: "deep-v3" },
    cashflow: block(),
    housing: block({ status: "unavailable", data: null, reason: "sharing_not_authorized" }),
    goal: block({ status: "partial", missingFields: ["target"] }),
    planning: block(),
    values: block(),
    issues: [
      { code: "HOUSING_UNCERTAIN", observation: "확인이 필요해요.", question: "주거비를 확인할까요?" },
      { code: "SERVER_ADDED_CODE", question: "화면이 아는 코드가 아니에요." },
    ],
    topics: [{ code: "HOUSING_UNCERTAIN" }],
    limitations: serverLimitations,
  },
  agreements: [],
  operatingStatus: { report: "published" },
  ...overrides,
});

describe("parseDeepResult", () => {
  it("parses the waiting discriminant without inferring a partner state", () => {
    expect(parseDeepResult({ status: "waiting", partnerCompleted: true })).toEqual({
      status: "waiting",
      partnerCompleted: true,
    });
  });

  it("parses all report blocks and preserves opaque issue records", () => {
    const result = parseDeepResult(ready());

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.report.housing.reason).toBe("sharing_not_authorized");
    expect(result.report.goal.missingFields).toEqual(["target"]);
    expect(result.report.issues).toHaveLength(2);
    expect(result.operatingStatus).toEqual({ report: "published" });
  });

  it("rejects a malformed discriminated result", () => {
    expect(() => parseDeepResult({ status: "ready", report: {} })).toThrow(DeepResultParseError);
    expect(() => parseDeepResult({ status: "waiting", partnerCompleted: "yes" })).toThrow(DeepResultParseError);
  });
});
