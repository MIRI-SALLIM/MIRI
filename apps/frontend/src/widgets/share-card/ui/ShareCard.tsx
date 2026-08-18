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
  const isSquare = model.ratio === "square";

  return (
    <div
      ref={ref}
      className={`flex w-full flex-col justify-between overflow-hidden rounded-card border border-border bg-canvas text-ink ${
        isSquare ? "gap-2 p-4" : "gap-8 p-8 sm:p-10"
      }`}
      data-layout={isSquare ? "compact" : "default"}
      data-ratio={model.ratio}
      data-testid="share-card"
      style={{ aspectRatio: getAspectRatio(model) }}
    >
      <div className={`flex flex-col ${isSquare ? "gap-1" : "gap-2"}`}>
        <p className="text-sm font-extrabold tracking-[0.18em] text-green-strong">미리살림</p>
        <p className="text-xs font-bold tracking-[0.12em] text-ink-muted">3분 모드 · 함께 공개</p>
      </div>

      <div className={`flex flex-col ${isSquare ? "gap-2" : "gap-5"}`}>
        <div className={`rounded-control border border-green/30 bg-green-tint ${isSquare ? "p-3" : "p-5"}`}>
          <p className="text-xs font-bold text-green-strong">나의 유형</p>
          <h2
            className={`${
              isSquare ? "mt-1 text-lg" : "mt-2 text-xl sm:text-2xl"
            } font-extrabold leading-tight tracking-[-0.02em] text-ink`}
          >
            {model.leftType}
          </h2>
        </div>

        <div className={`rounded-control border border-purple/30 bg-purple-tint ${isSquare ? "p-3" : "p-5"}`}>
          <p className="text-xs font-bold text-purple-strong">파트너 유형</p>
          <h2
            className={`${
              isSquare ? "mt-1 text-lg" : "mt-2 text-xl sm:text-2xl"
            } font-extrabold leading-tight tracking-[-0.02em] text-ink`}
          >
            {model.rightType}
          </h2>
        </div>
      </div>

      <div className={`flex flex-col ${isSquare ? "gap-2" : "gap-3"}`}>
        <p className="text-sm font-bold text-green-strong">서로 맞힌 답</p>
        <p
          className={`${
            isSquare ? "text-3xl" : "text-4xl sm:text-5xl"
          } font-extrabold tabular-nums tracking-[-0.04em] text-ink`}
        >
          {model.mutualHitCount} / {model.questionCount}
        </p>
        <p className={`${isSquare ? "text-sm" : "text-base"} font-semibold leading-relaxed text-ink-muted`}>
          {model.tagline}
        </p>
        <p
          className={`${
            isSquare ? "pt-2 text-xs" : "pt-4 text-sm"
          } border-t border-border font-bold leading-relaxed text-ink-muted`}
        >
          돈 이야기를, 조금 더 편안하게
        </p>
      </div>
    </div>
  );
});
