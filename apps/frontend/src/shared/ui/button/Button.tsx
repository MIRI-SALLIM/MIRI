import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  fullWidth?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}

const variantStyles = {
  primary: "border-green-strong bg-green-strong text-white hover:bg-[#1F6F4E]",
  secondary: "border-border bg-card text-ink hover:border-green/50",
  ghost: "border-transparent bg-transparent text-ink-muted hover:bg-green-tint",
} as const;

export function Button({
  children,
  className = "",
  fullWidth = false,
  type = "button",
  variant = "primary",
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-control border px-5 py-3 text-base font-bold transition-colors focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 ${variantStyles[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      type={type}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
