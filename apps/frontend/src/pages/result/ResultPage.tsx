import { useParams, useNavigate } from "react-router-dom";
import { LightResultView } from "@/features/result";
import { AppShell } from "@/widgets/app-shell";

export function ResultPage() {
  const { sessionId: paramId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const sessionId = paramId || sessionStorage.getItem("mrs_session_id");

  if (!sessionId) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-5 py-20 text-center animate-fadeup">
          <h2 className="text-xl font-bold text-ink">세션 정보를 찾을 수 없습니다</h2>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-6 inline-flex rounded-xl bg-green px-5 py-2.5 text-sm font-bold text-white"
          >
            홈으로 이동
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <LightResultView sessionId={sessionId} />
      </div>
    </AppShell>
  );
}
