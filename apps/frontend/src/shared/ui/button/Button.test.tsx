import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("does not submit a form unless explicitly requested", () => {
    render(<Button>계속하기</Button>);

    expect(screen.getByRole("button", { name: "계속하기" })).toHaveAttribute(
      "type",
      "button",
    );
  });
});
