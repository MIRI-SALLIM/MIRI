import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

export interface NavigationLinkProps extends Omit<LinkProps, "children" | "className"> {
  children: ReactNode;
  className?: string;
  direction?: "back" | "forward";
}

export function NavigationLink({
  children,
  className = "",
  direction = "forward",
  ...linkProps
}: NavigationLinkProps) {
  const arrow = direction === "back" ? "←" : "→";

  return (
    <Link
      {...linkProps}
      className={`inline-flex w-fit items-center gap-2 rounded-control px-3 py-2 font-bold text-purple-strong underline underline-offset-4 transition-colors duration-[160ms] ease-smooth hover:text-purple focus-visible:shadow-focus-purple ${className}`}
    >
      {direction === "back" ? <span aria-hidden="true">{arrow}</span> : null}
      <span>{children}</span>
      {direction === "forward" ? <span aria-hidden="true">{arrow}</span> : null}
    </Link>
  );
}
