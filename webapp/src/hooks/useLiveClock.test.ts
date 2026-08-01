import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLiveClock } from "./useLiveClock";

describe("useLiveClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T14:07:20.000"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the current time immediately on mount", () => {
    const { result } = renderHook(() => useLiveClock());
    expect(result.current).toBe(
      new Date("2026-01-01T14:07:20.000").toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  });

  it("ticks once per minute, aligned to the minute boundary", () => {
    const { result } = renderHook(() => useLiveClock());

    // Advancing by less than the remaining 40s shouldn't tick yet.
    act(() => {
      vi.advanceTimersByTime(39_000);
    });
    expect(result.current).toContain("14:07");

    // Crossing into 14:08 fires the aligned first tick.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toContain("14:08");

    // The next tick is a plain 60s later.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toContain("14:09");
  });
});
