import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { SessionErrorPage } from "@/pages/error";

import { AppLayout } from "./AppLayout";
import { RouteLoadingFallback } from "./RouteLoadingFallback";

const LandingPage = lazy(async () => ({ default: (await import("@/pages/landing")).LandingPage }));
const LightFormPage = lazy(async () => ({ default: (await import("@/pages/light-form")).LightFormPage }));
const DonePage = lazy(async () => ({ default: (await import("@/pages/done")).DonePage }));
const InvitePage = lazy(async () => ({ default: (await import("@/pages/invite")).InvitePage }));
const WaitingPage = lazy(async () => ({ default: (await import("@/pages/waiting")).WaitingPage }));
const LightResultPage = lazy(async () => ({
  default: (await import("@/pages/light-result")).LightResultPage,
}));
const SharePage = lazy(async () => ({ default: (await import("@/pages/share")).SharePage }));

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="light/:step" element={<LightFormPage />} />
          <Route path="done" element={<DonePage />} />
          <Route path="invite/:code" element={<InvitePage />} />
          <Route path="waiting/:sessionId" element={<WaitingPage />} />
          <Route path="result/light/:sessionId" element={<LightResultPage />} />
          <Route path="result/light/:sessionId/share" element={<SharePage />} />
          <Route path="*" element={<SessionErrorPage kind="not-found" />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
