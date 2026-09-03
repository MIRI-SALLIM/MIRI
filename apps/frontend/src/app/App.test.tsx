import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the landing route with the future-focused message", async () => {
    window.history.pushState({}, "", "/");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "서로의 돈을 이해하면 미래가 더 선명해져요" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "돈 이야기, 다투기 전에 맞춰봐요" })).not.toBeInTheDocument();
  });
});
