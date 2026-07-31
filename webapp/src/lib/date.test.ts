import { describe, expect, it } from "vitest";
import { mondayOfWeek } from "./date";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("mondayOfWeek", () => {
  it("returns the same date when given a Monday", () => {
    const monday = new Date(2026, 6, 27); // 2026-07-27 is a Monday
    expect(isoDate(mondayOfWeek(monday))).toBe("2026-07-27");
  });

  it("rolls a mid-week date back to that week's Monday", () => {
    const wednesday = new Date(2026, 6, 29); // 2026-07-29
    expect(isoDate(mondayOfWeek(wednesday))).toBe("2026-07-27");
  });

  it("rolls Sunday back to the Monday six days earlier, not the next one", () => {
    const sunday = new Date(2026, 7, 2); // 2026-08-02 is a Sunday
    expect(isoDate(mondayOfWeek(sunday))).toBe("2026-07-27");
  });

  it("crosses a month boundary correctly", () => {
    const saturday = new Date(2026, 7, 1); // 2026-08-01 is a Saturday
    expect(isoDate(mondayOfWeek(saturday))).toBe("2026-07-27");
  });

  it("defaults to today when called with no argument", () => {
    const result = mondayOfWeek();
    expect(result.getDay()).toBe(1);
  });
});
