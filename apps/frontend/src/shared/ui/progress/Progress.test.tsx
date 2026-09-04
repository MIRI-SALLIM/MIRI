import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Progress } from "./Progress";

describe("Progress", () => {
  it("exposes the bounded current and maximum values", () => {
    render(<Progress label="진행률" max={3} value={4} />);

    const progress = screen.getByRole("progressbar", { name: "진행률" });
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "3");
    expect(progress).toHaveAttribute("aria-valuenow", "3");
  });
});
