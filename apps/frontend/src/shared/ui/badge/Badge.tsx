import type { HTMLAttributes, ReactNode } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: "green" | "purple" | "neutral";
}

const toneStyles = {
  green: "bg-green-tint text-green-strong",
  purple: "bg-purple-tint text-purple-strong",
  neutral: "bg-[#F4F4F2] text-ink-muted",
} as const;

export function Badge({
  children,
  className = "",
  tone = "neutral",
  ...spanProps
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${toneStyles[tone]} ${className}`}
      {...spanProps}
    >
      {children}
    </span>
  );
}
