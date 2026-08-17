import { useId, useState, type FormEvent } from "react";

import { Button } from "@/shared/ui/button";

export interface NicknameDialogProps {
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (nickname: string) => void;
  submitError?: string | null;
}

const NICKNAME_MAX_LENGTH = 20;

/** 백엔드 `CreateSessionRequest.nickname`(1–20자)과 같은 규칙을 클라이언트에서도 적용한다. */
function validateNickname(nickname: string): string | null {
  if (nickname.length === 0) {
    return "닉네임을 입력해 주세요.";
  }

  if (nickname.length > NICKNAME_MAX_LENGTH) {
    return `닉네임은 ${NICKNAME_MAX_LENGTH}자까지 쓸 수 있어요.`;
  }

  return null;
}

export function NicknameDialog({
  isSubmitting,
  onCancel,
  onSubmit,
  submitError,
}: NicknameDialogProps) {
  const [nickname, setNickname] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputId = useId();
  const titleId = useId();
  const messageId = useId();

  const message = validationError ?? submitError ?? null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = nickname.trim();
    const nextError = validateNickname(trimmed);

    setValidationError(nextError);

    if (nextError === null) {
      onSubmit(trimmed);
    }
  };

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-ink/30 px-5 py-10">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-card border border-border bg-card p-6 sm:p-8"
        role="dialog"
      >
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink" id={titleId}>
          닉네임 입력
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          상대에게는 보이지 않아요. 결과를 구분하는 데만 잠깐 쓰고 저장하지 않아요.
        </p>

        <form className="mt-6 flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-ink" htmlFor={inputId}>
              닉네임
            </label>
            <input
              aria-describedby={message === null ? undefined : messageId}
              aria-invalid={message === null ? undefined : true}
              autoComplete="off"
              className="min-h-12 rounded-control border border-border bg-card px-4 py-3 text-base text-ink outline-none focus-visible:shadow-focus"
              id={inputId}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="예: 예랑이"
              value={nickname}
            />
            <p aria-live="polite" className="min-h-5 text-sm font-semibold text-[#C0392B]" id={messageId}>
              {message}
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button disabled={isSubmitting} onClick={onCancel} variant="secondary">
              취소
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "시작하는 중" : "시작하기"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
