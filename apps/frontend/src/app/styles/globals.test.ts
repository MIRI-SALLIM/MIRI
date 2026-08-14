import { describe, expect, it } from "vitest";

import stylesheet from "./globals.css?raw";

const luminance = (hex: string) => {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255);

  if (!channels || channels.length !== 3) {
    throw new Error(`유효하지 않은 색상입니다: #${hex}`);
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
};

const contrastRatio = (first: string, second: string) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

describe("전역 접근성 토큰", () => {
  it("Tailwind v4 CSS-first 테마와 기존 토큰을 선언한다", () => {
    expect(stylesheet).toContain('@import "tailwindcss";');
    expect(stylesheet).not.toContain("@tailwind base");
    expect(stylesheet).toContain("@theme");
    expect(stylesheet).toContain("--color-canvas: #FCFCFB");
    expect(stylesheet).toContain("--color-green-strong: #237A56");
    expect(stylesheet).toContain("--radius-card: 20px");
    expect(stylesheet).toContain("--radius-control: 14px");
    expect(stylesheet).toContain("--animate-fadeup: fadeup 420ms ease-out both");
  });

  it("포커스 링은 밝은 배경에서 3:1 이상의 대비를 유지한다", () => {
    const focusRule = stylesheet.match(
      /:focus-visible\s*{[^}]*outline:\s*3px solid var\(--color-green-strong\)/i,
    );
    const focusColor = stylesheet.match(/--color-green-strong:\s*#([0-9a-f]{6})/i)?.[1];

    expect(focusRule, "포커스 링은 green-strong 테마 토큰을 사용해야 합니다").toBeDefined();
    expect(focusColor, "포커스 링은 불투명한 6자리 hex 색상을 사용해야 합니다").toBeDefined();
    expect(contrastRatio(focusColor!, "fcfcfb")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(focusColor!, "ffffff")).toBeGreaterThanOrEqual(3);
  });
});
