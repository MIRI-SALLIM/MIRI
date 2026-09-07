import { useMutation } from "@tanstack/react-query";

import { confirmDeepPlan, type DeepPlanResponse } from "@/entities/deep-plan";
import { isApiErrorCode } from "@/shared/api";
import { Button } from "@/shared/ui/button";

export interface ConfirmDeepPlanButtonProps {
  disabled?: boolean;
  onConflict: () => void;
  onSuccess: (response: DeepPlanResponse) => void;
  planVersion: number;
  sessionId: string;
}

function errorMessage(error: unknown): string {
  if (isApiErrorCode(error, "PLAN_VERSION_CONFLICT")) return "최신 계획 버전과 달라요. 계획을 다시 확인한 뒤 확인해 주세요.";
  if (isApiErrorCode(error, "PLAN_LOCKED")) return "한쪽이 제출해 계획이 잠겼어요. 현재 계획을 읽기 전용으로 보여 드릴게요.";
  return "계획을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function ConfirmDeepPlanButton({ disabled = false, onConflict, onSuccess, planVersion, sessionId }: ConfirmDeepPlanButtonProps) {
  const mutation = useMutation({
    mutationFn: () => confirmDeepPlan(sessionId, planVersion),
    onError: (error) => {
      if (isApiErrorCode(error, "PLAN_VERSION_CONFLICT") || isApiErrorCode(error, "PLAN_LOCKED")) onConflict();
    },
    onSuccess,
  });

  return (
    <div className="flex flex-col items-start gap-3">
      <Button disabled={disabled || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "확인하는 중이에요" : "이 계획 확인하기"}</Button>
      {mutation.isError ? <p aria-live="polite" className="text-sm font-semibold text-red-700" role="alert">{errorMessage(mutation.error)}</p> : null}
    </div>
  );
}
