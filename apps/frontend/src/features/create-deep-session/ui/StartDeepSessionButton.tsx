import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";

import { createDeepSession, saveActiveDeepSessionId } from "@/entities/deep-session";
import { ApiError, createIdempotencyKey } from "@/shared/api";
import { Button } from "@/shared/ui/button";

function toMessage(error: unknown): string {
  if (error instanceof ApiError && error.kind === "unauthorized") {
    return "로그인 후 딥모드를 시작해 주세요.";
  }

  if (error instanceof ApiError && error.kind === "rate-limited") {
    return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
  }

  return "세션을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function StartDeepSessionButton() {
  const navigate = useNavigate();
  const attemptKey = useRef<string | null>(null);
  const createMutation = useMutation({
    mutationFn: () => {
      attemptKey.current ??= createIdempotencyKey();
      return createDeepSession(attemptKey.current);
    },
    onSuccess: async (session) => {
      attemptKey.current = null;
      saveActiveDeepSessionId(session.id);
      navigate(
        `/deep/waiting/${encodeURIComponent(session.id)}?inviteCode=${encodeURIComponent(session.invitationCode)}&role=${session.role}`,
      );
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <Button disabled={createMutation.isPending} fullWidth onClick={() => createMutation.mutate()}>
        {createMutation.isPending ? "세션을 만드는 중이에요" : "딥 세션 시작하기"}
      </Button>
      {createMutation.isError ? (
        <p aria-live="polite" className="text-sm font-semibold text-red-600" role="alert">
          {toMessage(createMutation.error)}
        </p>
      ) : null}
    </div>
  );
}
