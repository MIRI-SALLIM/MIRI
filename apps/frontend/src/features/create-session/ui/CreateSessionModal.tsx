import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, parseApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateSessionModal({ isOpen, onClose }: CreateSessionModalProps) {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setErrorMessage("닉네임을 입력해 주세요.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data, error, response } = await apiClient.POST("/api/v1/sessions", {
        body: {
          nickname: nickname.trim(),
          mode: "light",
        },
      });

      if (error || !data) {
        throw parseApiError(error, response.status);
      }

      // 세션 ID를 세션 스토리지에 임시 보관
      sessionStorage.setItem("mrs_session_id", data.id);
      sessionStorage.setItem("mrs_invitation_code", data.invitationCode);

      onClose();
      navigate(`/light?sessionId=${data.id}`);
    } catch (err) {
      const parsed = parseApiError(err);
      setErrorMessage(parsed.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fadeup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <h2 id="modal-title" className="text-2xl font-extrabold tracking-tight text-ink">
          3분 대화 시작하기
        </h2>
        <p className="mt-2 text-sm text-ink-muted leading-relaxed">
          상대방에게 표시될 본인의 닉네임을 입력해 주세요. (예: 예랑이, 예신이)
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="nickname" className="block text-xs font-bold text-ink mb-1.5">
              닉네임 (1~20자)
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="예: 예랑이"
              maxLength={20}
              autoFocus
              className="w-full rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-ink placeholder:text-ink-muted/50 focus:border-green focus:outline-none focus:ring-2 focus:ring-green/20 transition-all"
            />
          </div>

          {errorMessage && (
            <p className="text-xs font-medium text-red-500 animate-fadeup">{errorMessage}</p>
          )}

          <div className="mt-6 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onClose}
              disabled={isLoading}
            >
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading || !nickname.trim()}>
              {isLoading ? "방 생성 중..." : "진단 시작"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
