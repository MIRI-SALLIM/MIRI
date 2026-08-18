import { describe, expect, beforeEach, afterEach, it, vi } from "vitest";

import { toPng } from "html-to-image";

import type { ShareCardModel } from "@/entities/share-card";

import { downloadShareCard } from "./download-share-card";

vi.mock("html-to-image", () => ({
  toPng: vi.fn(),
}));

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

function installFontReadiness() {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
}

describe("downloadShareCard", () => {
  beforeEach(() => {
    vi.mocked(toPng).mockResolvedValue("data:image/png;base64,card");
    installFontReadiness();
  });

  afterEach(() => {
    vi.mocked(toPng).mockReset();
    document.body.replaceChildren();
  });

  it("waits for fonts and downloads a portrait card at the exact logical render size", async () => {
    const node = document.createElement("div");
    document.body.append(node);
    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    const remove = vi.spyOn(anchor, "remove");
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "a") return anchor;
      return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    });

    await downloadShareCard(node, portraitModel);

    expect(toPng).toHaveBeenCalledWith(
      node,
      expect.objectContaining({
        canvasHeight: 960,
        canvasWidth: 540,
        cacheBust: true,
        pixelRatio: 2,
      }),
    );
    expect(anchor.download).toBe("mirisallim-light-result-portrait.png");
    expect(anchor.href).toBe("data:image/png;base64,card");
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(anchor.isConnected).toBe(false);

    createElement.mockRestore();
  });

  it("downloads a square card with a 540 by 540 render canvas and fixed square filename", async () => {
    const node = document.createElement("div");
    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    const remove = vi.spyOn(anchor, "remove");
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "a") return anchor;
      return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    });

    await downloadShareCard(node, squareModel);

    expect(toPng).toHaveBeenCalledWith(
      node,
      expect.objectContaining({
        canvasHeight: 540,
        canvasWidth: 540,
        cacheBust: true,
        pixelRatio: 2,
      }),
    );
    expect(anchor.download).toBe("mirisallim-light-result-square.png");
    expect(anchor.href).toBe("data:image/png;base64,card");
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(anchor.isConnected).toBe(false);

    createElement.mockRestore();
  });

  it("works when the browser does not expose a FontFaceSet", async () => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: undefined,
    });
    const node = document.createElement("div");
    const anchor = document.createElement("a");
    vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    vi.spyOn(anchor, "remove");
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "a") return anchor;
      return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    });

    await expect(downloadShareCard(node, portraitModel)).resolves.toBeUndefined();
    expect(toPng).toHaveBeenCalledOnce();

    createElement.mockRestore();
  });
});
