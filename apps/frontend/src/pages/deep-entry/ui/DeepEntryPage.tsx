import { useQuery } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAccount } from "@/entities/account";
import {
  deepSessionStatusQueryKey,
  fetchDeepSessionStatus,
  readActiveDeepSessionId,
} from "@/entities/deep-session";
import { StartDeepSessionButton } from "@/features/create-deep-session";
import { Button } from "@/shared/ui/button";

const cardClassName = "flex flex-col gap-4 rounded-card border border-border bg-card p-6 sm:p-8";

export function DeepEntryPage() {
  const { state } = useAccount();
  const navigate = useNavigate();
  const [invitationCode, setInvitationCode] = useState("");
  const activeSessionId = readActiveDeepSessionId();
  const activeSessionQuery = useQuery({
    enabled: state === "authenticated" && activeSessionId !== null,
    queryFn: () => fetchDeepSessionStatus(activeSessionId as string),
    queryKey: deepSessionStatusQueryKey(activeSessionId ?? ""),
    retry: false,
  });

  const openInvitation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = invitationCode.trim();
    if (code !== "") {
      navigate(`/deep/invite/${encodeURIComponent(code)}`);
    }
  };

  const hasActiveSession = activeSessionId !== null && activeSessionQuery.data !== undefined;

  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-7 px-5 py-16 sm:px-8">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">제대로 계산해보기</h1>
      </div>

      {state === "loading" ? (
        <p className="text-ink-muted" role="status">
          로그인 상태를 확인하고 있어요.
        </p>
      ) : state === "disabled" ? (
        <p className="rounded-control border border-border-control bg-card p-4 text-ink-muted" role="alert">
          현재 딥모드를 사용할 수 없어요. 이 배포에서는 관련 기능이 아직 활성화되지 않았어요.
        </p>
      ) : state === "error" ? (
        <p className="rounded-control border border-border-control bg-card p-4 text-ink-muted" role="alert">
          로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : state === "unauthenticated" ? (
        <div className="space-y-4">
          <p className="text-ink-muted">딥모드는 카카오 로그인 후 이용할 수 있어요.</p>
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-control border border-purple-strong bg-purple-strong px-5 py-3 font-bold text-white transition-[background-color,translate] duration-[160ms] ease-smooth hover:bg-[#563C96] focus-visible:shadow-focus active:translate-y-px"
            to="/login"
          >
            카카오로 로그인하기
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {activeSessionId !== null && activeSessionQuery.isPending ? (
            <p aria-live="polite" className="text-sm text-ink-muted" role="status">
              진행 중인 세션을 확인하고 있어요.
            </p>
          ) : activeSessionId !== null && activeSessionQuery.data !== undefined ? (
            <div className={cardClassName}>
              <h2 className="text-xl font-extrabold tracking-[-0.02em]">진행 중인 세션이 있어요</h2>
              <p className="text-sm leading-relaxed text-ink-muted">
                이어서 참여하면 현재 상태를 다시 확인할 수 있어요.
              </p>
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-control border border-purple-strong bg-purple-strong px-5 py-3 font-bold text-white transition-colors hover:bg-[#563C96] focus-visible:shadow-focus"
                to={`/deep/waiting/${encodeURIComponent(activeSessionId)}`}
              >
                이어서 하기
              </Link>
            </div>
          ) : null}

          {/* 진행 중인 세션이 확인됐으면 새로 만들 길을 열어 두지 않는다. 새로 만들면 저장된
              UUID가 덮어써져 기존 세션의 복구 경로가 사라지고 생성 레이트리밋도 쓴다. */}
          {hasActiveSession ? null : (
          <>
          <div className={cardClassName}>
            <div>
              <h2 className="text-xl font-extrabold tracking-[-0.02em]">새 세션을 시작해요</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                세션을 만들고 초대 링크를 보내면 두 사람이 함께 시작할 수 있어요.
              </p>
            </div>
            <StartDeepSessionButton />
          </div>

          <div className={cardClassName}>
            <div>
              <h2 className="text-xl font-extrabold tracking-[-0.02em]">초대 코드로 참여해요</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                받은 초대 코드만 입력하면 같은 세션에 들어갈 수 있어요.
              </p>
            </div>
            <form className="flex flex-col gap-3" onSubmit={openInvitation}>
              <label className="flex flex-col gap-2 text-sm font-bold" htmlFor="deep-invitation-code">
                초대 코드
                <input
                  className="min-h-12 rounded-control border border-border-control bg-card px-4 text-base font-normal outline-none transition-[border-color,box-shadow] focus:border-purple-strong focus:shadow-focus"
                  id="deep-invitation-code"
                  onChange={(event) => setInvitationCode(event.target.value)}
                  placeholder="초대 코드를 입력해 주세요"
                  value={invitationCode}
                />
              </label>
              <Button disabled={invitationCode.trim() === ""} type="submit" variant="secondary">
                초대 확인하기
              </Button>
            </form>
          </div>
          </>
          )}
        </div>
      )}
    </section>
  );
}
