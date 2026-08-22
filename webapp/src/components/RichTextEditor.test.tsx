import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { act, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor";

function editorEl(): HTMLElement {
  return document.querySelector(".ql-editor") as HTMLElement;
}

describe("RichTextEditor", () => {
  it("mounts a Quill instance with its toolbar", async () => {
    render(<RichTextEditor initialHtml="<p>Hello</p>" />);
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    expect(document.querySelector(".ql-toolbar")).toBeInTheDocument();
  });

  it("loads the initial document", async () => {
    render(<RichTextEditor initialHtml="<p><strong>Bold</strong> text</p>" />);
    await waitFor(() => expect(editorEl().textContent).toBe("Bold text"));
    expect(editorEl().querySelector("strong")).toBeInTheDocument();
  });

  it("renders nothing for empty initial HTML rather than erroring", async () => {
    render(<RichTextEditor initialHtml="" />);
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    expect(editorEl().textContent).toBe("");
  });

  /* The security-critical case: initialHtml is attacker-influenced (round-
   * trips through the DB, seeded from model output), so anything outside
   * the format allowlist has to be dropped, not merely escaped. */
  it("strips a script tag from the loaded document instead of executing it", async () => {
    render(
      <RichTextEditor initialHtml="<p>Safe</p><script>window.__pwned = true;</script>" />,
    );
    await waitFor(() => expect(editorEl().textContent).toContain("Safe"));
    expect(editorEl().innerHTML).not.toContain("<script");
    expect(
      (window as unknown as { __pwned?: boolean }).__pwned,
    ).toBeUndefined();
  });

  it("strips an embed/iframe format not in the allowlist", async () => {
    render(
      <RichTextEditor initialHtml='<iframe src="https://example.com"></iframe><p>Safe</p>' />,
    );
    await waitFor(() => expect(editorEl().textContent).toContain("Safe"));
    expect(editorEl().innerHTML).not.toContain("<iframe");
  });

  it("calls onUserChange only for user-sourced edits, not the initial load", async () => {
    const user = userEvent.setup();
    const onUserChange = vi.fn();
    render(
      <RichTextEditor initialHtml="<p>Hi</p>" onUserChange={onUserChange} />,
    );
    await waitFor(() => expect(editorEl().textContent).toBe("Hi"));

    expect(onUserChange).not.toHaveBeenCalled();

    await user.click(editorEl());
    await user.keyboard("!");

    await waitFor(() => expect(onUserChange).toHaveBeenCalled());
    const lastHtml = onUserChange.mock.calls.at(-1)?.[0] as string;
    expect(lastHtml).toContain("!");
    expect(lastHtml).toContain("Hi");
  });

  it("starts disabled when readOnly, and does not fire onUserChange", async () => {
    const user = userEvent.setup();
    const onUserChange = vi.fn();
    render(
      <RichTextEditor
        initialHtml="<p>Hi</p>"
        readOnly
        onUserChange={onUserChange}
      />,
    );
    await waitFor(() =>
      expect(editorEl()).toHaveAttribute("contenteditable", "false"),
    );

    await user.click(editorEl());
    await user.keyboard("!");
    expect(onUserChange).not.toHaveBeenCalled();
  });

  it("toggles editability when the readOnly prop changes after mount", async () => {
    const { rerender } = render(
      <RichTextEditor initialHtml="<p>Hi</p>" readOnly={false} />,
    );
    await waitFor(() =>
      expect(editorEl()).toHaveAttribute("contenteditable", "true"),
    );

    rerender(<RichTextEditor initialHtml="<p>Hi</p>" readOnly={true} />);
    await waitFor(() =>
      expect(editorEl()).toHaveAttribute("contenteditable", "false"),
    );
  });

  it("exposes selection text and HTML through the imperative handle", async () => {
    const user = userEvent.setup();
    const ref = createRef<RichTextEditorHandle>();
    const onSelectionChange = vi.fn();
    render(
      <RichTextEditor
        ref={ref}
        initialHtml="<p><strong>Selected passage</strong> continues here</p>"
      />,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    ref.current?.onSelectionChange(onSelectionChange);

    await user.click(editorEl());
    await user.keyboard("{Control>}a{/Control}");

    await waitFor(() =>
      expect(onSelectionChange).toHaveBeenCalledWith(
        expect.objectContaining({ index: 0 }),
      ),
    );
    expect(ref.current?.getSelection()?.length).toBeGreaterThan(10);
    expect(ref.current?.getSelectedText()).toContain("Selected passage");
    expect(ref.current?.getSelectedHtml()).toContain("<strong>");
  });

  it("replaces and inserts HTML ranges as user edits", async () => {
    const ref = createRef<RichTextEditorHandle>();
    const onUserChange = vi.fn();
    render(
      <RichTextEditor
        ref={ref}
        initialHtml="<p>Alpha passage</p>"
        onUserChange={onUserChange}
      />,
    );
    await waitFor(() => expect(editorEl().textContent).toBe("Alpha passage"));

    act(() => ref.current?.replaceRange(0, 5, "<strong>Better</strong>"));
    await waitFor(() =>
      expect(editorEl().textContent).toContain("Better passage"),
    );
    expect(editorEl().querySelector("strong")).toHaveTextContent("Better");

    act(() =>
      ref.current?.insertAfterRange(
        0,
        6,
        "<blockquote>Why it matters</blockquote>",
      ),
    );
    await waitFor(() =>
      expect(editorEl().textContent).toContain("Why it matters"),
    );
    expect(onUserChange).toHaveBeenCalled();
  });

  it("removes the toolbar and editor from the DOM on unmount", async () => {
    const { unmount } = render(<RichTextEditor initialHtml="<p>Hi</p>" />);
    await waitFor(() => expect(editorEl()).toBeInTheDocument());

    unmount();

    expect(document.querySelector(".ql-toolbar")).not.toBeInTheDocument();
    expect(document.querySelector(".ql-editor")).not.toBeInTheDocument();
  });
});
