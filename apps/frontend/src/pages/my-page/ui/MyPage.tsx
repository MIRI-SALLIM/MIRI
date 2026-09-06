import { Navigate } from "react-router-dom";

import { AccountAvatar, useAccount } from "@/entities/account";
import { LogoutButton } from "@/features/logout-account";

export function MyPage() {
  const account = useAccount();

  if (account.state === "unauthenticated") {
    return <Navigate replace to="/login" />;
  }

  const displayName = account.displayName?.trim() || "내 정보";

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-14 sm:px-8 sm:py-20">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">계정</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">내 정보</h1>
        <p className="text-base leading-relaxed text-ink-muted">연결된 계정 정보를 확인하고 로그인 상태를 관리해요.</p>
      </div>

      {account.state === "loading" ? (
        <p className="text-ink-muted" role="status">
          로그인 상태를 확인하고 있어요.
        </p>
      ) : account.state === "disabled" ? (
        <p className="rounded-control border border-border-control bg-card p-4 text-ink-muted" role="alert">
          현재 계정 정보를 사용할 수 없어요. 이 배포에서는 관련 기능이 아직 활성화되지 않았어요.
        </p>
      ) : account.state === "error" ? (
        <p className="rounded-control border border-border-control bg-card p-4 text-ink-muted" role="alert">
          로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : (
        <section aria-labelledby="profile-heading" className="rounded-card border border-border bg-card p-6 sm:p-8">
          <h2 className="sr-only" id="profile-heading">
            프로필
          </h2>
          <div className="flex items-center gap-4">
            <AccountAvatar className="size-16 text-xl" displayName={account.displayName} profileImageUrl={account.profileImageUrl} />
            <div>
              <p className="text-lg font-bold text-ink">{displayName}</p>
              <p className="mt-1 text-sm text-ink-muted">로그인되어 있어요.</p>
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-6">
            <LogoutButton />
          </div>
        </section>
      )}
    </section>
  );
}
