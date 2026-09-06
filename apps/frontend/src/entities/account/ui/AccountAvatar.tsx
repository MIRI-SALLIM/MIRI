import { useState } from "react";

export interface AccountAvatarProps {
  displayName: string | null;
  profileImageUrl: string | null;
  className?: string;
}

export function AccountAvatar({ displayName, profileImageUrl, className = "size-9" }: AccountAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = displayName?.trim() || "내 정보";

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-soft text-sm font-bold text-purple-strong ${className}`}
    >
      {profileImageUrl !== null && !imageFailed ? (
        <img
          alt={`${label} 프로필`}
          className="size-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
          referrerPolicy="no-referrer"
          src={profileImageUrl}
        />
      ) : (
        <span aria-hidden="true">{label.slice(0, 1)}</span>
      )}
    </span>
  );
}
