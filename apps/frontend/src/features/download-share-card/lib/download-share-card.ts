import { toPng } from "html-to-image";

import {
  SHARE_CARD_PIXEL_RATIO,
  SHARE_CARD_RENDER_SIZE,
} from "@/entities/share-card";
import type { ShareCardModel } from "@/entities/share-card";

export async function downloadShareCard(
  node: HTMLDivElement,
  model: ShareCardModel,
): Promise<void> {
  const fontSet = "fonts" in document ? document.fonts : undefined;

  if (fontSet?.ready) {
    await fontSet.ready;
  }

  const { width: canvasWidth, height: canvasHeight } = SHARE_CARD_RENDER_SIZE[model.ratio];
  const dataUrl = await toPng(node, {
    cacheBust: true,
    canvasHeight,
    canvasWidth,
    pixelRatio: SHARE_CARD_PIXEL_RATIO,
  });

  const anchor = document.createElement("a");
  anchor.download = `mirisallim-light-result-${model.ratio}.png`;
  anchor.href = dataUrl;

  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}
