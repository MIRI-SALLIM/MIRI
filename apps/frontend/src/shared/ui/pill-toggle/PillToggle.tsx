import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface PillToggleProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-pressed" | "children" | "onChange" | "onClick"
  > {
  children: ReactNode;
  onPressedChange: (pressed: boolean) => void;
  pressed: boolean;
  size?: "md" | "sm";
  tone?: "green" | "purple";
}

const toneStyles = {
  green: {
    idle: "border-border bg-card text-ink-muted hover:border-green",
    pressed: "border-green-strong bg-green-tint text-green-strong",
  },
  purple: {
    idle: "border-border bg-card text-ink-muted hover:border-purple",
    pressed: "border-purple-strong bg-purple-tint text-purple-strong",
  },
} as const;

const sizeStyles = {
  md: "min-h-12 px-[18px] text-[15px]",
  sm: "min-h-11 px-4 text-[14.5px]",
} as const;

export function PillToggle({
  children,
  className = "",
  onPressedChange,
  pressed,
  size = "md",
  tone = "green",
  type = "button",
  ...buttonProps
}: PillToggleProps) {
  const stateStyle = pressed ? toneStyles[tone].pressed : toneStyles[tone].idle;

  return (
    <button
      {...buttonProps}
      aria-pressed={pressed}
      className={`inline-flex items-center justify-center rounded-full border font-medium leading-[normal] transition-colors duration-[160ms] ease-smooth focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 ${sizeStyles[size]} ${stateStyle} ${className}`}
      onClick={() => onPressedChange(!pressed)}
      type={type}
    >
      {children}
    </button>
  );
}
