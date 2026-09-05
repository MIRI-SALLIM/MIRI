import type { InputHTMLAttributes, ReactNode } from "react";

import type { components } from "@/shared/api";
import { PillToggle } from "@/shared/ui/pill-toggle";

export type AmountValue = components["schemas"]["Amount"];

export interface AmountFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  label?: ReactNode;
  onChange: (amount: AmountValue) => void;
  value: AmountValue;
}

const statusOptions = [
  { label: "알고 있어요", value: "known" },
  { label: "모르겠어요", value: "unknown" },
  { label: "밝히고 싶지 않아요", value: "withheld" },
] as const;

export function AmountField({
  className = "",
  disabled = false,
  id,
  label = "금액",
  onChange,
  value,
  ...inputProps
}: AmountFieldProps) {
  const inputId = id ?? "amount-field";
  const textLabel = typeof label === "string" ? label : "금액";
  const handleStatusChange = (status: AmountValue["status"]) => {
    onChange({
      precision: value.precision,
      status,
      value: status === "known" ? value.value ?? 0 : null,
    });
  };

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2" aria-label={`${textLabel} 상태`}>
        {statusOptions.map((option) => (
          <PillToggle
            aria-label={option.label}
            key={option.value}
            onPressedChange={() => handleStatusChange(option.value)}
            pressed={value.status === option.value}
            size="sm"
          >
            {option.label}
          </PillToggle>
        ))}
      </div>
      <label className="sr-only" htmlFor={inputId}>
        {textLabel}
      </label>
      <div className="relative">
        <input
          {...inputProps}
          aria-label={textLabel}
          className={`min-h-12 w-full rounded-control border border-border-control bg-card px-4 py-3 pr-12 text-right text-base tabular-nums outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-green-strong focus:shadow-focus disabled:cursor-not-allowed disabled:bg-border-soft ${className}`}
          disabled={disabled}
          id={inputId}
          inputMode="numeric"
          min={0}
          onChange={(event) => {
            const rawValue = event.currentTarget.value.replace(/[^0-9]/g, "");
            if (rawValue === "") {
              onChange({ precision: value.precision, status: "unknown", value: null });
              return;
            }

            const numericValue = Number(rawValue);
            if (Number.isSafeInteger(numericValue)) {
              onChange({ precision: value.precision, status: "known", value: numericValue });
            }
          }}
          step={1}
          type="number"
          value={value.value ?? ""}
        />
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-ink-muted" aria-hidden="true">
          원
        </span>
      </div>
    </fieldset>
  );
}
