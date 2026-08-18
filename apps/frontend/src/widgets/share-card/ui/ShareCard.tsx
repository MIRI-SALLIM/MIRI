import { forwardRef } from "react";

import { SHARE_CARD_OUTPUT_SIZE } from "@/entities/share-card";
import type { ShareCardModel } from "@/entities/share-card";

export interface ShareCardProps {
  model: ShareCardModel;
}

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right);
}

function getAspectRatio(model: ShareCardModel): string {
  const { width, height } = SHARE_CARD_OUTPUT_SIZE[model.ratio];
  const divisor = greatestCommonDivisor(width, height);

  return `${width / divisor} / ${height / divisor}`;
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard({ model }, ref) {
  return (
    <div
      ref={ref}
      className="flex w-full flex-col justify-between gap-8 overflow-hidden rounded-card border border-border bg-canvas p-8 text-ink sm:p-10"
      data-ratio={model.ratio}
      data-testid="share-card"
      style={{ aspectRatio: getAspectRatio(model) }}
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm font-extrabold tracking-[0.18em] text-green-strong">미리살림</p>
        <p className="text-xs font-bold tracking-[0.12em] text-ink-subtle">3분 모드 · 함께 공개</p>
      </div>

      <div className="flex flex-col gap-5">
        <div className="rounded-control border border-green/30 bg-green-tint p-5">
          <p className="text-xs font-bold text-green-strong">나의 유형</p>
          <h2 className="mt-2 text-xl font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-2xl">
            {model.leftType}
          </h2>
        </div>

        <div className="rounded-control border border-purple/30 bg-purple-tint p-5">
          <p className="text-xs font-bold text-purple-strong">파트너 유형</p>
          <h2 className="mt-2 text-xl font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-2xl">
            {model.rightType}
          </h2>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold text-green-strong">서로 맞힌 답</p>
        <p className="text-4xl font-extrabold tabular-nums tracking-[-0.04em] text-ink sm:text-5xl">
          {model.mutualHitCount} / {model.questionCount}
        </p>
        <p className="text-base font-semibold leading-relaxed text-ink-muted">{model.tagline}</p>
        <p className="border-t border-border pt-4 text-sm font-bold leading-relaxed text-ink-subtle">
          돈 이야기를, 조금 더 편안하게
        </p>
      </div>
    </div>
  );
});
