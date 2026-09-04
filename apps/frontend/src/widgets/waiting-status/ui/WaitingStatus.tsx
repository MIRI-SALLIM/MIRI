import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { activeSessionQueryKey, fetchActiveSession } from "@/entities/session";
import { lightResultQueryKey } from "@/features/get-light-result";
import { useSessionStatus } from "@/features/poll-session-status";
import { sendNudge } from "@/features/send-nudge";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";

export interface WaitingStatusProps {
  sessionId: string;
}

const COPIED_FEEDBACK_MS = 1_600;

const cardClassName = "flex flex-col gap-4 rounded-card border border-border bg-card p-6 sm:p-8";

function toNudgeMessage(error: unknown): string {
  if (error instanceof ApiError && error.kind === "rate-limited") {
    return "알림은 24시간에 한 번만 보낼 수 있어요. 내일 다시 시도해 주세요.";
  }

  if (error instanceof ApiError && error.kind === "expired") {
    return "이 세션은 만료됐어요.";
  }

  return "알림을 보내지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function LockedPreview() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-canvas p-8 text-center">
      <svg
        aria-label="잠긴 결과 미리보기"
        className="size-10 text-ink-subtle"
        fill="none"
        role="img"
        stroke="currentColor"
        strokeWidth="1.6"
        viewBox="0 0 24 24"
      >
        <rect height="10" rx="2" width="14" x="5" y="11" />
        <path d="M8.5 11V8a3.5 3.5 0 1 1 7 0v3" strokeLinecap="round" />
      </svg>
      <p className="text-sm text-ink-muted">둘 다 제출하면 여기서 결과가 함께 열려요.</p>
    </div>
  );
}

export function WaitingStatus({ sessionId }: WaitingStatusProps) {
  const { isExpired, isFailed, isPending, isReady, status } = useSessionStatus(sessionId);
  const [isCopied, setIsCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const partnerJoined = status?.partnerJoined ?? false;

  // 초대 코드는 저장하지 않는다. 다시 공유해야 할 때만 쿠키로 조회한다.
  const activeSession = useQuery({
    enabled: status !== null && !isReady && !partnerJoined,
    queryFn: fetchActiveSession,
    queryKey: activeSessionQueryKey,
  });

  const nudge = useMutation({ mutationFn: () => sendNudge(sessionId) });
  const queryClient = useQueryClient();

  // 대기 중에 캐시된 waiting 결과가 남아 있으면 결과 화면이 다시 대기로 튕긴다.
  useEffect(() => {
    if (isReady) {
      queryClient.removeQueries({ queryKey: lightResultQueryKey(sessionId) });
    }
  }, [isReady, queryClient, sessionId]);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) {
        clearTimeout(copyTimer.current);
      }
    },
    [],
  );

  const inviteUrl =
    activeSession.data === undefined
      ? null
      : `${window.location.origin}/invite/${activeSession.data.invitationCode}`;

  const copyInviteUrl = async () => {
    if (inviteUrl === null) {
      return;
    }

    await navigator.clipboard?.writeText(inviteUrl);
    setIsCopied(true);

    if (copyTimer.current !== null) {
      clearTimeout(copyTimer.current);
    }

    copyTimer.current = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
  };

  if (isExpired) {
    return (
      <div className={cardClassName}>
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">이 세션은 만료됐어요</h2>
        <p className="text-sm leading-relaxed text-ink-muted">
          입력한 내용은 만료와 함께 지워졌어요. 새로 시작하면 다시 초대할 수 있어요.
        </p>
        <Link
          className="inline-flex min-h-12 items-center justify-center rounded-control border border-border bg-card px-5 py-3 text-base font-bold text-ink transition-colors hover:border-green/50 focus-visible:shadow-focus"
          to="/"
        >
          처음으로
        </Link>
      </div>
    );
  }

  if (isPending) {
    return (
      <p aria-live="polite" className="text-sm text-ink-muted">
        상태를 불러오는 중이에요
      </p>
    );
  }

  if (isFailed || status === null) {
    return (
      <div className={cardClassName}>
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">
          상태를 불러오지 못했어요
        </h2>
        <p className="text-sm leading-relaxed text-ink-muted">
          연결이 회복되면 자동으로 다시 확인해요.
        </p>
      </div>
    );
  }

  if (isReady) {
    return (
      <div className={cardClassName}>
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">결과가 준비됐어요</h2>
        <p className="text-sm leading-relaxed text-ink-muted">
          둘 다 제출을 끝냈어요. 이제 같은 화면을 함께 볼 수 있어요.
        </p>
        <Link
          className="inline-flex min-h-12 items-center justify-center rounded-control border border-green-strong bg-green-strong px-5 py-3 text-base font-bold text-white transition-colors hover:bg-[#1F6F4E] focus-visible:shadow-focus"
          to={`/result/light/${sessionId}`}
        >
          결과 보기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={cardClassName}>
        {partnerJoined ? (
          <>
            <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">
              상대가 답을 고르는 중이에요
            </h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              상대가 제출하면 이 화면이 바로 결과로 바뀌어요. 기다리기 지루하면 알림을 보내볼까요?
            </p>
            <Button disabled={nudge.isPending} onClick={() => nudge.mutate()}>
              알림 보내기
            </Button>
            <p aria-live="polite" className="min-h-5 text-sm font-semibold text-ink-muted">
              {nudge.isSuccess ? "상대에게 알림을 보냈어요." : null}
              {nudge.isError ? toNudgeMessage(nudge.error) : null}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">
              아직 상대가 들어오지 않았어요
            </h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              초대 링크를 한 번 더 보내볼까요? 링크를 받은 사람만 이 세션에 참여할 수 있어요.
            </p>
            {inviteUrl === null ? (
              <p className="text-sm text-ink-muted">초대 링크를 불러오는 중이에요</p>
            ) : (
              <Button onClick={copyInviteUrl} variant="secondary">
                {isCopied ? "복사됨" : "초대 링크 복사"}
              </Button>
            )}
          </>
        )}
      </div>

      <LockedPreview />
    </div>
  );
}
