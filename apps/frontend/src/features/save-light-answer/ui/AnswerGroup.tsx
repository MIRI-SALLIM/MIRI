import { PillToggle } from "@/shared/ui/pill-toggle";

import type { LightAnswerValue } from "@/entities/light-answer";
import type { LightQuestionOption } from "@/entities/light-question";

export interface AnswerGroupProps {
  disabled?: boolean;
  label: string;
  onChange: (value: LightAnswerValue) => void;
  options: LightQuestionOption[];
  tone: "green" | "purple";
  value: LightAnswerValue;
}

export function AnswerGroup({ disabled = false, label, onChange, options, tone, value }: AnswerGroupProps) {
  return (
    <fieldset aria-label={label} className="flex flex-col gap-3" disabled={disabled}>
      <legend className="text-sm font-extrabold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2.5">
        {options.map((option, index) => (
          <PillToggle
            key={`${label}-${String(option.value)}`}
            onPressedChange={(pressed) => onChange(pressed ? (index as LightAnswerValue) : null)}
            pressed={value === index}
            tone={tone}
          >
            {option.label}
          </PillToggle>
        ))}
      </div>
      <button
        aria-label={`${label} 건너뛰기`}
        className="self-start text-sm font-semibold text-ink-muted underline decoration-border underline-offset-4 hover:text-ink focus-visible:rounded-control"
        onClick={() => onChange(null)}
        type="button"
      >
        건너뛰기
      </button>
    </fieldset>
  );
}
