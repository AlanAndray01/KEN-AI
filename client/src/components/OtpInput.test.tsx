import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OtpInput } from "./OtpInput";

describe("OtpInput", () => {
  it("advances to the next digit and accepts a pasted code", () => {
    const onChange = vi.fn();
    const { rerender } = render(<OtpInput value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "1" } });
    expect(onChange).toHaveBeenCalledWith("1");

    rerender(<OtpInput value="123" onChange={onChange} />);
    fireEvent.paste(screen.getByLabelText("Digit 1 of 6"), {
      clipboardData: { getData: () => "847291" },
    });
    expect(onChange).toHaveBeenCalledWith("847291");
  });
});
