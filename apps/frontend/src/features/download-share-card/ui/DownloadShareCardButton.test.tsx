import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ShareCardModel } from "@/entities/share-card";

import { downloadShareCard } from "../lib/download-share-card";

import { DownloadShareCardButton } from "./DownloadShareCardButton";

vi.mock("../lib/download-share-card", () => ({
  downloadShareCard: vi.fn(),
}));

const model: ShareCardModel = {
  leftType: "차곡차곡 지도",
  rightType: "유연한 나침반",
  tagline: "서로를 꽤 잘 알고 있어요",
  mutualHitCount: 4,
  questionCount: 7,
  ratio: "portrait",
};

describe("DownloadShareCardButton", () => {
  it("disables itself while a card is being rendered", async () => {
    let resolveDownload: (() => void) | undefined;
    vi.mocked(downloadShareCard).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    const cardRef = { current: document.createElement("div") };

    render(<DownloadShareCardButton cardRef={cardRef} model={model} />);

    const button = screen.getByRole("button", { name: "이미지 저장" });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("저장 중");

    await act(async () => {
      resolveDownload?.();
    });
    expect(button).not.toBeDisabled();
  });

  it("shows a role alert after a failed download and remains on the page", async () => {
    vi.mocked(downloadShareCard).mockRejectedValueOnce(new Error("render failed"));
    const cardRef = createRef<HTMLDivElement>();
    const initialPath = window.location.pathname;

    render(<DownloadShareCardButton cardRef={cardRef} model={model} />);
    fireEvent.click(screen.getByRole("button", { name: "이미지 저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이미지를 저장하지 못했어요. 다시 시도해 주세요.",
    );
    expect(window.location.pathname).toBe(initialPath);
    expect(screen.getByRole("button", { name: "이미지 저장" })).not.toBeDisabled();
  });

  it("passes the card node and privacy-safe model to the renderer", async () => {
    vi.mocked(downloadShareCard).mockResolvedValueOnce();
    const cardRef = { current: document.createElement("div") };

    render(<DownloadShareCardButton cardRef={cardRef} model={model} />);
    fireEvent.click(screen.getByRole("button", { name: "이미지 저장" }));

    expect(downloadShareCard).toHaveBeenCalledWith(cardRef.current, model);
  });
});
