import { Navigate } from "react-router-dom";

import { useAccount } from "@/entities/account";
import { KakaoLoginButton } from "@/features/kakao-login";

export function LoginPage() {
  const { state } = useAccount();

  if (state === "authenticated") {
    return <Navigate replace to="/deep" />;
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-7 px-5 py-16 sm:px-8">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">제대로 계산해보기</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">카카오 로그인</h1>
        <p className="text-ink-muted">
          딥모드는 카카오 계정으로 시작할 수 있어요. 로그인 후 준비된 기능을 안내해 드릴게요.
        </p>
      </div>

      {state === "loading" ? (
        <p className="text-ink-muted" role="status">
          로그인 상태를 확인하고 있어요.
        </p>
      ) : state === "disabled" ? (
        <KakaoLoginButton
          disabled
          disabledReason="현재 로그인 기능을 사용할 수 없어요. 이 배포에서는 로그인 기능이 아직 활성화되지 않았어요."
        />
      ) : state === "error" ? (
        <p className="rounded-control border border-border-control bg-card p-4 text-ink-muted" role="alert">
          로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : (
        <KakaoLoginButton />
      )}
    </section>
  );
}
