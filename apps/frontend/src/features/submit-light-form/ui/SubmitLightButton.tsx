import { Button } from "@/shared/ui/button";

export interface SubmitLightButtonProps {
  className?: string;
  disabled?: boolean;
  isPending?: boolean;
  onClick: () => void;
}

export function SubmitLightButton({
  className = "",
  disabled = false,
  isPending = false,
  onClick,
}: SubmitLightButtonProps) {
  return (
    <Button
      className={`!min-h-[52px] !flex-[1_1_200px] !gap-2.5 !rounded-[14px] !border-transparent !bg-green !px-5 !py-0 !text-[16.5px] !font-bold !text-white hover:!brightness-[.94] active:!translate-y-px ${className}`}
      disabled={disabled || isPending}
      onClick={onClick}
    >
      {isPending ? "제출하는 중..." : "입력 완료하기"}
      <span aria-hidden="true" className="text-[18px]">
        →
      </span>
    </Button>
  );
}
