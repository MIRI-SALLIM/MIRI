import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { useDeepSessionStatus } from "@/features/poll-deep-status";
import { WithdrawDeepSessionButton } from "@/features/withdraw-deep-session";
import { Button } from "@/shared/ui/button";

const cardClassName = "flex flex-col gap-4 rounded-card border border-border bg-card p-6 sm:p-8";

function InviteCodeCard({ code, role }: { code: string; role: "A" | "B" | null }) {
  const [isCopied, setIsCopied] = useState(false);

  if (role !== "A") {
    return null;
  }

  // 현재 URL은 대기 화면이라 상대가 열어도 참여할 수 없다. 참여 라우트를 만들어 복사한다.
  const inviteUrl = `${window.location.origin}/deep/invite/${encodeURIComponent(code)}`;

  const copyLink = async () => {
    await navigator.clipboard?.writeText(inviteUrl);
    setIsCopied(true);
  };

  if (code === "") {
    return (
      <div className={cardClassName}>
        <h2 className="text-xl font-extrabold tracking-[-0.02em]">초대 링크를 다시 만들 수 없어요</h2>
        <p className="text-sm leading-relaxed text-ink-muted">
          초대 코드는 새로 조회할 수 없어요. 현재 세션을 닫으면 딥모드 첫 화면에서 새 세션을 시작할 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className={cardClassName}>
      <div>
        <h2 className="text-xl font-extrabold tracking-[-0.02em]">상대를 초대해요</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">아래 링크를 상대에게 보내면 같은 세션에 참여할 수 있어요.</p>
      </div>
      <p className="break-all rounded-control bg-purple-tint p-4 font-mono text-sm text-ink" data-testid="deep-invite-url">{inviteUrl}</p>
      <Button onClick={copyLink} variant="secondary">
        {isCopied ? "초대 링크를 복사했어요" : "초대 링크 복사"}
      </Button>
    </div>
  );
}

export function DeepWaitingPage() {
  const { sessionId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("inviteCode") ?? "";
  const roleParam = searchParams.get("role");
  const role = roleParam === "A" || roleParam === "B"
    ? roleParam
    : null;
  const waitingPath = `/deep/waiting/${encodeURIComponent(sessionId)}`;
  const status = useDeepSessionStatus(sessionId);

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-16 sm:px-8">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드</p>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">
          {role === "B" ? "딥 세션에 참여했어요" : "딥 세션이 열렸어요"}
        </h1>
        <p className="text-base leading-relaxed text-ink-muted">
          {role === "A"
            ? "상대를 초대하고, 기다리지 않고 바로 시작할 수 있어요. 서로의 개인 답변은 공유하기 전까지 보이지 않아요."
            : "계획과 내 현황을 상대를 기다리지 않고 채울 수 있어요. 서로의 개인 답변은 공유하기 전까지 보이지 않아요."}
        </p>
      </div>

      {status.isPending ? (
        <p aria-live="polite" className="text-sm text-ink-muted" role="status">
          세션 상태를 확인하고 있어요.
        </p>
      ) : status.isExpired ? (
        <div className={cardClassName}>
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">세션이 만료됐어요</h2>
          <p className="text-sm leading-relaxed text-ink-muted">새 세션을 시작하면 다시 초대할 수 있어요.</p>
          <Link className="font-bold text-purple-strong underline" to="/deep">딥모드 첫 화면으로</Link>
        </div>
      ) : status.terminalError === "unauthorized" ? (
        <div className={cardClassName}>
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">로그인이 만료됐어요</h2>
          <p className="text-sm leading-relaxed text-ink-muted">다시 로그인하면 세션 상태를 확인할 수 있어요.</p>
          <Link
            className="font-bold text-purple-strong underline"
            to={`/login?returnTo=${encodeURIComponent(waitingPath)}`}
          >
            로그인하기
          </Link>
        </div>
      ) : status.terminalError === "not-found" ? (
        <div className={cardClassName}>
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">세션을 찾을 수 없어요</h2>
          <p className="text-sm leading-relaxed text-ink-muted">딥모드 첫 화면에서 새 세션을 시작할 수 있어요.</p>
          <Link className="font-bold text-purple-strong underline" to="/deep">딥모드 첫 화면으로</Link>
        </div>
      ) : status.isFailed || status.status === null ? (
        <div className={cardClassName}>
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">세션 상태를 불러오지 못했어요</h2>
          <p className="text-sm leading-relaxed text-ink-muted">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
          <Button onClick={() => void status.refetch()} variant="secondary">다시 확인하기</Button>
        </div>
      ) : (
        <div className={cardClassName}>
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">
            {status.isReady ? "두 사람 모두 제출했어요" : "지금 시작할 수 있어요"}
          </h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            {status.isReady
              ? "함께 볼 결과가 준비됐어요."
              : status.status?.mySubmitted
                ? "내 제출은 끝났어요. 상대의 제출을 기다리고 있어요."
                : "계획과 내 현황은 상대를 기다리지 않고 채울 수 있어요."}
          </p>
        </div>
      )}

      <InviteCodeCard code={inviteCode} role={role} />

      {sessionId === "" ? null : (
        <div className="flex justify-end">
          <WithdrawDeepSessionButton sessionId={sessionId} />
        </div>
      )}
    </section>
  );
}
