import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { AppHeader } from "./AppHeader";

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
}

describe("AppHeader", () => {
  afterEach(() => setViewportWidth(1024));

  it("uses a mobile menu below 900px", async () => {
    setViewportWidth(899);
    render(<AppHeader />);

    const user = userEvent.setup();
    const menuButton = screen.getByRole("button", { name: "메뉴 열기" });
    expect(screen.queryByRole("navigation", { name: "주요 메뉴" })).not.toBeInTheDocument();

    await user.click(menuButton);

    expect(screen.getByRole("button", { name: "메뉴 닫기" })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "서비스 소개",
      "이용 가이드",
      "샘플 리포트",
      "FAQ",
      "로그인",
    ]);
  });

  it("shows the full desktop navigation and login affordance at exactly 900px", () => {
    setViewportWidth(900);
    render(<AppHeader />);

    expect(screen.getByRole("link", { name: "미리살림 홈" })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(
      within(navigation).getAllByRole("link").map((link) => ({
        href: link.getAttribute("href"),
        label: link.textContent,
      })),
    ).toEqual([
      { href: "#about", label: "서비스 소개" },
      { href: "#how", label: "이용 가이드" },
      { href: "#sample", label: "샘플 리포트" },
      { href: "#faq", label: "FAQ" },
    ]);
    expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
  });
});
