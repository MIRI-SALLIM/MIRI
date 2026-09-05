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

  it("provides a known zero when switching to known without a value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<AmountField label="월 소득" value={{ status: "unknown", value: null, precision: "estimate" }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "알고 있어요" }));

    expect(onChange).toHaveBeenCalledWith({ status: "known", value: 0, precision: "estimate" });
  });

  it("sends a parsed integer for the won input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Harness() {
      const [amount, setAmount] = useState<AmountValue>({ status: "known", value: 1_000, precision: "exact" });
      return <AmountField label="월 소득" value={amount} onChange={(nextAmount) => { onChange(nextAmount); setAmount(nextAmount); }} />;
    }

    render(<Harness />);
    const input = screen.getByRole("spinbutton", { name: "월 소득" });
    await user.clear(input);
    await user.type(input, "2000000");

    expect(onChange).toHaveBeenLastCalledWith({ status: "known", value: 2_000_000, precision: "exact" });
  });
});
