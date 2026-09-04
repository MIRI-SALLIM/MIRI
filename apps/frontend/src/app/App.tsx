import { LoginCheck } from "@/pages/login-check";
import { AppProviders } from "./providers";

export function App() {
  if (typeof window !== "undefined" && window.location.pathname === "/deep/login-check") {
    return <LoginCheck />;
  }
  return <AppProviders />;
}

