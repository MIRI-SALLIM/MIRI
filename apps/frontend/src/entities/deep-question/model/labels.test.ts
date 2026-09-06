import { describe, expect, it } from "vitest";

import {
  deepAreaLabels,
  deepConstraintAllowBorrowingLabels,
  deepConstraintKindLabels,
  deepConstraintScopeLabels,
  deepConstraintStrengthLabels,
  deepDiscussionStateLabels,
} from "./labels";

describe("deep question labels", () => {
  it("keeps every server enum rendered with one Korean label map", () => {
    expect(deepAreaLabels).toEqual({
      savings: "저축",
      spending: "소비",
      investment: "투자",
      debt: "부채",
      jointManagement: "공동관리",
    });
    expect(deepDiscussionStateLabels).toEqual({
      notDiscussed: "이야기하지 않음",
      discussing: "이야기 중",
      believeAgreed: "합의했다고 생각함",
      unknown: "모름",
    });
    expect(deepConstraintKindLabels).toEqual({
      housingCost: "주거비",
      debtPayment: "부채 상환",
      borrowing: "차입",
      personalSpending: "개인 지출",
      other: "기타",
    });
    expect(deepConstraintScopeLabels).toEqual({ household: "두 사람 공동", self: "본인" });
    expect(deepConstraintStrengthLabels).toEqual({ required: "반드시 지켜야 함", preferred: "가능하면 지키고 싶음" });
    expect(deepConstraintAllowBorrowingLabels).toEqual({ true: "허용", false: "허용하지 않음", null: "미입력" });
  });
});
