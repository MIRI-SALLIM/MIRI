import type { ButtonHTMLAttributes } from "react";

import { startKakaoLogin } from "../api/start-kakao-login";

export interface KakaoLoginButtonProps extends Pick<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  disabledReason?: string;
  returnTo?: string;
}

export function KakaoLoginButton({
  disabled = false,
  disabledReason,
  returnTo = "/deep",
}: KakaoLoginButtonProps) {
  const reasonId = "kakao-login-disabled-reason";

  return (
    <>
      <button
        aria-describedby={disabled && disabledReason ? reasonId : undefined}
        className="inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-control border border-border-control bg-[#FEE500] px-5 py-3 text-base font-bold text-[#191919] transition-[background-color,filter,translate] duration-[160ms] ease-smooth hover:bg-[#F4D900] focus-visible:shadow-focus active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => startKakaoLogin(returnTo)}
        type="button"
      >
        <svg aria-hidden="true" className="size-6 shrink-0" fill="none" viewBox="0 0 24 24">
          <path
            d="M12 3.5c-4.97 0-9 3.1-9 6.93 0 2.48 1.66 4.66 4.16 5.88l-.91 3.37a.38.38 0 0 0 .56.42l3.55-2.35c.53.08 1.08.12 1.64.12 4.97 0 9-3.1 9-6.93S16.97 3.5 12 3.5Z"
            fill="#191919"
          />
          <path d="m7.5 11.2 3.2 2.7 5.8-5.1" stroke="#FEE500" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
        </svg>
        카카오로 로그인
      </button>
      {disabled && disabledReason ? (
        <p className="mt-3 text-sm text-ink-muted" id={reasonId}>
          {disabledReason}
        </p>
      ) : null}
    </>
  );
}
