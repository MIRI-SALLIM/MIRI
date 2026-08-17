import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";

import {
  ACTIVE_SESSION_STORAGE_KEY,
  activeSessionQueryKey,
  createSession,
} from "../api/create-session";
import { NicknameDialog } from "./NicknameDialog";

export interface StartLightButtonProps {
  className?: string;
  label?: string;
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError && error.kind === "validation") {
    return "닉네임을 다시 확인해 주세요.";
  }

  if (error instanceof ApiError && error.kind === "rate-limited") {
    return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
  }

  return "세션을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function StartLightButton({
  className = "",
  label = "가볍게 맞춰보기",
}: StartLightButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const startSession = useMutation({
    mutationFn: createSession,
    onSuccess: async (session) => {
      // 공개 세션 ID만 남긴다. 닉네임은 요청 본문에만 쓰고 버린다.
      sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
      await queryClient.invalidateQueries({ queryKey: activeSessionQueryKey });
      setIsDialogOpen(false);
      navigate("/light/1");
    },
  });

  const closeDialog = () => {
    startSession.reset();
    setIsDialogOpen(false);
  };

  return (
    <>
      <Button className={className} fullWidth onClick={() => setIsDialogOpen(true)}>
        {label}
      </Button>

      {isDialogOpen ? (
        <NicknameDialog
          isSubmitting={startSession.isPending}
          onCancel={closeDialog}
          onSubmit={(nickname) => startSession.mutate({ nickname })}
          submitError={startSession.error === null ? null : toMessage(startSession.error)}
        />
      ) : null}
    </>
  );
}
