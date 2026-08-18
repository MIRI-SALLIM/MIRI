import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInvitationQuery } from "@/entities/session";
import { apiClient, parseApiError } from "@/shared/api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

interface JoinInvitationCardProps {
  code: string;
}

export function JoinInvitationCard({ code }: JoinInvitationCardProps) {
  const navigate = useNavigate();
  const { data: invitation, isLoading: isChecking, error: inviteError } = useInvitationQuery(code);
  const [nickname, setNickname] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  if (isChecking) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center animate-fadeup">
        <p className="text-sm font-medium text-ink-muted">초대장 정보를 확인하고 있습니다...</p>
      </div>
    );
  }

  if (inviteError || !invitation) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/50 p-8 text-center animate-fadeup">
        <Badge tone="neutral">초대장 오류</Badge>
        <h2 className="mt-4 text-xl font-bold text-ink">초대장을 찾을 수 없습니다</h2>
        <p className="mt-2 text-sm text-ink-muted leading-relaxed">
          유효하지 않거나 만료된 초대 링크입니다. 상대방에게 새로운 초대 링크를 요청해 주세요.
        </p>
        <Button variant="secondary" className="mt-6" onClick={() => navigate("/")}>
          홈으로 돌아가기
        </Button>
      </div>
    );
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setJoinError("닉네임을 입력해 주세요.");
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      const { data, error, response } = await apiClient.POST(
        "/api/v1/invitations/{code}/join",
        {
          params: { path: { code } },
          body: { nickname: nickname.trim() },
        }
      );

      if (error || !data) {
        throw parseApiError(error, response.status);
      }

      sessionStorage.setItem("mrs_session_id", data.id);
      sessionStorage.setItem("mrs_invitation_code", data.invitationCode);

      navigate(`/light?sessionId=${data.id}`);
    } catch (err) {
      const parsed = parseApiError(err);
      setJoinError(parsed.message);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 animate-fadeup">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="green">{invitation.duration} 대화 초대</Badge>
        <span className="text-xs font-medium text-ink-muted">코드: {code}</span>
      </div>

      <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
        결혼 전 돈 이야기, <br />
        함께 시작해볼까요?
      </h1>
      <p className="mt-3 text-sm text-ink-muted leading-relaxed">
        상대방이 보낸 3분 진단 초대에 참여합니다. 본인의 닉네임을 입력하고 시작해 주세요.
      </p>

      <form onSubmit={handleJoin} className="mt-8 space-y-4">
        <div>
          <label htmlFor="join-nickname" className="block text-xs font-bold text-ink mb-1.5">
            참여자 닉네임 (1~20자)
          </label>
          <input
            id="join-nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 예신이"
            maxLength={20}
            autoFocus
            className="w-full rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-ink placeholder:text-ink-muted/50 focus:border-green focus:outline-none focus:ring-2 focus:ring-green/20 transition-all"
          />
        </div>

        {joinError && (
          <p className="text-xs font-medium text-red-500 animate-fadeup">{joinError}</p>
        )}

        <Button
          type="submit"
          className="w-full mt-2"
          disabled={isJoining || !nickname.trim()}
        >
          {isJoining ? "참여하는 중..." : "대화 참여하기"}
        </Button>
      </form>
    </div>
  );
}
