import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  it("calls callback when matching key is pressed", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        a: callback,
      }),
    );

    const event = new KeyboardEvent("keydown", { key: "a" });
    document.dispatchEvent(event);

    expect(callback).toHaveBeenCalled();
  });

  it("ignores keys that don't match", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        a: callback,
      }),
    );

    const event = new KeyboardEvent("keydown", { key: "b" });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });

  it("handles multiple shortcuts", () => {
    const callbackA = vi.fn();
    const callbackB = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        a: callbackA,
        b: callbackB,
      }),
    );

    const eventA = new KeyboardEvent("keydown", { key: "a" });
    document.dispatchEvent(eventA);
    expect(callbackA).toHaveBeenCalledTimes(1);
    expect(callbackB).not.toHaveBeenCalled();

    const eventB = new KeyboardEvent("keydown", { key: "b" });
    document.dispatchEvent(eventB);
    expect(callbackB).toHaveBeenCalledTimes(1);
  });

  it("is case-insensitive for letter keys", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        a: callback,
      }),
    );

    const eventLower = new KeyboardEvent("keydown", { key: "a" });
    document.dispatchEvent(eventLower);
    expect(callback).toHaveBeenCalledTimes(1);

    const eventUpper = new KeyboardEvent("keydown", { key: "A" });
    document.dispatchEvent(eventUpper);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("handles number keys", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        "1": callback,
      }),
    );

    const event = new KeyboardEvent("keydown", { key: "1" });
    document.dispatchEvent(event);

    expect(callback).toHaveBeenCalled();
  });

  it("handles special keys like Space", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        " ": callback,
      }),
    );

    const event = new KeyboardEvent("keydown", { key: " " });
    document.dispatchEvent(event);

    expect(callback).toHaveBeenCalled();
  });

  it("handles special keys like Enter", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        Enter: callback,
      }),
    );

    const event = new KeyboardEvent("keydown", { key: "Enter" });
    document.dispatchEvent(event);

    expect(callback).toHaveBeenCalled();
  });

  it("ignores events when activeElement is an input", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        a: callback,
      }),
    );

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", { key: "a" });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("ignores events when activeElement is a textarea", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        a: callback,
      }),
    );

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    const event = new KeyboardEvent("keydown", { key: "a" });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it("ignores events when activeElement is contenteditable", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        a: callback,
      }),
    );

    const div = document.createElement("div");
    div.contentEditable = "true";
    /* jsdom, unlike real browsers, won't move focus onto a contenteditable
       node without an explicit tabIndex — without this, .focus() below is
       a silent no-op and activeElement stays <body>. */
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();

    const event = new KeyboardEvent("keydown", { key: "a" });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  it("respects the enabled option", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(
        {
          a: callback,
        },
        { enabled: false },
      ),
    );

    const event = new KeyboardEvent("keydown", { key: "a" });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });

  /* Regression: the hook matched on e.key alone and called
     preventDefault() on a match, so a browser chord that happened to share a
     letter with a registered shortcut was both swallowed and misread as the
     shortcut. In QuizRunner that made Cmd/Ctrl+D submit answer "D" instead of
     bookmarking; in ReviewView, Cmd/Ctrl+1-4 graded a flashcard instead of
     switching tab. */
  it.each([
    ["ctrlKey", { ctrlKey: true }],
    ["metaKey", { metaKey: true }],
    ["altKey", { altKey: true }],
  ])("ignores a %s chord and leaves it to the browser", (_label, modifier) => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcuts({ d: callback }));

    const event = new KeyboardEvent("keydown", {
      key: "d",
      cancelable: true,
      ...modifier,
    });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("still fires on a bare key and prevents its default", () => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcuts({ d: callback }));

    const event = new KeyboardEvent("keydown", { key: "d", cancelable: true });
    document.dispatchEvent(event);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("fires on a Shift chord, which is ordinary typing not a browser chord", () => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcuts({ a: callback }));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "A", shiftKey: true }),
    );

    expect(callback).toHaveBeenCalledTimes(1);
  });

  /* The map is an object literal at every call site, so it is a new
     reference on every render. Re-registering is not merely wasteful: a
     keypress arriving while the listener is detached is dropped. */
  it("keeps one listener across re-renders with a fresh shortcut map", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const first = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => useKeyboardShortcuts({ a: cb }),
      { initialProps: { cb: first } },
    );
    const addsAfterMount = addSpy.mock.calls.filter(
      ([type]) => type === "keydown",
    ).length;

    const second = vi.fn();
    rerender({ cb: second });

    const addsAfterRerender = addSpy.mock.calls.filter(
      ([type]) => type === "keydown",
    ).length;
    expect(addsAfterRerender).toBe(addsAfterMount);

    /* ...and the surviving listener still calls the newest callback. */
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it("cleanups event listener on unmount", () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({
        a: callback,
      }),
    );

    unmount();

    const event = new KeyboardEvent("keydown", { key: "a" });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });
});
