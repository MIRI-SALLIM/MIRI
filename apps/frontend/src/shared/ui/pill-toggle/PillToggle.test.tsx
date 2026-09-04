import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PillToggle } from "./PillToggle";

describe("PillToggle", () => {
  it("exposes its toggle state to assistive technology", () => {
    render(
      <PillToggle pressed={false} onPressedChange={() => undefined}>
        선택
      </PillToggle>,
    );

    expect(screen.getByRole("button", { name: "선택" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("requests the opposite state when pressed", async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(
      <PillToggle pressed={false} onPressedChange={onPressedChange}>
        선택
      </PillToggle>,
    );

    await user.click(screen.getByRole("button", { name: "선택" }));

    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it("keeps controlled accessibility and click behavior authoritative", async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    const unsafeConsumerProps = {
      "aria-pressed": "true",
      onClick: vi.fn(),
    } as unknown as Record<string, unknown>;

    render(
      <PillToggle
        {...unsafeConsumerProps}
        pressed={false}
        onPressedChange={onPressedChange}
      >
        선택
      </PillToggle>,
    );

    const toggle = screen.getByRole("button", { name: "선택" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it("uses accessible strong brand foregrounds when pressed", () => {
    render(
      <>
        <PillToggle pressed onPressedChange={() => undefined} tone="green">
          Green 선택
        </PillToggle>
        <PillToggle pressed onPressedChange={() => undefined} tone="purple">
          Purple 선택
        </PillToggle>
      </>,
    );

    expect(screen.getByRole("button", { name: "Green 선택" })).toHaveClass("text-green-strong");
    expect(screen.getByRole("button", { name: "Purple 선택" })).toHaveClass("text-purple-strong");
  });
});
