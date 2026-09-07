import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { updateDeepPlan, type DeepPlanInput, type DeepPlanResponse } from "@/entities/deep-plan";
import { isApiErrorCode } from "@/shared/api";
import { Button } from "@/shared/ui/button";

export interface SaveDeepPlanButtonProps {
  expectedVersion: number;
  onConflict: () => void;
  onSuccess: (response: DeepPlanResponse) => void;
  plan: DeepPlanInput;
  sessionId: string;
}

function errorMessage(error: unknown): string {
  if (isApiErrorCode(error, "PLAN_VERSION_CONFLICT")) return "다른 사람이 계획을 바꿨어요. 최신 계획을 다시 확인하고 저장할지 정해 주세요.";
  if (isApiErrorCode(error, "PLAN_LOCKED")) return "한쪽이 제출해 계획이 잠겼어요. 현재 계획을 읽기 전용으로 보여 드릴게요.";
  return "계획을 저장하지 못했어요. 입력을 확인한 뒤 다시 시도해 주세요.";
}

export function SaveDeepPlanButton({ expectedVersion, onConflict, onSuccess, plan, sessionId }: SaveDeepPlanButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => updateDeepPlan(sessionId, expectedVersion, plan),
    onError: (error) => {
      if (isApiErrorCode(error, "PLAN_VERSION_CONFLICT") || isApiErrorCode(error, "PLAN_LOCKED")) onConflict();
    },
    onSuccess: (response) => {
      setConfirming(false);
      onSuccess(response);
    },
  });

  if (confirming) {
    return (
      <div className="space-y-3 rounded-control border border-amber-300 bg-amber-50 p-4">
        <p className="text-sm leading-relaxed text-ink" role="alert">계획을 저장하면 두 사람의 확인이 풀려요. 저장할까요?</p>
        <div className="flex flex-wrap gap-3">
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "저장하는 중이에요" : "저장할까요"}</Button>
          <Button disabled={mutation.isPending} onClick={() => setConfirming(false)} variant="secondary">계속 수정할게요</Button>
        </div>
        {mutation.isError ? <p aria-live="polite" className="text-sm font-semibold text-red-700" role="alert">{errorMessage(mutation.error)}</p> : null}
      </div>
    );
  }

  return <Button disabled={mutation.isPending} onClick={() => setConfirming(true)}>{mutation.isPending ? "저장하는 중이에요" : "계획 저장하기"}</Button>;
}
