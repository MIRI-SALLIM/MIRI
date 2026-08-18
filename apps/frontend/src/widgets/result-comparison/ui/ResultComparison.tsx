import type { LightResultQuestion } from "@/entities/light-result";
import { Badge } from "@/shared/ui/badge";

export interface ResultComparisonProps {
  questions: LightResultQuestion[];
}

function answerLabel(answer: number | null | undefined, label: string | null | undefined) {
  if (label) {
    return label;
  }

  return answer === null || answer === undefined ? "선택하지 않음" : `${answer + 1}번 선택`;
}

export function ResultComparison({ questions }: ResultComparisonProps) {
  return (
    <section aria-labelledby="result-comparison-heading" className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink" id="result-comparison-heading">
          서로의 답을 비교해봐요
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          공개하기로 약속한 질문만 서로의 관점에서 보여드려요.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {questions.map((question) => (
          <article
            className="flex flex-col gap-5 rounded-card border border-border bg-card p-5 sm:p-6"
            key={question.questionId}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="max-w-2xl text-base font-extrabold leading-relaxed text-ink">
                {question.questionText}
              </h3>
              <Badge tone={question.isMatch ? "green" : "neutral"}>
                {question.isMatch ? "같은 생각" : "다른 생각"}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-control bg-green-tint p-4">
                <p className="text-xs font-bold text-green-strong">나 · Green</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-ink">
                  {answerLabel(question.myAnswer, question.myAnswerLabel)}
                </p>
              </div>
              <div className="rounded-control bg-purple-tint p-4">
                <p className="text-xs font-bold text-purple-strong">파트너 · Purple</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-ink">
                  {answerLabel(question.partnerAnswer, question.partnerAnswerLabel)}
                </p>
              </div>
              <div className="rounded-control border border-border bg-canvas p-4">
                <p className="text-xs font-bold text-ink-muted">내 예측</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-ink">
                  {answerLabel(question.myGuess, null)}
                </p>
                <p className="mt-2 text-xs font-bold text-ink-muted">
                  {question.isHit ? "예측 적중" : "다르게 예상했어요"}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
