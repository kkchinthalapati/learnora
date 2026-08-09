import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useQuizDraft } from "./useQuizDraft";
import { Storage } from "../lib/storage";

interface Draft {
  index: number;
  answers: number[];
}

describe("useQuizDraft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not write before the debounce elapses", () => {
    renderHook(() =>
      useQuizDraft<Draft>("quiz-draft-a", { index: 0, answers: [] }, {
        enabled: true,
      }),
    );

    vi.advanceTimersByTime(499);
    expect(Storage.get("quiz-draft-a")).toBeNull();
  });

  it("writes the debounced value once the window elapses", () => {
    renderHook(() =>
      useQuizDraft<Draft>("quiz-draft-b", { index: 1, answers: [1] }, {
        enabled: true,
      }),
    );

    vi.advanceTimersByTime(500);
    expect(Storage.get<Draft>("quiz-draft-b")).toEqual({
      index: 1,
      answers: [1],
    });
  });

  it("reschedules on every value change rather than writing each one", () => {
    const { rerender } = renderHook(
      ({ value }: { value: Draft }) =>
        useQuizDraft<Draft>("quiz-draft-c", value, { enabled: true }),
      { initialProps: { value: { index: 0, answers: [] as number[] } } },
    );

    vi.advanceTimersByTime(300);
    rerender({ value: { index: 1, answers: [1] } });
    vi.advanceTimersByTime(300);
    // Still short of a fresh 500ms window since the last change.
    expect(Storage.get("quiz-draft-c")).toBeNull();

    vi.advanceTimersByTime(200);
    expect(Storage.get<Draft>("quiz-draft-c")).toEqual({
      index: 1,
      answers: [1],
    });
  });

  it("does not schedule a write while disabled", () => {
    renderHook(() =>
      useQuizDraft<Draft>("quiz-draft-d", { index: 0, answers: [] }, {
        enabled: false,
      }),
    );

    vi.advanceTimersByTime(5000);
    expect(Storage.get("quiz-draft-d")).toBeNull();
  });

  it("load() reads back a previously stored draft", () => {
    Storage.set("quiz-draft-e", { index: 2, answers: [1, 0] });
    const { result } = renderHook(() =>
      useQuizDraft<Draft>("quiz-draft-e", { index: 0, answers: [] }, {
        enabled: false,
      }),
    );

    expect(result.current.load()).toEqual({ index: 2, answers: [1, 0] });
  });

  it("clear() cancels a pending write and removes any stored draft", () => {
    Storage.set("quiz-draft-f", { index: 5, answers: [] });
    const { result } = renderHook(() =>
      useQuizDraft<Draft>("quiz-draft-f", { index: 1, answers: [0] }, {
        enabled: true,
      }),
    );

    result.current.clear();
    vi.advanceTimersByTime(5000);

    expect(Storage.get("quiz-draft-f")).toBeNull();
  });

  it("flushes a pending write on unmount instead of dropping it", () => {
    const { unmount } = renderHook(() =>
      useQuizDraft<Draft>("quiz-draft-g", { index: 3, answers: [1] }, {
        enabled: true,
      }),
    );

    // Unmount well before the debounce would have fired on its own.
    vi.advanceTimersByTime(100);
    unmount();

    expect(Storage.get<Draft>("quiz-draft-g")).toEqual({
      index: 3,
      answers: [1],
    });
  });

  it("registers a beforeunload handler only when warnOnUnload is true", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() =>
      useQuizDraft<Draft>("quiz-draft-h", { index: 0, answers: [] }, {
        enabled: true,
        warnOnUnload: true,
      }),
    );

    expect(addSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("preventDefaults beforeunload while warnOnUnload is true", () => {
    renderHook(() =>
      useQuizDraft<Draft>("quiz-draft-i", { index: 0, answers: [] }, {
        enabled: true,
        warnOnUnload: true,
      }),
    );

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("does not intercept beforeunload once warnOnUnload turns false", () => {
    const { rerender } = renderHook(
      ({ warn }: { warn: boolean }) =>
        useQuizDraft<Draft>("quiz-draft-j", { index: 0, answers: [] }, {
          enabled: true,
          warnOnUnload: warn,
        }),
      { initialProps: { warn: true } },
    );

    rerender({ warn: false });

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
