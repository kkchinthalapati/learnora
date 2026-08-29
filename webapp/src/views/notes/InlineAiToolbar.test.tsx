import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InlineAiToolbar } from "./InlineAiToolbar";
import type { EditorSelectionRect } from "../../components/RichTextEditor";

const rect: EditorSelectionRect = {
  top: 180,
  right: 360,
  bottom: 204,
  left: 160,
  width: 200,
  height: 24,
};

function props(overrides = {}) {
  return {
    selectionLength: 24,
    selectionRect: rect,
    loadingAction: null,
    onAction: vi.fn(),
    onAskAi: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

describe("InlineAiToolbar", () => {
  it("only appears for selections of at least 10 characters", () => {
    const { rerender } = render(
      <InlineAiToolbar {...props({ selectionLength: 9 })} />,
    );
    expect(
      screen.queryByRole("toolbar", { name: "AI actions for selected text" }),
    ).not.toBeInTheDocument();

    rerender(<InlineAiToolbar {...props({ selectionLength: 10 })} />);
    expect(
      screen.getByRole("toolbar", { name: "AI actions for selected text" }),
    ).toBeInTheDocument();
  });

  it("runs a selected action and opens Ask AI", () => {
    const onAction = vi.fn();
    const onAskAi = vi.fn();
    render(<InlineAiToolbar {...props({ onAction, onAskAi })} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Improve selected text" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Ask AI about selected text" }),
    );
    expect(onAction).toHaveBeenCalledWith("improve");
    expect(onAskAi).toHaveBeenCalledOnce();
  });

  it("dismisses on Escape and selection collapse", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<InlineAiToolbar {...props({ onDismiss })} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();

    rerender(<InlineAiToolbar {...props({ selectionLength: 0, onDismiss })} />);
    expect(
      screen.queryByRole("toolbar", { name: "AI actions for selected text" }),
    ).not.toBeInTheDocument();
  });

  it("flips below selections near the top of the viewport", () => {
    const { container } = render(
      <InlineAiToolbar
        {...props({ selectionRect: { ...rect, top: 20, bottom: 44 } })}
      />,
    );
    expect(
      container.querySelector('[data-placement="below"]'),
    ).toBeInTheDocument();
  });

  it("shows a spinner and disables actions while AI is running", () => {
    render(<InlineAiToolbar {...props({ loadingAction: "summarize" })} />);
    expect(screen.getByLabelText("Summarise in progress")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Improve selected text" }),
    ).toBeDisabled();
  });

  it("triggers card creation when Make Flashcard button is clicked", () => {
    const onCreateCard = vi.fn();
    render(<InlineAiToolbar {...props({ onCreateCard })} />);

    const cardBtn = screen.getByRole("button", {
      name: "Make Flashcard selected text",
    });
    expect(cardBtn).toBeInTheDocument();
    fireEvent.click(cardBtn);
    expect(onCreateCard).toHaveBeenCalledOnce();
  });

  it("shows loading spinner on Make Flashcard button while card creation is in flight", () => {
    render(<InlineAiToolbar {...props({ loadingAction: "flashcard" })} />);
    expect(
      screen.getByLabelText("Make Flashcard in progress"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Make Flashcard selected text" }),
    ).toBeDisabled();
  });
});
