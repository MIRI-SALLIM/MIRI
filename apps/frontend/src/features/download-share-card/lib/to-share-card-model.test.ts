import { describe, expect, it } from "vitest";

import type { LightResult } from "@/entities/light-result";
import { toShareCardModel } from "@/features/download-share-card";

const typeResult = {
  mgmt: "joint",
  mgmtDescription: "함께 공유하고 관리하는 방식을 선호합니다.",
  mgmtLabel: "공동관리형",
  recommendation: "공통 목표를 정해보세요.",
  time: "saver",
  timeDescription: "미래의 안정과 목표를 중시합니다.",
  timeLabel: "미래대비형",
  typeCode: "saver_joint",
  typeDescription: "함께 목표를 세우는 유형입니다.",
  typeName: "함께 모으는 동반자형",
};

const readyResult = {
  status: "ready" as const,
  partnerCompleted: true as const,
  result: {
    discussionTopics: ["공동 생활비의 기준을 정해보세요."],
    mutualHitCount: 4,
    myType: typeResult,
    partnerType: { ...typeResult, typeName: "각자 계획하는 동반자형" },
    questionCount: 7,
    questions: [
      {
        isHit: true,
        isMatch: false,
        myAnswer: 2 as const,
        myAnswerLabel: "저축에 조금 더 비중",
        myGuess: 3 as const,
        partnerAnswer: 3 as const,
        partnerAnswerLabel: "상대방의 답변",
        questionId: "spending_style" as const,
        questionText: "현재의 소비와 미래의 저축 중 어느 쪽에 더 가치를 두시나요?",
      },
    ],
    tagline: "서로의 생각을 이해하고 맞춰가는 첫걸음",
  } satisfies LightResult,
};

describe("toShareCardModel", () => {
  it("creates a privacy-safe model with only shareable result fields", () => {
    const model = toShareCardModel(readyResult.result, "square");

    expect(Object.keys(model).sort()).toEqual([
      "leftType",
      "mutualHitCount",
      "questionCount",
      "ratio",
      "rightType",
      "tagline",
    ]);
    expect(JSON.stringify(model)).not.toMatch(
      /amount|income|debt|saving|금액|소득|부채|저축액|answers|guesses/i,
    );
    expect(model).toEqual({
      leftType: readyResult.result.myType.typeName,
      mutualHitCount: 4,
      questionCount: 7,
      ratio: "square",
      rightType: readyResult.result.partnerType.typeName,
      tagline: readyResult.result.tagline,
    });
  });
});
