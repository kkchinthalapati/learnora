import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTimerIntervention } from "./useTimerIntervention";

describe("useTimerIntervention", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not show toast if timer is not running", () => {
    const showToast = vi.fn();
    const pause = vi.fn();
    renderHook(() => useTimerIntervention(false, "tutor", showToast, pause));

    // Simulate tab hide
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(showToast).not.toHaveBeenCalled();
  });

  it("shows toast after 15 seconds of hidden tab while timer is running", () => {
    const showToast = vi.fn();
    const pause = vi.fn();
    renderHook(() => useTimerIntervention(true, "coach", showToast, pause));

    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(14000);
    });
    expect(showToast).not.toHaveBeenCalled(); // Not enough time

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.any(String), { error: true });
  });

  it("auto-pauses the timer after 60 seconds of hidden tab", () => {
    const showToast = vi.fn();
    const pause = vi.fn();
    renderHook(() => useTimerIntervention(true, "coach", showToast, pause));

    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(15000); // Warning toast
    });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(45000); // 60s total
    });
    expect(pause).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenCalledWith("Timer auto-paused due to inactivity.", { error: true });
  });

  it("cancels timeout if user returns before 15 seconds", () => {
    const showToast = vi.fn();
    const pause = vi.fn();
    renderHook(() => useTimerIntervention(true, "buddy", showToast, pause));

    // Hide
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Show again
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(showToast).not.toHaveBeenCalled();
  });

  it("does nothing when disabled via settings", () => {
    const showToast = vi.fn();
    const pause = vi.fn();
    renderHook(() =>
      useTimerIntervention(true, "coach", showToast, pause, false),
    );

    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(70000);
    });

    expect(showToast).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it("stops mid-countdown if disabled while the tab is already hidden", () => {
    const showToast = vi.fn();
    const pause = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useTimerIntervention(true, "coach", showToast, pause, enabled),
      { initialProps: { enabled: true } },
    );

    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Turned off with the 15s toast already scheduled — it must not fire.
    rerender({ enabled: false });

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(showToast).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it("cancels timeout if timer stops while hidden", () => {
    const showToast = vi.fn();
    const pause = vi.fn();
    const { rerender } = renderHook(
      ({ isRunning }) => useTimerIntervention(isRunning, "professor", showToast, pause),
      { initialProps: { isRunning: true } }
    );

    // Hide
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Timer stops
    rerender({ isRunning: false });

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(showToast).not.toHaveBeenCalled();
  });
});
