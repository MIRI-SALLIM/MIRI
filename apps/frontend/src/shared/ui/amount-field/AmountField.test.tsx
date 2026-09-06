import { render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AmountField, type AmountValue } from "./AmountField";

describe("AmountField", () => {
  it("clears the amount when switching from known to unknown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<AmountField label="월 소득" value={{ status: "known", value: 3_000_000, precision: "exact" }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "모르겠어요" }));

    expect(onChange).toHaveBeenCalledWith({ status: "unknown", value: null, precision: "exact" });
  });

  it("keeps known selected locally without saving a missing amount", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<AmountField label="월 소득" value={{ status: "unknown", value: null, precision: "estimate" }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "알고 있어요" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "알고 있어요" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not select unknown while a known amount is being replaced", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Harness() {
      const [amount, setAmount] = useState<AmountValue>({ status: "known", value: 1_000, precision: "exact" });
      return <AmountField label="월 소득" value={amount} onChange={(nextAmount) => { onChange(nextAmount); setAmount(nextAmount); }} />;
    }

    render(<Harness />);
    const input = screen.getByRole("spinbutton", { name: "월 소득" });
    await user.clear(input);
    expect(input).toHaveValue(null);
    expect(screen.getByRole("button", { name: "알고 있어요" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "모르겠어요" })).toHaveAttribute("aria-pressed", "false");
    expect(onChange).not.toHaveBeenCalled();

    await user.type(input, "2000000");

    expect(onChange).toHaveBeenLastCalledWith({ status: "known", value: 2_000_000, precision: "exact" });
  });

  it("keeps an explicit zero distinct from a missing amount", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<AmountField label="월 소득" value={{ status: "unknown", value: null, precision: "exact" }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "알고 있어요" }));
    expect(onChange).not.toHaveBeenCalled();

    await user.type(screen.getByRole("spinbutton", { name: "월 소득" }), "0");

    expect(onChange).toHaveBeenLastCalledWith({ status: "known", value: 0, precision: "exact" });
  });

  it("emits a known amount with exact or estimated precision", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<AmountField label="월 소득" value={{ status: "known", value: 3_000_000, precision: "exact" }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "대략 알고 있어요" }));

    expect(onChange).toHaveBeenCalledWith({ status: "known", value: 3_000_000, precision: "estimate" });
    expect(screen.getByRole("button", { name: "대략 알고 있어요" })).toHaveAttribute("aria-pressed", "true");
  });

  it("supports the withheld amount state without exposing a value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<AmountField label="월 소득" value={{ status: "known", value: 3_000_000, precision: "exact" }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "밝히고 싶지 않아요" }));

    expect(onChange).toHaveBeenCalledWith({ status: "withheld", value: null, precision: "exact" });
  });

  it("gives each unlabeled field a unique input id and a single input name", () => {
    render(
      <>
        <AmountField label="월 소득" value={{ status: "unknown", value: null, precision: "exact" }} onChange={() => undefined} />
        <AmountField label="월 지출" value={{ status: "unknown", value: null, precision: "exact" }} onChange={() => undefined} />
      </>,
    );

    const incomeInput = screen.getByLabelText("월 소득");
    const spendingInput = screen.getByLabelText("월 지출");

    expect(incomeInput).not.toHaveAttribute("aria-label");
    expect(spendingInput).not.toHaveAttribute("aria-label");
    expect(incomeInput).toHaveAttribute("id");
    expect(spendingInput).toHaveAttribute("id");
    expect(incomeInput).not.toHaveAttribute("id", spendingInput.getAttribute("id"));
  });
});
