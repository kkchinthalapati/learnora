import { describe, expect, it } from "vitest";
import { formatNumericKey, gradeNumeric, numericFeedback, parseNumeric } from "./numericAnswer";

describe("parseNumeric", () => {
  it.each([
    ["9", 9],
    ["9.0", 9],
    ["-3.5", -3.5],
    ["−3.5", -3.5],
    ["1,540", 1540],
    [".5", 0.5],
    ["1/3", 1 / 3],
    ["2.25e8", 2.25e8],
    ["2.25 × 10^8", 2.25e8],
    ["2.25x10⁸", 2.25e8],
    ["2.25*10^8", 2.25e8],
    ["3 × 10⁻²", 0.03],
    ["30√3", 30 * Math.sqrt(3)],
    ["30 root 3", 30 * Math.sqrt(3)],
    ["√2", Math.sqrt(2)],
    ["√3/2", Math.sqrt(3) / 2],
    ["-√3/2", -Math.sqrt(3) / 2],
    ["2√3/3", (2 * Math.sqrt(3)) / 3],
    ["1/√2", 1 / Math.sqrt(2)],
    ["sqrt(3)/2", Math.sqrt(3) / 2],
    ["1 1/2", 1.5],
    ["-2 3/4", -2.75],
    ["10^8", 1e8],
    ["+4", 4],
  ])("reads %s", (input, value) => {
    expect(parseNumeric(input)?.value).toBeCloseTo(value as number, 9);
  });

  it("keeps the unit apart from the number", () => {
    expect(parseNumeric("1540 cm³")).toEqual({ value: 1540, unit: "cm³" });
    expect(parseNumeric("9 J")).toEqual({ value: 9, unit: "J" });
  });

  it("refuses what isn't a number", () => {
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("nine")).toBeNull();
    expect(parseNumeric("1/0")).toBeNull();
    expect(parseNumeric("5 {}")).toBeNull();
  });

  it("never reads a second number as a unit", () => {
    expect(parseNumeric("12 15")).toBeNull();
    expect(parseNumeric("√3 2")).toBeNull();
  });
});

describe("gradeNumeric", () => {
  const key = { value: 2.25e8, unit: "m/s", relTolerance: 0.01 };

  it("accepts every reasonable spelling of the right answer, with or without the unit", () => {
    for (const input of ["2.25e8", "2.25 × 10^8", "225000000", "2.25×10⁸ m/s", "2.256 x 10^8"]) {
      expect(gradeNumeric(input, key).correct).toBe(true);
    }
  });

  it("rejects a wrong unit even when the number is right", () => {
    expect(gradeNumeric("2.25e8 km/h", key).reason).toBe("wrong-unit");
  });

  it("calls a near miss a rounding problem, and a far one wrong", () => {
    expect(gradeNumeric("2.3e8", key).reason).toBe("rounding");
    expect(gradeNumeric("4e8", key).reason).toBe("wrong");
  });

  it("uses an absolute tolerance when given", () => {
    expect(gradeNumeric("47", { value: 47, tolerance: 0 }).correct).toBe(true);
    expect(gradeNumeric("48", { value: 47, tolerance: 0, relTolerance: 0 }).correct).toBe(false);
  });

  it("marks a whole-number key exactly unless the question sets a tolerance", () => {
    // Sum of the first 25 odd numbers: 0.5% of 625 used to let 622-628 through.
    expect(gradeNumeric("625", { value: 625 }).correct).toBe(true);
    expect(gradeNumeric("624", { value: 625 }).correct).toBe(false);
    expect(gradeNumeric("628", { value: 625 }).correct).toBe(false);
    expect(gradeNumeric("624", { value: 625 }).reason).toBe("rounding");
  });

  it("doesn't blame rounding on a near miss of an exact answer", () => {
    const exact = { value: 625 };
    expect(numericFeedback(gradeNumeric("624", exact), exact)).toMatch(/exact/);
    const rounded = { value: 17.32, tolerance: 0.06 };
    expect(numericFeedback(gradeNumeric("17.4", rounded), rounded)).toMatch(/rounding/);
  });

  it("treats a set tolerance as the whole rule", () => {
    // "to one decimal place": 17.3 m. 17.4 is a different answer.
    const tower = { value: 17.32, tolerance: 0.06, unit: "m" };
    expect(gradeNumeric("17.3", tower).correct).toBe(true);
    expect(gradeNumeric("10√3 m", tower).correct).toBe(true);
    expect(gradeNumeric("17.4", tower).correct).toBe(false);
  });

  it("still allows honest rounding of a decimal key", () => {
    expect(gradeNumeric("0.375", { value: 0.375 }).correct).toBe(true);
    expect(gradeNumeric("3/8", { value: 0.375 }).correct).toBe(true);
    expect(gradeNumeric("0.866", { value: Math.sqrt(3) / 2 }).correct).toBe(true);
  });

  it("accepts exact surd and fraction forms of the right answer", () => {
    expect(gradeNumeric("√3/2", { value: Math.sqrt(3) / 2 }).correct).toBe(true);
    expect(gradeNumeric("1/√2", { value: Math.SQRT1_2 }).correct).toBe(true);
    expect(gradeNumeric("1 1/2", { value: 1.5 }).correct).toBe(true);
  });

  it("accepts the units a question lists as equivalent", () => {
    expect(gradeNumeric("1540 cm3", { value: 1540, unit: "cm³" }).correct).toBe(true);
    expect(gradeNumeric("1540 cubic cm", { value: 1540, unit: "cm³", acceptUnits: ["cubic cm"] }).correct).toBe(true);
  });

  it("formats the key for display", () => {
    expect(formatNumericKey({ value: 9, unit: "J" })).toBe("9 J");
    expect(formatNumericKey({ value: 1 / 3 })).toBe("0.333333");
  });
});
