import type { LightResult } from "@/entities/light-result";
import type { ShareCardModel, ShareCardRatio } from "@/entities/share-card";

export function toShareCardModel(
  result: LightResult,
  ratio: ShareCardRatio,
): ShareCardModel {
  return {
    leftType: result.myType.typeName,
    rightType: result.partnerType.typeName,
    tagline: result.tagline,
    mutualHitCount: result.mutualHitCount,
    questionCount: result.questionCount,
    ratio,
  };
}
