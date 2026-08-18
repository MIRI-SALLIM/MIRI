import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";

import { joinSession } from "../api/join-session";

export interface JoinSessionButtonProps {
  code: string;
}

function joinErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.kind === "conflict") {
    return "이 초대는 이미 다른 사람이 참여했어요.";
  }

  if (error instanceof ApiError && error.kind === "not-found") {
    return "이 초대 링크는 더 이상 사용할 수 없어요.";
  }

  return "참여하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function JoinSessionButton({ code }: JoinSessionButtonProps) {
  const navigate = useNavigate();
  const joinMutation = useMutation({
    mutationFn: () => joinSession(code),
    onSuccess: (session) => {
      sessionStorage.setItem("activeSessionId", session.id);
      navigate("/light/1");
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <Button disabled={joinMutation.isPending} fullWidth onClick={() => joinMutation.mutate()}>
        {joinMutation.isPending ? "참여하는 중이에요" : "참여하고 시작하기"}
      </Button>
      <p aria-live="polite" className="min-h-5 text-sm font-semibold text-ink-muted">
        {joinMutation.isError ? joinErrorMessage(joinMutation.error) : null}
      </p>
    </div>
  );
}
