import { lazy, Suspense } from "react";
import { Outlet, Route, Routes } from "react-router-dom";

import { SessionErrorPage } from "@/pages/error";

import { AppLayout } from "./AppLayout";
import { RouteLoadingFallback } from "./RouteLoadingFallback";

const LandingPage = lazy(async () => ({ default: (await import("@/pages/landing")).LandingPage }));
const LightFormPage = lazy(async () => ({ default: (await import("@/pages/light-form")).LightFormPage }));
const InvitePage = lazy(async () => ({ default: (await import("@/pages/invite")).InvitePage }));
const WaitingPage = lazy(async () => ({ default: (await import("@/pages/waiting")).WaitingPage }));
const LightResultPage = lazy(async () => ({
  default: (await import("@/pages/light-result")).LightResultPage,
}));
const SharePage = lazy(async () => ({ default: (await import("@/pages/share")).SharePage }));
const LoginPage = lazy(async () => ({ default: (await import("@/pages/login")).LoginPage }));
const DeepEntryPage = lazy(async () => ({
  default: (await import("@/pages/deep-entry")).DeepEntryPage,
}));
const DeepPlaceholderPage = lazy(async () => ({
  default: (await import("@/pages/deep-placeholder")).DeepPlaceholderPage,
}));

function DeepRouteLayout() {
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="deep" element={<DeepRouteLayout />}>
            <Route index element={<DeepEntryPage />} />
            <Route path="invite/:code" element={<DeepPlaceholderPage />} />
            <Route path="plan/:sessionId" element={<DeepPlaceholderPage />} />
            <Route path="input/:sessionId" element={<DeepPlaceholderPage />} />
            <Route path="questions/:sessionId" element={<DeepPlaceholderPage />} />
            <Route path="waiting/:sessionId" element={<DeepPlaceholderPage />} />
            <Route path="result/:sessionId" element={<DeepPlaceholderPage />} />
            <Route path="agreements/:sessionId" element={<DeepPlaceholderPage />} />
            <Route path="meeting/:sessionId" element={<DeepPlaceholderPage />} />
          </Route>
          <Route path="light/:step" element={<LightFormPage />} />
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
