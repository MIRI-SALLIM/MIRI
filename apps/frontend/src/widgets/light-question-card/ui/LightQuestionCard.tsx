import { AnswerGroup } from "@/features/save-light-answer";

import type { LightAnswerValue } from "@/entities/light-answer";
import type { LightQuestion, LightQuestionOption } from "@/entities/light-question";

export interface LightQuestionCardProps {
  answer: LightAnswerValue;
  disabled?: boolean;
  guess: LightAnswerValue;
  onAnswerChange: (value: LightAnswerValue) => void;
  onGuessChange: (value: LightAnswerValue) => void;
  question: LightQuestion;
}

function getOptions(question: LightQuestion): LightQuestionOption[] {
  if (question.options && question.options.length > 0) {
    return question.options;
  }

  return (question.scaleConfig?.steps ?? []).map((label, value) => ({ label, value }));
}

export function LightQuestionCard({
  answer,
  disabled = false,
  guess,
  onAnswerChange,
  onGuessChange,
  question,
}: LightQuestionCardProps) {
  const options = getOptions(question);

  return (
    <article className="flex flex-col gap-8 rounded-card border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold text-green-strong">{question.category}</p>
        <h2 className="text-2xl font-extrabold leading-tight tracking-[-0.02em] text-ink">
          {question.text}
        </h2>
        {question.subText ? <p className="text-sm leading-relaxed text-ink-muted">{question.subText}</p> : null}
      </div>

      <div className="flex flex-col gap-7">
        <AnswerGroup
          disabled={disabled}
          label="내 답"
          onChange={onAnswerChange}
          options={options}
          tone="green"
          value={answer}
        />
        <div aria-hidden="true" className="h-px bg-border" />
        <AnswerGroup
          disabled={disabled}
          label="상대 예측"
          onChange={onGuessChange}
          options={options}
          tone="purple"
          value={guess}
        />
      </div>
    </article>
  );
}
