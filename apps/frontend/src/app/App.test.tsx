import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the landing route instead of the frontend foundation preview", async () => {
    window.history.pushState({}, "", "/");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "돈 이야기, 다투기 전에 맞춰봐요" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "돈 이야기를, 조금 더 편안하게" })).not.toBeInTheDocument();
  });
});
