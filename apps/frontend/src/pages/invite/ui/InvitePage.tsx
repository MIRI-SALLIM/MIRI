import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import {
  fetchInvitation,
  invitationQueryKey,
  JoinSessionButton,
  type Invitation,
} from "@/features/join-session";
import { Badge } from "@/shared/ui/badge";

const cardClassName = "flex flex-col gap-5 rounded-card border border-border bg-card p-6 sm:p-8";

function InvitationUnavailable() {
  return (
    <div className={cardClassName}>
      <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">
        사용할 수 없는 초대 링크예요
      </h2>
      <p className="text-sm leading-relaxed text-ink-muted">
        초대 코드가 만료됐거나 이미 사용됐어요.
      </p>
      <Link
        className="inline-flex min-h-12 items-center justify-center rounded-control border border-border bg-card px-5 py-3 text-base font-bold text-ink transition-colors hover:border-green/50 focus-visible:shadow-focus"
        to="/"
      >
        처음으로
      </Link>
    </div>
  );
}

function InvitationDetails({ invitation, code }: { code: string; invitation: Invitation }) {
  const modeLabel = invitation.mode === "light" ? "3분 모드" : invitation.mode;

  return (
    <div className={cardClassName}>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-green-strong">함께 답을 맞춰봐요</p>
        <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">
          파트너가 함께 해보자고 초대했어요
        </h2>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone="green">{modeLabel}</Badge>
        <Badge>예상 소요 {invitation.duration}</Badge>
      </div>

      <div className="flex flex-col gap-2 rounded-control bg-canvas p-4">
        <p className="font-bold text-ink">둘 다 답변을 마치면 결과를 동시에 공개해요.</p>
        <p className="text-sm leading-relaxed text-ink-muted">
          답변은 결과가 준비될 때까지 상대에게 보이지 않아요.
        </p>
      </div>

      <JoinSessionButton code={code} />
    </div>
  );
}

export function InvitePage() {
  const { code = "" } = useParams();
  const invitationQuery = useQuery({
    enabled: code !== "",
    queryFn: () => fetchInvitation(code),
    queryKey: invitationQueryKey(code),
    retry: false,
  });

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-16 sm:px-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">초대 참여</h1>
        <p className="text-base leading-relaxed text-ink-muted">
          초대 링크를 확인하고 두 사람의 답을 시작해 보세요.
        </p>
      </div>

      {invitationQuery.isPending ? (
        <p aria-live="polite" className="text-sm text-ink-muted">
          초대 내용을 불러오는 중이에요
        </p>
      ) : invitationQuery.isError || invitationQuery.data === undefined ? (
        <InvitationUnavailable />
      ) : (
        <InvitationDetails code={code} invitation={invitationQuery.data} />
      )}
    </section>
  );
}
