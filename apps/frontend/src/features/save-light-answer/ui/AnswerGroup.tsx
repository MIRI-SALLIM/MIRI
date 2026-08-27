import { PillToggle } from "@/shared/ui/pill-toggle";

import type { LightAnswerValue } from "@/entities/light-answer";
import type { LightQuestionOption } from "@/entities/light-question";

export interface AnswerGroupProps {
  /** 스크린리더에 노출되는 그룹 이름. 화면에는 heading 이 대신 보인다. */
  label: string;
  disabled?: boolean;
  heading: string;
  onChange: (value: LightAnswerValue) => void;
  options: LightQuestionOption[];
  size?: "md" | "sm";
  tone: "green" | "purple";
  value: LightAnswerValue;
}

export function AnswerGroup({
  disabled = false,
  heading,
  label,
  onChange,
  options,
  size = "md",
  tone,
  value,
}: AnswerGroupProps) {
  return (
    <fieldset aria-label={label} disabled={disabled}>
      <legend className="mb-[clamp(5px,0.69vh,12px)] text-[14.5px] font-semibold leading-[normal] text-ink">
        {heading}
      </legend>
      <div className="flex flex-wrap gap-[9px]">
        {options.map((option, index) => (
          <PillToggle
            key={`${label}-${String(option.value)}`}
            onPressedChange={(pressed) => onChange(pressed ? (index as LightAnswerValue) : null)}
            pressed={value === index}
            size={size}
            tone={tone}
          >
            {option.label}
          </PillToggle>
        ))}
      </div>
    </fieldset>
  );
}
