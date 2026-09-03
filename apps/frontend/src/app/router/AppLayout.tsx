import { Outlet } from "react-router-dom";

import { AppShell } from "@/widgets/app-shell";

export function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
