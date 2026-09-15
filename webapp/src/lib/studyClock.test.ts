import { describe, expect, it } from "vitest";
import {
  IDLE_CAP_MS,
  MIN_LOGGABLE_MINUTES,
  creditedMsFromDurations,
  creditedMsFromMarks,
  toLoggableMinutes,
} from "./studyClock";

const MIN = 60_000;

describe("creditedMsFromMarks", () => {
  it("sums the gaps between marks", () => {
    expect(creditedMsFromMarks([0, 30_000, 45_000])).toBe(45_000);
  });

  it("caps each gap individually rather than the total", () => {
    /* Three 90s gaps are under the 2min cap each, so all three count in full —
       a total-level cap would have clipped this to 120s. */
    expect(creditedMsFromMarks([0, 90_000, 180_000, 270_000])).toBe(270_000);
  });

  it("clips a single idle gap to the cap", () => {
    // 30s of work, then the student walked away for 18 minutes, then one more grade.
    expect(creditedMsFromMarks([0, 30_000, 30_000 + 18 * MIN])).toBe(
      30_000 + IDLE_CAP_MS,
    );
  });

  it("credits nothing for fewer than two marks", () => {
    expect(creditedMsFromMarks([])).toBe(0);
    expect(creditedMsFromMarks([12345])).toBe(0);
  });

  it("ignores non-monotonic marks rather than subtracting time", () => {
    // A clock adjustment mid-session must never produce negative credit.
    expect(creditedMsFromMarks([0, 60_000, 10_000, 70_000])).toBe(120_000);
  });

  it("honours an explicit cap", () => {
    expect(creditedMsFromMarks([0, 10_000], 5_000)).toBe(5_000);
  });
});

describe("creditedMsFromDurations", () => {
  it("caps each duration then sums", () => {
    expect(creditedMsFromDurations([10_000, 20_000])).toBe(30_000);
    expect(creditedMsFromDurations([10_000, 18 * MIN])).toBe(
      10_000 + IDLE_CAP_MS,
    );
  });

  it("ignores negative and non-finite durations", () => {
    expect(creditedMsFromDurations([-5_000, 10_000, NaN, Infinity])).toBe(
      10_000,
    );
  });

  it("is zero for an empty list", () => {
    expect(creditedMsFromDurations([])).toBe(0);
  });
});

describe("toLoggableMinutes", () => {
  it("rounds to whole minutes", () => {
    expect(toLoggableMinutes(5 * MIN)).toBe(5);
    expect(toLoggableMinutes(5 * MIN + 40_000)).toBe(6);
  });

  it("returns null below the loggable floor, so no 0-minute rows are written", () => {
    expect(toLoggableMinutes(0)).toBeNull();
    expect(toLoggableMinutes(20_000)).toBeNull();
  });

  it("returns the floor exactly at the boundary", () => {
    // 30s rounds to 1 minute, which is the first loggable value.
    expect(toLoggableMinutes(30_000)).toBe(MIN_LOGGABLE_MINUTES);
    expect(toLoggableMinutes(29_000)).toBeNull();
  });
});
