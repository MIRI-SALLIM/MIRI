import { Navigate, useSearchParams } from "react-router-dom";

import { useAccount, useAuthProviders } from "@/entities/account";
import { KakaoLoginButton } from "@/features/kakao-login";

// 기본 도착지는 랜딩이다. 헤더의 "로그인"은 모든 화면에 있으므로 여기서 /deep으로 보내면
// 결과 화면이 없는 F15 전까지 사용자가 두 번의 클릭으로 실세션을 만들 수 있게 된다.
// 초대 링크처럼 갈 곳이 분명한 경우에만 returnTo로 명시한다.
const DEFAULT_RETURN_TO = "/";

// 서버의 validate_return_to와 같은 범위만 허용한다. 넓히면 우리 화면이 오픈 리다이렉트가 된다.
const safeReturnTo = (value: string | null): string => {
  if (value === null || value.includes("//") || value.includes("..")) {
    return DEFAULT_RETURN_TO;
  }
  return value === "/deep" || value.startsWith("/deep/") ? value : DEFAULT_RETURN_TO;
};

export function LoginPage() {
  const { state } = useAccount();
  const { kakao } = useAuthProviders();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  if (state === "authenticated") {
    return <Navigate replace to={returnTo} />;
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
      ) : kakao === false ? (
        <KakaoLoginButton disabled disabledReason="현재 카카오 로그인을 사용할 수 없어요." />
      ) : (
        <KakaoLoginButton returnTo={returnTo} />
      )}
    </section>
  );
}
