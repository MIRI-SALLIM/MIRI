import type { ReactNode } from "react";

export interface PageLoadingProps {
  children: ReactNode;
  className: string;
  eyebrow?: string;
  heading: string;
  message: string;
}

export function PageLoading({ children, className, eyebrow, heading, message }: PageLoadingProps) {
  return (
    <section aria-live="polite" className={className}>
      <div className="space-y-3">
        {eyebrow ? <p className="text-sm font-semibold text-purple-strong">{eyebrow}</p> : null}
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">{heading}</h1>
      </div>
      <p className="sr-only" role="status">{message}</p>
      <div aria-hidden="true" className="space-y-6">
        {children}
      </div>
    </section>
  );
}
