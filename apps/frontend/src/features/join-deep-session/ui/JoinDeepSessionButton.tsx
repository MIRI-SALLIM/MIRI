import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";

import {
  joinDeepSession,
  saveActiveDeepSessionId,
} from "@/entities/deep-session";
import { ApiError, createIdempotencyKey, isDeepApiErrorCode } from "@/shared/api";
import { Button } from "@/shared/ui/button";

function joinErrorMessage(error: unknown): string {
  if (isDeepApiErrorCode(error, "SELF_INVITATION")) {
    return "내가 만든 세션에는 초대받아 참여할 수 없어요.";
  }

  if (isDeepApiErrorCode(error, "SESSION_FULL")) {
    return "이 세션은 이미 두 사람이 참여했어요.";
  }

  if (isDeepApiErrorCode(error, "IDEMPOTENCY_CONFLICT")) {
    return "참여 요청이 달라졌어요. 초대 링크를 다시 열어 주세요.";
  }

  if (error instanceof ApiError && error.kind === "unauthorized") {
    return "로그인 후 초대에 참여해 주세요.";
  }

  if (error instanceof ApiError && error.kind === "expired") {
    return "이 초대는 만료됐어요. 새 초대 링크를 받아 주세요.";
  }

  return "참여하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export interface JoinDeepSessionButtonProps {
  code: string;
}

export function JoinDeepSessionButton({ code }: JoinDeepSessionButtonProps) {
  const navigate = useNavigate();
  const attempt = useRef<{ code: string; key: string } | null>(null);
  const joinMutation = useMutation({
    mutationFn: () => {
      if (attempt.current?.code !== code) {
        attempt.current = { code, key: createIdempotencyKey() };
      }
      return joinDeepSession(code, attempt.current.key);
    },
    onSuccess: (session) => {
      attempt.current = null;
      saveActiveDeepSessionId(session.id);
      navigate(`/deep/waiting/${encodeURIComponent(session.id)}?inviteCode=${encodeURIComponent(session.invitationCode)}`);
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <Button disabled={joinMutation.isPending} fullWidth onClick={() => joinMutation.mutate()}>
        {joinMutation.isPending ? "참여하는 중이에요" : "딥 세션 참여하기"}
      </Button>
      <p aria-live="polite" className="min-h-5 text-sm font-semibold text-ink-muted" role="alert">
        {joinMutation.isError ? joinErrorMessage(joinMutation.error) : null}
      </p>
    </div>
  );
}
