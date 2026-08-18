import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";

import { fetchLightResult, lightResultQueryKey } from "@/features/get-light-result";
import { ApiError } from "@/shared/api";
import { ResultComparison } from "@/widgets/result-comparison";
import { ResultSummary } from "@/widgets/result-summary";
import { ResultTopics } from "@/widgets/result-topics";

const pageClassName = "mx-auto flex max-w-4xl flex-col gap-12 px-5 py-14 sm:px-8 sm:py-20";

function ResultError({ error }: { error: unknown }) {
  const message = error instanceof ApiError && error.kind === "expired"
    ? "이 세션은 만료됐어요."
    : "결과를 불러오지 못했어요.";

  return (
    <section className={pageClassName}>
      <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">라이트 결과</h1>
      <div className="rounded-card border border-border bg-card p-6 sm:p-8">
        <p className="text-base font-bold text-ink">{message}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          잠시 후 다시 시도해 주세요.
        </p>
      </div>
    </section>
  );
}

export function LightResultPage() {
  const { sessionId = "" } = useParams();
  const resultQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchLightResult(sessionId),
    queryKey: lightResultQueryKey(sessionId),
    retry: false,
  });

  if (sessionId === "") {
    return <ResultError error={new Error("Missing session id")} />;
  }

  if (resultQuery.isPending) {
    return (
      <section aria-live="polite" className={pageClassName}>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">라이트 결과</h1>
        <p className="text-sm text-ink-muted">결과를 불러오는 중이에요.</p>
      </section>
    );
  }

  if (resultQuery.isError || resultQuery.data === undefined) {
    return <ResultError error={resultQuery.error} />;
  }

  if (resultQuery.data.status === "waiting") {
    return <Navigate replace to={`/waiting/${sessionId}`} />;
  }

  const { result } = resultQuery.data;

  return (
    <section className={pageClassName}>
      <ResultSummary result={result} shareHref={`/result/light/${sessionId}/share`} />
      <ResultComparison questions={result.questions} />
      <ResultTopics topics={result.discussionTopics} />
    </section>
  );
}
