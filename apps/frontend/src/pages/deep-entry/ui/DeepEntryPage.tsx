import { Link } from "react-router-dom";

import { useAccount } from "@/entities/account";

export function DeepEntryPage() {
  const { state } = useAccount();

  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-7 px-5 py-16 sm:px-8">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">제대로 계산해보기</h1>
      </div>

      {state === "loading" ? (
        <p className="text-ink-muted" role="status">
          로그인 상태를 확인하고 있어요.
        </p>
      ) : state === "disabled" ? (
        <p className="rounded-control border border-border-control bg-card p-4 text-ink-muted" role="alert">
          현재 딥모드를 사용할 수 없어요. 이 배포에서는 관련 기능이 아직 활성화되지 않았어요.
        </p>
      ) : state === "error" ? (
        <p className="rounded-control border border-border-control bg-card p-4 text-ink-muted" role="alert">
          로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : state === "unauthenticated" ? (
        <div className="space-y-4">
          <p className="text-ink-muted">딥모드는 카카오 로그인 후 이용할 수 있어요.</p>
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-control border border-purple-strong bg-purple-strong px-5 py-3 font-bold text-white transition-[background-color,translate] duration-[160ms] ease-smooth hover:bg-[#563C96] focus-visible:shadow-focus active:translate-y-px"
            to="/login"
          >
            카카오로 로그인하기
          </Link>
        </div>
      ) : (
        <p className="rounded-control border border-border bg-card p-4 text-ink-muted">
          딥모드는 아직 준비 중이에요. 기능이 준비되면 이 화면에서 다음 단계를 안내해 드릴게요.
        </p>
      )}
    </section>
  );
}
