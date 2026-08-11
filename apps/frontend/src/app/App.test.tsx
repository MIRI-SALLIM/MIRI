import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the frontend foundation preview", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "돈 이야기를, 조금 더 편안하게" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3분 대화 시작하기" })).toBeInTheDocument();
  });
});
