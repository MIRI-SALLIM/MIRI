import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

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

const precisionOptions = [
  { label: "정확히 알고 있어요", value: "exact" },
  { label: "대략 알고 있어요", value: "estimate" },
] as const;

function formatAmountValue(amount: AmountValue["value"]): string {
  return amount === null || amount === undefined ? "" : String(amount);
}

function parseAmountValue(rawValue: string): number | null {
  if (rawValue === "") {
    return null;
  }

  const amount = Number(rawValue);
  return Number.isSafeInteger(amount) ? amount : null;
}

interface AmountInteractionState {
  basePrecision: AmountValue["precision"];
  baseStatus: AmountValue["status"];
  baseValue: AmountValue["value"];
  rawValue: string;
  selectedPrecision: AmountValue["precision"];
  selectedStatus: AmountValue["status"];
}

export function AmountField({
  className = "",
  disabled = false,
  id,
  label = "금액",
  onChange,
  value,
  ...inputProps
}: AmountFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `amount-field-${generatedId}`;
  const textLabel = typeof label === "string" ? label : "금액";
  const [interactionState, setInteractionState] = useState<AmountInteractionState>(() => ({
    basePrecision: value.precision,
    baseStatus: value.status,
    baseValue: value.value,
    rawValue: formatAmountValue(value.value),
    selectedPrecision: value.precision,
    selectedStatus: value.status,
  }));
  const hasCurrentValue =
    interactionState.baseValue === value.value &&
    interactionState.baseStatus === value.status &&
    interactionState.basePrecision === value.precision;
  const rawValue = hasCurrentValue ? interactionState.rawValue : formatAmountValue(value.value);
  const selectedStatus = hasCurrentValue ? interactionState.selectedStatus : value.status;
  const selectedPrecision = hasCurrentValue ? interactionState.selectedPrecision : value.precision;

  const updateInteractionState = (next: Pick<AmountInteractionState, "rawValue" | "selectedPrecision" | "selectedStatus">) => {
    setInteractionState({
      basePrecision: value.precision,
      baseStatus: value.status,
      baseValue: value.value,
      ...next,
    });
  };

  const handleStatusChange = (status: AmountValue["status"]) => {
    if (status === "known") {
      const amount = parseAmountValue(rawValue);
      updateInteractionState({ rawValue, selectedPrecision, selectedStatus: status });
      if (amount === null) {
        return;
      }

      onChange({
        precision: selectedPrecision,
        status,
        value: amount,
      });
      return;
    }

    updateInteractionState({ rawValue: "", selectedPrecision, selectedStatus: status });
    onChange({
      precision: selectedPrecision,
      status,
      value: null,
    });
  };

  const handlePrecisionChange = (precision: AmountValue["precision"]) => {
    updateInteractionState({ rawValue, selectedPrecision: precision, selectedStatus });

    if (selectedStatus !== "known") {
      return;
    }

    const amount = parseAmountValue(rawValue);
    if (amount === null) {
      return;
    }

    onChange({ status: "known", value: amount, precision });
  };

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`${textLabel} 상태`}>
        {statusOptions.map((option) => (
          <PillToggle
            key={option.value}
            onPressedChange={() => handleStatusChange(option.value)}
            pressed={selectedStatus === option.value}
            size="sm"
          >
            {option.label}
          </PillToggle>
        ))}
      </div>
      {selectedStatus === "known" ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${textLabel} 정확도`}>
          {precisionOptions.map((option) => (
            <PillToggle
              key={option.value}
              onPressedChange={() => handlePrecisionChange(option.value)}
              pressed={selectedPrecision === option.value}
              size="sm"
            >
              {option.label}
            </PillToggle>
          ))}
        </div>
      ) : null}
      <label className="sr-only" htmlFor={inputId}>
        {textLabel}
      </label>
      <div className="relative">
        <input
          {...inputProps}
          className={`min-h-12 w-full rounded-control border border-border-control bg-card px-4 py-3 pr-12 text-right text-base tabular-nums outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:border-green-strong focus:shadow-focus disabled:cursor-not-allowed disabled:bg-border-soft ${className}`}
          disabled={disabled}
          id={inputId}
          inputMode="numeric"
          min={0}
          onChange={(event) => {
            const nextRawValue = event.currentTarget.value.replace(/[^0-9]/g, "");
            const amount = parseAmountValue(nextRawValue);
            updateInteractionState({
              rawValue: nextRawValue,
              selectedPrecision,
              selectedStatus: amount === null ? selectedStatus : "known",
            });

            if (amount !== null) {
              onChange({ precision: selectedPrecision, status: "known", value: amount });
            }
          }}
          step={1}
          type="number"
          value={rawValue}
        />
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-ink-muted" aria-hidden="true">
          원
        </span>
      </div>
    </fieldset>
  );
}
