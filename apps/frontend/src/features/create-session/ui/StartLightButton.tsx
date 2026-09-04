import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";

import {
  ACTIVE_SESSION_STORAGE_KEY,
  activeSessionQueryKey,
  createSession,
} from "../api/create-session";

export interface StartLightButtonProps {
  className?: string;
  label?: ReactNode;
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError && error.kind === "rate-limited") {
    return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
  }

  return "세션을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function StartLightButton({
  className = "",
  label = "가볍게 맞춰보기",
}: StartLightButtonProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const startSession = useMutation({
    mutationFn: createSession,
    onSuccess: async (session) => {
      // 공개 세션 ID만 남긴다.
      sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
      await queryClient.invalidateQueries({ queryKey: activeSessionQueryKey });
      navigate("/light/1");
    },
  });

  return (
    <>
      <Button
        className={className}
        disabled={startSession.isPending}
        fullWidth
        onClick={() => startSession.mutate()}
      >
        {label}
      </Button>

      {startSession.error === null ? null : (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {toMessage(startSession.error)}
        </p>
      )}
    </>
  );
}
