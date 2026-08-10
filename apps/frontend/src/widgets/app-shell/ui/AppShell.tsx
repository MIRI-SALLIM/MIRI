import type { ReactNode } from "react";

import { AppFooter } from "@/widgets/app-footer";
import { AppHeader } from "@/widgets/app-header";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <AppHeader />
      <main className="flex-1">{children}</main>
      <AppFooter />
    </div>
  );
}
