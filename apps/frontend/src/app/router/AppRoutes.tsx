import { lazy, Suspense } from "react";
import { Outlet, Route, Routes } from "react-router-dom";

import { SessionErrorPage } from "@/pages/error";

import { AppLayout } from "./AppLayout";
import { RouteLoadingFallback } from "./RouteLoadingFallback";

const LandingPage = lazy(async () => ({ default: (await import("@/pages/landing")).LandingPage }));
const ServiceIntroductionPage = lazy(async () => ({
  default: (await import("@/pages/service-introduction")).ServiceIntroductionPage,
}));
const SampleReportPage = lazy(async () => ({
  default: (await import("@/pages/sample-report")).SampleReportPage,
}));
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
const DeepInvitePage = lazy(async () => ({
  default: (await import("@/pages/deep-invite")).DeepInvitePage,
}));
const DeepWaitingPage = lazy(async () => ({
  default: (await import("@/pages/deep-waiting")).DeepWaitingPage,
}));
const DeepPlanPage = lazy(async () => ({
  default: (await import("@/pages/deep-plan")).DeepPlanPage,
}));
const DeepInputPage = lazy(async () => ({
  default: (await import("@/pages/deep-input")).DeepInputPage,
}));
const DeepQuestionsPage = lazy(async () => ({
  default: (await import("@/pages/deep-questions")).DeepQuestionsPage,
}));
const DeepSubmitPage = lazy(() =>
  import("@/pages/deep-submit").then(({ DeepSubmitPage: page }) => ({ default: page })),
);
const DeepResultPage = lazy(() =>
  import("@/pages/deep-result").then(({ DeepResultPage: page }) => ({ default: page })),
);
const DeepAgreementsPage = lazy(() =>
  import("@/pages/deep-agreements").then(({ DeepAgreementsPage: page }) => ({ default: page })),
);
const DeepMeetingPage = lazy(() =>
  import("@/pages/deep-meeting").then(({ DeepMeetingPage: page }) => ({ default: page })),
);

function DeepRouteLayout() {
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="about" element={<ServiceIntroductionPage />} />
          <Route path="sample" element={<SampleReportPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="deep" element={<DeepRouteLayout />}>
            <Route index element={<DeepEntryPage />} />
            <Route path="invite/:code" element={<DeepInvitePage />} />
            <Route path="plan/:sessionId" element={<DeepPlanPage />} />
            <Route path="input/:sessionId" element={<DeepInputPage />} />
            <Route path="questions/:sessionId" element={<DeepQuestionsPage />} />
            <Route path="submit/:sessionId" element={<DeepSubmitPage />} />
            <Route path="waiting/:sessionId" element={<DeepWaitingPage />} />
            <Route path="result/:sessionId" element={<DeepResultPage />} />
            <Route path="agreements/:sessionId" element={<DeepAgreementsPage />} />
            <Route path="meeting/:sessionId" element={<DeepMeetingPage />} />
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
