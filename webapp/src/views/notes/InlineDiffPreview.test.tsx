import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  DIFF_PREVIEW_TIMEOUT_MS,
  InlineDiffPreview,
} from "./InlineDiffPreview";

const selectionRect = {
  top: 120,
  right: 320,
  bottom: 144,
  left: 120,
  width: 200,
  height: 24,
};

describe("InlineDiffPreview", () => {
  afterEach(() => vi.useRealTimers());

  it("shows the original and suggested text", () => {
    render(
      <InlineDiffPreview
        originalText="The original passage"
        newText="The clearer passage"
        selectionRect={selectionRect}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.getByText("The original passage")).toBeInTheDocument();
    expect(screen.getByText("The clearer passage")).toBeInTheDocument();
  });

  it("accepts or rejects explicitly", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(
      <InlineDiffPreview
        originalText="Before"
        newText="After"
        selectionRect={selectionRect}
        onAccept={onAccept}
        onReject={onReject}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("rejects automatically after 30 seconds", () => {
    vi.useFakeTimers();
    const onReject = vi.fn();
    render(
      <InlineDiffPreview
        originalText="Before"
        newText="After"
        selectionRect={selectionRect}
        onAccept={vi.fn()}
        onReject={onReject}
      />,
    );
    vi.advanceTimersByTime(DIFF_PREVIEW_TIMEOUT_MS);
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("rejects on Escape", () => {
    const onReject = vi.fn();
    render(
      <InlineDiffPreview
        originalText="Before"
        newText="After"
        selectionRect={selectionRect}
        onAccept={vi.fn()}
        onReject={onReject}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onReject).toHaveBeenCalledOnce();
  });
});
