import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStatusQuery } from "@/entities/session";
import { apiClient, parseApiError } from "@/shared/api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

interface WaitingPartnerViewProps {
  sessionId: string;
}

export function WaitingPartnerView({ sessionId }: WaitingPartnerViewProps) {
  const navigate = useNavigate();
  const { data: status, isLoading } = useSessionStatusQuery(sessionId);

  const [isNudging, setIsNudging] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invitationCode = sessionStorage.getItem("mrs_invitation_code") || "";
  const inviteUrl = `${window.location.origin}/invite/${invitationCode}`;

  // 상대방이 제출을 완료하면 자동으로 결과 화면으로 이동
  useEffect(() => {
    if (status?.partnerCompleted) {
      navigate(`/result/${sessionId}`);
    }
  }, [status?.partnerCompleted, sessionId, navigate]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNudge = async () => {
    setIsNudging(true);
    setNudgeMessage(null);

    try {
      const { data, error, response } = await apiClient.POST(
        "/api/v1/sessions/{session_id}/nudge",
        {
          params: { path: { session_id: sessionId } },
        }
      );

      if (error || !data) {
        throw parseApiError(error, response.status);
      }

      setNudgeMessage("상대방에게 참여 알림을 전송했습니다!");
    } catch (err) {
      const parsed = parseApiError(err);
      setNudgeMessage(parsed.message);
    } finally {
      setIsNudging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center animate-fadeup">
        <p className="text-sm font-medium text-ink-muted">상태를 확인하고 있습니다...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeup">
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <Badge tone="purple">내 답변 제출 완료</Badge>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          상대방의 답변을 <br />
          기다리고 있어요
        </h1>
        <p className="mt-3 text-sm text-ink-muted leading-relaxed max-w-md mx-auto">
          미리살림은 두 분의 생각이 왜곡 없이 전달되도록, 두 사람이 모두 답변을 마친
          뒤에만 결과를 함께 공개합니다.
        </p>

        {/* 대기 펄스 애니메이션 */}
        <div className="my-8 flex justify-center items-center gap-2">
          <span className="size-3 rounded-full bg-green animate-ping" />
          <span className="size-3 rounded-full bg-purple-strong animate-bounce" />
          <span className="size-3 rounded-full bg-green animate-pulse" />
        </div>

        {/* 상태별 액션 카드 */}
        {!status?.partnerJoined ? (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-canvas p-5 text-left">
            <p className="text-xs font-bold text-ink">아직 상대방이 입장하지 않았나요?</p>
            <p className="mt-1 text-xs text-ink-muted leading-relaxed">
              아래 초대 링크를 복사하여 카카오톡이나 메시지로 배우자/연인에게 전달해 주세요.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-ink-muted select-all"
              />
              <Button type="button" variant="secondary" onClick={handleCopyLink} className="shrink-0 text-xs">
                {copied ? "복사됨!" : "링크 복사"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-border bg-purple-tint/30 p-5">
            <p className="text-xs font-bold text-purple-strong">
              상대방이 참여하여 답변을 작성하고 있습니다!
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              답변이 조금 늦어지면 살짝 넛지(알림)를 보내보세요.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-4"
              onClick={handleNudge}
              disabled={isNudging}
            >
              {isNudging ? "알림 보내는 중..." : "상대방에게 넛지 보내기"}
            </Button>
          </div>
        )}

        {nudgeMessage && (
          <p className="mt-4 text-xs font-medium text-purple-strong animate-fadeup">
            {nudgeMessage}
          </p>
        )}
      </div>
    </div>
  );
}
