import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ShareCardModel } from "@/entities/share-card";

import { ShareCard } from "./ShareCard";

const portraitModel: ShareCardModel = {
  leftType: "차곡차곡 지도",
  rightType: "유연한 나침반",
  tagline: "서로를 꽤 잘 알고 있어요",
  mutualHitCount: 4,
  questionCount: 7,
  ratio: "portrait",
};

const squareModel: ShareCardModel = {
  ...portraitModel,
  ratio: "square",
};

function getCard() {
  const serviceName = screen.getByText("미리살림");
  const card = serviceName.closest("[data-ratio]");

  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe("ShareCard", () => {
  it("renders the portrait ratio and privacy-safe share content", () => {
    render(<ShareCard model={portraitModel} />);

    const card = getCard();

    expect(card).toHaveAttribute("data-ratio", "portrait");
    expect(card).toHaveStyle({ aspectRatio: "9 / 16" });
    expect(screen.getByText("4 / 7")).toBeInTheDocument();
    expect(screen.getByText("미리살림")).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/금액|소득|부채|저축액/i);
  });

  it("renders the square ratio with the same privacy-safe content", () => {
    render(<ShareCard model={squareModel} />);

    const card = getCard();

    expect(card).toHaveAttribute("data-ratio", "square");
    expect(card).toHaveStyle({ aspectRatio: "1 / 1" });
    expect(screen.getByText("4 / 7")).toBeInTheDocument();
    expect(screen.getByText("미리살림")).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/금액|소득|부채|저축액/i);
  });

  it("uses a compact square layout so the fixed card can contain all content", () => {
    render(<ShareCard model={squareModel} />);

    const card = getCard();

    expect(card).toHaveAttribute("data-layout", "compact");
    expect(card).toHaveClass("gap-2", "p-4");
    expect(screen.getByText("나의 유형").parentElement).toHaveClass("p-3");
    expect(screen.getByText("파트너 유형").parentElement).toHaveClass("p-3");
    expect(screen.getByText("4 / 7")).toHaveClass("text-3xl");
  });

  it("uses an accessible muted token for meaningful supporting copy", () => {
    render(<ShareCard model={portraitModel} />);

    expect(screen.getByText("3분 모드 · 함께 공개")).toHaveClass("text-ink-muted");
    expect(screen.getByText("돈 이야기를, 조금 더 편안하게")).toHaveClass("text-ink-muted");
  });
});
