import type { HTMLAttributes } from "react";

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className = "", ...divProps }: SkeletonProps) {
  return (
    <div
      {...divProps}
      aria-hidden="true"
      className={`motion-safe:animate-pulse rounded-control bg-border-soft ${className}`}
    />
  );
}
