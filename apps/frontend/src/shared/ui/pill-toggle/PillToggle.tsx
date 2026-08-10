import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface PillToggleProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-pressed" | "children" | "onChange" | "onClick"
  > {
  children: ReactNode;
  onPressedChange: (pressed: boolean) => void;
  pressed: boolean;
  tone?: "green" | "purple";
}

const toneStyles = {
  green: {
    idle: "border-border bg-card text-ink-muted hover:border-green/50",
    pressed: "border-green bg-green-tint text-green-strong",
  },
  purple: {
    idle: "border-border bg-card text-ink-muted hover:border-purple/50",
    pressed: "border-purple bg-purple-tint text-purple-strong",
  },
} as const;

export function PillToggle({
  children,
  className = "",
  onPressedChange,
  pressed,
  tone = "green",
  type = "button",
  ...buttonProps
}: PillToggleProps) {
  const stateStyle = pressed ? toneStyles[tone].pressed : toneStyles[tone].idle;

  return (
    <button
      {...buttonProps}
      aria-pressed={pressed}
      className={`inline-flex min-h-11 items-center justify-center rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 ${stateStyle} ${className}`}
      onClick={() => onPressedChange(!pressed)}
      type={type}
    >
      {children}
    </button>
  );
}
