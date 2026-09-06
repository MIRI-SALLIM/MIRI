import { useEffect } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";

import { AppShell } from "@/widgets/app-shell";

function RouteScrollReset() {
  const { hash, pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    // POP 내비게이션은 브라우저가 보존한 뒤로/앞으로 위치를 사용한다.
    if (navigationType === "POP" || hash) return;

    window.scrollTo({ left: 0, top: 0 });
  }, [hash, navigationType, pathname]);

  return null;
}

export function AppLayout() {
  return (
    <AppShell>
      <RouteScrollReset />
      <Outlet />
    </AppShell>
  );
}
