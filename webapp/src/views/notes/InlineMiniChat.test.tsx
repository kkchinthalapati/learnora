import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InlineMiniChat } from "./InlineMiniChat";

describe("InlineMiniChat", () => {
  it("submits a trimmed custom instruction", () => {
    const onSubmit = vi.fn();
    render(<InlineMiniChat onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Custom AI instruction"), {
      target: { value: "  Translate this to Spanish  " },
    });
    fireEvent.submit(
      screen.getByLabelText("Custom AI instruction").closest("form")!,
    );
    expect(onSubmit).toHaveBeenCalledWith("Translate this to Spanish");
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    render(<InlineMiniChat onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByLabelText("Custom AI instruction"), {
      key: "Escape",
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
