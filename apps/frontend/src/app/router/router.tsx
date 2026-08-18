import { createBrowserRouter } from "react-router-dom";
import { DiagnosisPage } from "@/pages/diagnosis";
import { InvitePage } from "@/pages/invite";
import { LandingPage } from "@/pages/landing";
import { ResultPage } from "@/pages/result";
import { WaitingPage } from "@/pages/waiting";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/light",
    element: <DiagnosisPage />,
  },
  {
    path: "/invite/:code",
    element: <InvitePage />,
  },
  {
    path: "/waiting/:sessionId",
    element: <WaitingPage />,
  },
  {
    path: "/waiting",
    element: <WaitingPage />,
  },
  {
    path: "/result/:sessionId",
    element: <ResultPage />,
  },
  {
    path: "/result",
    element: <ResultPage />,
  },
]);
