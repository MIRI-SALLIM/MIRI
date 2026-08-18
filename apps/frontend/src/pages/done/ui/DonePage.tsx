import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { ACTIVE_SESSION_STORAGE_KEY, activeSessionQueryKey } from "@/features/create-session";
import { getActiveSession } from "@/features/save-light-answer";

export function DonePage() {
  const storedSessionId = sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  const sessionQuery = useQuery({
    queryFn: getActiveSession,
    queryKey: activeSessionQueryKey,
    retry: false,
  });
  const sessionId = storedSessionId ?? sessionQuery.data?.id;

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold text-green-strong">3분 모드</p>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">제출 완료</h1>
        <p className="leading-relaxed text-ink-muted">
          내 입력은 제출되어 이제 수정할 수 없어요. 상대방도 제출하면 두 사람의 결과가 함께 열려요.
        </p>
      </div>

      <div className="rounded-card border border-green/40 bg-green-tint/40 p-6 sm:p-8">
        <p className="text-sm font-bold text-green-strong">상대방에게 보낼 초대 코드</p>
        <p className="mt-3 font-mono text-3xl font-extrabold tracking-[0.12em] text-ink">
          {sessionQuery.data?.invitationCode ?? "불러오는 중..."}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">이 세션은 7일 후 자동으로 삭제돼요.</p>
      </div>

      <nav aria-label="제출 후 이동" className="flex flex-col gap-3">
        <Link
          className="inline-flex min-h-12 items-center justify-center rounded-control border border-border bg-card px-5 py-3 text-base font-bold text-ink transition-colors hover:border-green/50 focus-visible:shadow-focus"
          to="/light/1"
        >
          입력 다시 보기
        </Link>
        <Link
          className="inline-flex min-h-12 items-center justify-center rounded-control border border-green-strong bg-green-strong px-5 py-3 text-base font-bold text-white transition-colors hover:bg-[#1F6F4E] focus-visible:shadow-focus"
          to={sessionId ? `/waiting/${sessionId}` : "/waiting"}
        >
          상대방을 기다리러 가기
        </Link>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-control px-5 py-2.5 text-sm font-bold text-ink-muted transition-colors hover:bg-green-tint focus-visible:shadow-focus"
          to="/"
        >
          처음으로
        </Link>
      </nav>
    </section>
  );
}
