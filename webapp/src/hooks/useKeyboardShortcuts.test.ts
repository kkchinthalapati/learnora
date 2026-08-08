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
