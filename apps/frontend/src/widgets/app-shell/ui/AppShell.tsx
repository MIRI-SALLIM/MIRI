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
      {/* 페이지가 헤더·푸터를 뺀 남은 높이를 그대로 쓸 수 있도록 flex 컨테이너로 둔다. */}
      <main className="flex flex-1 flex-col">{children}</main>
      <AppFooter />
    </div>
  );
}
