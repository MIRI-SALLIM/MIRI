import { Link } from "react-router-dom";

import type { LightResult, LightResultType } from "@/entities/light-result";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Progress } from "@/shared/ui/progress";

export interface ResultSummaryProps {
  result: LightResult;
  shareHref: string;
}

function TypeCard({ label, tone, type }: { label: string; tone: "green" | "purple"; type: LightResultType }) {
  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-ink-muted">{label}</p>
        <Badge tone={tone}>{tone === "green" ? "Green" : "Purple"}</Badge>
      </div>
      <h3 className="text-lg font-extrabold tracking-[-0.02em] text-ink">{type.typeName}</h3>
      <p className="text-sm leading-relaxed text-ink-muted">{type.typeDescription}</p>
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <p className="text-xs font-bold text-ink-muted">{type.timeLabel}</p>
        <p className="text-xs font-bold text-ink-muted">{type.mgmtLabel}</p>
      </div>
    </article>
  );
}

export function ResultSummary({ result, shareHref }: ResultSummaryProps) {
  return (
    <section aria-labelledby="result-summary-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Badge className="self-start" tone="green">
          3분 모드 · 함께 공개
        </Badge>
        <h1
          className="text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl"
          id="result-summary-heading"
        >
          라이트 결과
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-ink-muted">{result.tagline}</p>
      </div>

      <div className="flex flex-col gap-5 rounded-card border border-green/30 bg-green-tint/50 p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-green-strong">서로 맞힌 답</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-[-0.03em] text-ink">
              {result.mutualHitCount} / {result.questionCount}
            </p>
          </div>
          <p className="max-w-xs text-right text-sm leading-relaxed text-ink-muted">
            누가 더 잘했는지가 아니라, 서로를 얼마나 이해했는지 보여주는 점수예요.
          </p>
        </div>
        <Progress label="서로 맞힌 답" max={result.questionCount} value={result.mutualHitCount} />
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">두 사람의 유형</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            서로 다른 색을 가진 두 유형을 함께 살펴보세요.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TypeCard label="나의 유형" tone="green" type={result.myType} />
          <TypeCard label="파트너 유형" tone="purple" type={result.partnerType} />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-control border border-green-strong bg-green-strong px-5 py-3 text-base font-bold text-white transition-colors hover:bg-[#1F6F4E] focus-visible:shadow-focus"
          to={shareHref}
        >
          결과 공유
        </Link>
        <Button className="flex-1" disabled variant="secondary">
          15분 모드 준비 중
        </Button>
      </div>
    </section>
  );
}
