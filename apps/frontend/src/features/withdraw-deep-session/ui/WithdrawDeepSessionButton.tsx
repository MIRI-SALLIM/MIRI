import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  clearActiveDeepSessionId,
  deepSessionInvitationQueryKey,
  deepSessionStatusQueryKey,
  withdrawDeepSession,
} from "@/entities/deep-session";
import { Button } from "@/shared/ui/button";

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
      queryClient.removeQueries({ queryKey: deepSessionInvitationQueryKey(sessionId) });
      await queryClient.invalidateQueries({ queryKey: deepSessionStatusQueryKey(sessionId) });
      navigate("/deep");
    },
  });

  if (confirming) {
    return (
      <div className="flex flex-col gap-3 rounded-control border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-800">
          세션을 닫으면 상대도 이 세션에서 나가게 되고, 입력과 결과를 다시 볼 수 없어요. 닫을까요?
        </p>
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
            세션을 닫지 못했어요. 잠시 후 다시 시도해 주세요.
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
