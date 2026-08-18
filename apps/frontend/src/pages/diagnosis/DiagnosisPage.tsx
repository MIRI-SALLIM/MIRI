import { useSearchParams, useNavigate } from "react-router-dom";
import { LightDiagnosisFlow } from "@/features/diagnosis";
import { AppShell } from "@/widgets/app-shell";

export function DiagnosisPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("sessionId") || sessionStorage.getItem("mrs_session_id");

  if (!sessionId) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-5 py-20 text-center animate-fadeup">
          <h2 className="text-xl font-bold text-ink">세션 정보를 찾을 수 없습니다</h2>
          <p className="mt-2 text-sm text-ink-muted">먼저 3분 대화를 시작해 주세요.</p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-6 inline-flex rounded-xl bg-green px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-strong transition-all"
          >
            홈으로 이동
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <LightDiagnosisFlow sessionId={sessionId} />
      </div>
    </AppShell>
  );
}
