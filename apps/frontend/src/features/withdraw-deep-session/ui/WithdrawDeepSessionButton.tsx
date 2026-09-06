import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  clearActiveDeepSessionId,
  deepSessionStatusQueryKey,
  withdrawDeepSession,
} from "@/entities/deep-session";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";

function withdrawErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.kind === "expired") {
    return "이미 만료된 세션이에요. 딥모드 첫 화면으로 돌아가요.";
  }

  return "세션을 닫지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export interface WithdrawDeepSessionButtonProps {
  sessionId: string;
}

export function WithdrawDeepSessionButton({ sessionId }: WithdrawDeepSessionButtonProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const withdrawMutation = useMutation({
    mutationFn: () => withdrawDeepSession(sessionId),
    onSuccess: async () => {
      clearActiveDeepSessionId(sessionId);
      await queryClient.invalidateQueries({ queryKey: deepSessionStatusQueryKey(sessionId) });
      navigate("/deep");
    },
  });

  if (confirming) {
    return (
      <div className="flex flex-col gap-3 rounded-control border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-800">세션을 닫으면 다시 되돌릴 수 없어요. 닫을까요?</p>
        <div className="flex flex-wrap gap-3">
          <Button disabled={withdrawMutation.isPending} onClick={() => withdrawMutation.mutate()}>
            {withdrawMutation.isPending ? "닫는 중이에요" : "세션 닫기"}
          </Button>
          <Button disabled={withdrawMutation.isPending} onClick={() => setConfirming(false)} variant="secondary">
            계속하기
          </Button>
        </div>
        {withdrawMutation.isError ? (
          <p aria-live="polite" className="text-sm font-semibold text-red-700" role="alert">
            {withdrawErrorMessage(withdrawMutation.error)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Button onClick={() => setConfirming(true)} variant="ghost">
      세션 나가기
    </Button>
  );
}
