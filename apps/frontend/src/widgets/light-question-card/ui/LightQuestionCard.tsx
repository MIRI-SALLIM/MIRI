import type { ReactNode } from "react";

import { AnswerGroup } from "@/features/save-light-answer";

import type { LightAnswerValue } from "@/entities/light-answer";
import type { LightQuestion, LightQuestionOption } from "@/entities/light-question";

export interface LightQuestionCardProps {
  answer: LightAnswerValue;
  disabled?: boolean;
  footer?: ReactNode;
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
  footer,
  guess,
  onAnswerChange,
  onGuessChange,
  question,
}: LightQuestionCardProps) {
  const options = getOptions(question);

  return (
    <section className="mt-[clamp(9px,1.26vh,22px)] rounded-[22px] border border-border bg-card px-[clamp(22px,3vw,34px)] py-[clamp(14px,1.94vh,34px)]">
      <p className="text-[13.5px] font-semibold leading-[normal] text-green">{question.category}</p>
      <h2 className="mt-2 text-[clamp(19px,2.6vh,23px)] font-extrabold leading-[1.4] tracking-[-0.02em] text-ink">
        {question.text}
      </h2>
      {question.subText ? (
        <p className="mt-2 text-[14.5px] leading-[1.55] text-ink-muted">{question.subText}</p>
      ) : null}

      <div className="mt-[clamp(10px,1.49vh,26px)]">
        <AnswerGroup
          disabled={disabled}
          heading="나는 어느 쪽인가요"
          label="내 답"
          onChange={onAnswerChange}
          options={options}
          tone="green"
          value={answer}
        />
      </div>

      <div className="mt-[clamp(10px,1.49vh,26px)] rounded-[18px] border border-dashed border-[#CFE9DC] bg-canvas px-5 py-[clamp(8px,1.14vh,20px)]">
        <AnswerGroup
          disabled={disabled}
          heading="상대는 어떻게 답했을까요"
          label="상대 예측"
          onChange={onGuessChange}
          options={options}
          size="sm"
          tone="purple"
          value={guess}
        />
        <p className="mt-[clamp(5px,0.69vh,12px)] text-[12.5px] leading-[normal] text-ink-muted">
          예측은 둘 다 끝낸 뒤에만 공개돼요
        </p>
      </div>

      {footer ? (
        <div className="mt-[clamp(11px,1.71vh,30px)] flex flex-wrap items-center gap-3 border-t border-border-soft pt-[clamp(9px,1.26vh,22px)]">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
