import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExamProctor } from "./useExamProctor";

describe("useExamProctor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null countdown when not active", () => {
    const { result } = renderHook(() =>
      useExamProctor({
        isActive: false,
        enabled: true,
        onTerminate: vi.fn(),
      }),
    );

    expect(result.current.graceCountdown).toBeNull();
    expect(result.current.graceReason).toBeNull();
  });

  it("returns null countdown when disabled", () => {
    const { result } = renderHook(() =>
      useExamProctor({
        isActive: true,
        enabled: false,
        onTerminate: vi.fn(),
      }),
    );

    expect(result.current.graceCountdown).toBeNull();
    expect(result.current.graceReason).toBeNull();
  });

  it("starts countdown on visibility change when active", () => {
    const { result } = renderHook(() =>
      useExamProctor({
        isActive: true,
        enabled: true,
        onTerminate: vi.fn(),
      }),
    );

    act(() => {
      const event = new Event("visibilitychange");
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(event);
    });

    expect(result.current.graceCountdown).not.toBeNull();
    expect(result.current.graceReason).toBe("visibility");
  });

  it("starts countdown on fullscreen exit when active", () => {
    const { result } = renderHook(() =>
      useExamProctor({
        isActive: true,
        enabled: true,
        onTerminate: vi.fn(),
      }),
    );

    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => null,
      });
      const event = new Event("fullscreenchange");
      document.dispatchEvent(event);
    });

    expect(result.current.graceCountdown).not.toBeNull();
    expect(result.current.graceReason).toBe("fullscreen");
  });

  it("cancels countdown when visibility returns while active", () => {
    const { result } = renderHook(() =>
      useExamProctor({
        isActive: true,
        enabled: true,
        onTerminate: vi.fn(),
      }),
    );

    // Trigger visibility change (hidden)
    act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.graceReason).toBe("visibility");

    // Return to visible
    act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.graceCountdown).toBeNull();
    expect(result.current.graceReason).toBeNull();
  });

  it("cancels countdown when re-entering fullscreen", () => {
    const { result } = renderHook(() =>
      useExamProctor({
        isActive: true,
        enabled: true,
        onTerminate: vi.fn(),
      }),
    );

    // Exit fullscreen
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => null,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.graceReason).toBe("fullscreen");

    // Re-enter fullscreen
    act(() => {
      const mockElement = document.createElement("div");
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => mockElement,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.graceCountdown).toBeNull();
    expect(result.current.graceReason).toBeNull();
  });

  it("calls onTerminate after grace period expires for visibility", () => {
    const onTerminate = vi.fn();
    renderHook(() =>
      useExamProctor({
        isActive: true,
        enabled: true,
        onTerminate,
      }),
    );

    // Trigger visibility change
    act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onTerminate).not.toHaveBeenCalled();

    // Advance time past grace period (5000ms)
    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(onTerminate).toHaveBeenCalledWith("visibility");
  });

  it("calls onTerminate after grace period expires for fullscreen", () => {
    const onTerminate = vi.fn();
    renderHook(() =>
      useExamProctor({
        isActive: true,
        enabled: true,
        onTerminate,
      }),
    );

    // Exit fullscreen
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => null,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(onTerminate).not.toHaveBeenCalled();

    // Advance time past grace period
    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(onTerminate).toHaveBeenCalledWith("fullscreen");
  });

  it("updates countdown as time passes", () => {
    const { result } = renderHook(() =>
      useExamProctor({
        isActive: true,
        enabled: true,
        onTerminate: vi.fn(),
      }),
    );

    // Trigger visibility change
    act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const initialCountdown = result.current.graceCountdown;
    expect(initialCountdown).toBeCloseTo(5000, -1); // ~5000ms

    // Advance time
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Countdown should have decreased
    expect(result.current.graceCountdown).toBeLessThan(
      initialCountdown as number,
    );
    expect(result.current.graceCountdown).toBeGreaterThan(0);
  });

  it("respects enabled flag (no termination when disabled)", () => {
    const onTerminate = vi.fn();
    renderHook(() =>
      useExamProctor({
        isActive: true,
        enabled: false,
        onTerminate,
      }),
    );

    act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Advance past grace period
    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(onTerminate).not.toHaveBeenCalled();
  });

  it("respects isActive flag (no termination when inactive)", () => {
    const onTerminate = vi.fn();
    renderHook(() =>
      useExamProctor({
        isActive: false,
        enabled: true,
        onTerminate,
      }),
    );

    act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(onTerminate).not.toHaveBeenCalled();
  });
});
