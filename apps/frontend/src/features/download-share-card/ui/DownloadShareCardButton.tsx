import { useState } from "react";

import type { ShareCardModel } from "@/entities/share-card";

import { downloadShareCard } from "../lib/download-share-card";

export interface DownloadShareCardButtonProps {
  cardRef: { current: HTMLDivElement | null };
  model: ShareCardModel;
}

const DOWNLOAD_ERROR_MESSAGE = "이미지를 저장하지 못했어요. 다시 시도해 주세요.";

export function DownloadShareCardButton({
  cardRef,
  model,
}: DownloadShareCardButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleClick() {
    const cardNode = cardRef.current;

    setHasError(false);

    if (!cardNode) {
      setHasError(true);
      return;
    }

    setIsPending(true);

    try {
      await downloadShareCard(cardNode, model);
    } catch {
      setHasError(true);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="rounded-button bg-green-strong px-5 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
        disabled={isPending}
        onClick={() => void handleClick()}
      >
        {isPending ? "이미지 저장 중..." : "이미지 저장"}
      </button>
      {hasError ? <p role="alert">{DOWNLOAD_ERROR_MESSAGE}</p> : null}
    </div>
  );
}
