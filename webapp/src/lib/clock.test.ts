import { describe, expect, it } from "vitest";
import { formatClock, msUntilNextMinute } from "./clock";

describe("formatClock", () => {
  it("formats with no seconds shown", () => {
    expect(formatClock(new Date("2026-01-01T14:07:32"))).not.toMatch(/:\d\d:/);
  });
});

describe("msUntilNextMinute", () => {
  it("is a full minute when exactly on the boundary", () => {
    expect(msUntilNextMinute(new Date("2026-01-01T14:07:00.000"))).toBe(60000);
  });

  it("shrinks as the clock approaches the next minute", () => {
    expect(msUntilNextMinute(new Date("2026-01-01T14:07:59.500"))).toBe(500);
  });
});
