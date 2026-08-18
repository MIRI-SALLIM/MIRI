export type ShareCardRatio = "portrait" | "square";

export interface ShareCardModel {
  leftType: string;
  rightType: string;
  tagline: string;
  mutualHitCount: number;
  questionCount: number;
  ratio: ShareCardRatio;
}

export const SHARE_CARD_OUTPUT_SIZE = {
  portrait: { height: 1920, width: 1080 },
  square: { height: 1080, width: 1080 },
} as const;

export const SHARE_CARD_RENDER_SIZE = {
  portrait: { height: 960, width: 540 },
  square: { height: 540, width: 540 },
} as const;

export const SHARE_CARD_PIXEL_RATIO = 2;
