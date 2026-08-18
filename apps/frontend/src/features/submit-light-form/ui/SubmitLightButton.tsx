import { Button } from "@/shared/ui/button";

export interface SubmitLightButtonProps {
  disabled?: boolean;
  isPending?: boolean;
  onClick: () => void;
}

export function SubmitLightButton({ disabled = false, isPending = false, onClick }: SubmitLightButtonProps) {
  return (
    <Button disabled={disabled || isPending} fullWidth onClick={onClick}>
      {isPending ? "제출하는 중..." : "입력 완료하기"}
    </Button>
  );
}
