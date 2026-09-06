import { Link, useParams } from "react-router-dom";

import { JoinDeepSessionButton } from "@/features/join-deep-session";

const cardClassName = "flex flex-col gap-5 rounded-card border border-border bg-card p-6 sm:p-8";

export function DeepInvitePage() {
  const { code = "" } = useParams();

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-16 sm:px-8">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드</p>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">딥 모드 초대 참여</h1>
        <p className="text-base leading-relaxed text-ink-muted">
          초대받은 세션에 참여하면 두 사람이 함께 계획을 시작할 수 있어요.
        </p>
      </div>

      {code === "" ? (
        <div className={cardClassName}>
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">초대 코드를 확인할 수 없어요</h2>
          <p className="text-sm leading-relaxed text-ink-muted">초대 링크를 다시 받아 열어 주세요.</p>
          <Link className="text-sm font-bold text-purple-strong underline" to="/deep">
            딥모드 첫 화면으로
          </Link>
        </div>
      ) : (
        <div className={cardClassName}>
          <div className="rounded-control bg-purple-tint p-4">
            <p className="text-sm font-bold text-purple-strong">초대 코드</p>
            <p className="mt-1 break-all font-mono text-sm text-ink">{code}</p>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">
            본인이 만든 세션에는 참여할 수 없어요. 이미 두 사람이 참여했다면 안내를 확인하고 새 초대를 받아 주세요.
          </p>
          <JoinDeepSessionButton code={code} />
          <Link className="text-center text-sm font-bold text-purple-strong underline" to="/login">
            로그인 화면으로
          </Link>
        </div>
      )}
    </section>
  );
}
