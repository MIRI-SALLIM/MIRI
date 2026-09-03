import { Navigate, useParams } from "react-router-dom";

import { useLightResult } from "@/features/get-light-result";
import { ApiError } from "@/shared/api";
import { ResultComparison } from "@/widgets/result-comparison";
import { ResultSummary } from "@/widgets/result-summary";
import { ResultTopics } from "@/widgets/result-topics";

const pageClassName = "mx-auto flex w-full max-w-4xl flex-col gap-12 px-5 py-14 sm:px-8 sm:py-20";

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
  const lightResult = useLightResult(sessionId);

  if (lightResult.state === "loading") {
    return (
      <section aria-live="polite" className={pageClassName}>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">라이트 결과</h1>
        <p className="text-sm text-ink-muted">결과를 불러오는 중이에요.</p>
      </section>
    );
  }

  if (lightResult.state === "error") {
    return <ResultError error={lightResult.error} />;
  }

  if (lightResult.state === "waiting") {
    return <Navigate replace to={`/waiting/${sessionId}`} />;
  }

  const { result } = lightResult;

  return (
    <section className={pageClassName}>
      <ResultSummary result={result} shareHref={`/result/light/${sessionId}/share`} />
      <ResultComparison questions={result.questions} />
      <ResultTopics topics={result.discussionTopics} />
    </section>
  );
}
