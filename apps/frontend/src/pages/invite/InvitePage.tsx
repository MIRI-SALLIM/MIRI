import { useParams } from "react-router-dom";
import { JoinInvitationCard } from "@/features/join-invitation";
import { AppShell } from "@/widgets/app-shell";

export function InvitePage() {
  const { code } = useParams<{ code: string }>();

  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-5 py-12 sm:py-20">
        <JoinInvitationCard code={code || ""} />
      </div>
    </AppShell>
  );
}
