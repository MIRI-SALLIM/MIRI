import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import { fetchLightResult, lightResultQueryKey } from "@/features/get-light-result";
import {
  DownloadShareCardButton,
  toShareCardModel,
} from "@/features/download-share-card";
import { ShareCard } from "@/widgets/share-card";

const pageClassName = "mx-auto flex max-w-3xl flex-col gap-8 px-5 py-14 sm:px-8 sm:py-20";

function ShareError() {
  return (
    <section className={pageClassName}>
      <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">결과 공유</h1>
      <div className="rounded-card border border-border bg-card p-6 sm:p-8">
        <p className="text-base font-bold text-ink">결과를 불러오지 못했어요.</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          잠시 후 다시 시도해 주세요.
        </p>
      </div>
    </section>
  );
}

export function SharePage() {
  const { sessionId = "" } = useParams();
  const [ratio, setRatio] = useState<"portrait" | "square">("portrait");
  const cardRef = useRef<HTMLDivElement>(null);
  const resultQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchLightResult(sessionId),
    queryKey: lightResultQueryKey(sessionId),
    retry: false,
  });

  if (sessionId === "") {
    return <ShareError />;
  }

  if (resultQuery.isPending) {
    return (
      <section aria-live="polite" className={pageClassName}>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">결과 공유</h1>
        <p className="text-sm text-ink-muted">결과를 불러오는 중이에요.</p>
      </section>
    );
  }

  if (resultQuery.isError || resultQuery.data === undefined) {
    return <ShareError />;
  }

  if (resultQuery.data.status === "waiting") {
    return <Navigate replace to={`/waiting/${sessionId}`} />;
  }

  const model = toShareCardModel(resultQuery.data.result, ratio);

  return (
    <section className={pageClassName}>
      <div>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">결과 공유</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          함께 공개된 결과를 원하는 비율로 저장해 보세요.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="공유 카드 비율">
        <button
          aria-pressed={ratio === "portrait"}
          className="rounded-control border border-green-strong px-4 py-2 text-sm font-bold text-ink"
          type="button"
          onClick={() => setRatio("portrait")}
        >
          세로 9:16
        </button>
        <button
          aria-pressed={ratio === "square"}
          className="rounded-control border border-purple-strong px-4 py-2 text-sm font-bold text-ink"
          type="button"
          onClick={() => setRatio("square")}
        >
          정사각형 1:1
        </button>
      </div>

      <div className="mx-auto w-full max-w-[34rem] rounded-card border border-border bg-card p-2 sm:p-4">
        <ShareCard ref={cardRef} model={model} />
      </div>

      <p className="text-sm leading-relaxed text-ink-muted">
        금액, 부채, 저축액 같은 재무 정보는 카드에 담기지 않아요
      </p>

      <DownloadShareCardButton cardRef={cardRef} model={model} />
    </section>
  );
}
