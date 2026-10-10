import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumericAnswerInput } from "./NumericAnswerInput";

const key = { value: 2.25e8, unit: "m/s", relTolerance: 0.01 };

describe("NumericAnswerInput", () => {
  it("marks any reasonable spelling of the right number as correct", async () => {
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    render(<NumericAnswerInput numeric={key} onAnswer={onAnswer} />);
    await user.type(screen.getByLabelText(/Your answer \(in m\/s\)/), "2.25 x 10^8");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(onAnswer).toHaveBeenCalledWith("2.25 x 10^8", expect.objectContaining({ correct: true }));
  });

  it("never counts an unreadable entry as an answer; it says what it accepts", async () => {
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    render(<NumericAnswerInput numeric={key} onAnswer={onAnswer} />);
    await user.type(screen.getByLabelText(/Your answer/), "about two hundred million");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/isn't a number/);
  });

  it("passes a wrong answer on with its reason", async () => {
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    render(<NumericAnswerInput numeric={key} onAnswer={onAnswer} />);
    await user.type(screen.getByLabelText(/Your answer/), "2.3e8");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(onAnswer).toHaveBeenCalledWith("2.3e8", expect.objectContaining({ correct: false, reason: "rounding" }));
  });
});
