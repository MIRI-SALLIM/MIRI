import { render, screen } from "@testing-library/react";
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

  it("uses the compact header below 900px", () => {
    setViewportWidth(899);
    render(<AppHeader />);

    expect(screen.queryByRole("navigation", { name: "주요 메뉴" })).not.toBeInTheDocument();
    expect(screen.getByText("3분 모드")).toBeInTheDocument();
  });

  it("shows desktop navigation at exactly 900px", () => {
    setViewportWidth(900);
    render(<AppHeader />);

    expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeInTheDocument();
  });
});
