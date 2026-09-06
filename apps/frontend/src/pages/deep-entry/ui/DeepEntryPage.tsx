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
import { isTerminalApiError } from "@/shared/api";
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

  // 조회 결과를 세 상태로 나눈다. `data === undefined` 하나로 판단하면 한 번의 503·타임아웃이
  // "진행 중 세션 없음"으로 읽혀 새 세션이 저장된 UUID를 덮어쓰고, 딥에는 세션 목록 조회가
  // 없으므로 원래 세션은 복구 경로를 영구히 잃는다.
  const activeSession: "none" | "pending" | "found" | "gone" | "unknown" =
    activeSessionId === null || state !== "authenticated"
      ? "none"
      : activeSessionQuery.isPending
        ? "pending"
        : activeSessionQuery.data !== undefined
          ? "found"
          : isTerminalApiError(activeSessionQuery.error)
            ? "gone" // 만료·삭제·권한 없음은 확정된 답이다. 새로 시작해도 된다.
            : "unknown"; // 일시적 실패는 답이 아니다. 새로 만들 길을 열지 않는다.

  const canStartNewSession = activeSession === "none" || activeSession === "gone";
  // "이어서 하기"가 가리킬 수 있는 id는 조회가 성공한 경우뿐이다. 값으로 드러내 두면
  // 링크가 빈 문자열로 렌더되는 폴백을 쓰지 않아도 된다.
  const resumableSessionId = activeSession === "found" ? activeSessionId : null;

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
          {activeSession === "pending" ? (
            <p aria-live="polite" className="text-sm text-ink-muted" role="status">
              진행 중인 세션을 확인하고 있어요.
            </p>
          ) : activeSession === "unknown" ? (
            <div className={cardClassName}>
              <h2 className="text-xl font-extrabold tracking-[-0.02em]">진행 중인 세션을 확인하지 못했어요</h2>
              <p className="text-sm leading-relaxed text-ink-muted">
                잠시 후 다시 시도해 주세요. 확인 전에 새로 시작하면 이전 세션으로 돌아갈 수 없어요.
              </p>
              <Button onClick={() => void activeSessionQuery.refetch()} variant="secondary">
                다시 확인하기
              </Button>
            </div>
          ) : resumableSessionId !== null ? (
            <div className={cardClassName}>
              <h2 className="text-xl font-extrabold tracking-[-0.02em]">진행 중인 세션이 있어요</h2>
              <p className="text-sm leading-relaxed text-ink-muted">
                이어서 참여하면 현재 상태를 다시 확인할 수 있어요.
              </p>
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-control border border-purple-strong bg-purple-strong px-5 py-3 font-bold text-white transition-colors hover:bg-[#563C96] focus-visible:shadow-focus"
                to={`/deep/waiting/${encodeURIComponent(resumableSessionId)}`}
              >
                이어서 하기
              </Link>
            </div>
          ) : null}

          {/* 진행 중인 세션이 확인됐으면 새로 만들 길을 열어 두지 않는다. 새로 만들면 저장된
              UUID가 덮어써져 기존 세션의 복구 경로가 사라지고 생성 레이트리밋도 쓴다. */}
          {canStartNewSession ? (
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
          ) : null}
        </div>
      )}
    </section>
  );
}
