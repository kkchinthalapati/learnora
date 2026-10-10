import { describe, expect, it } from "vitest";
import { formatNumericKey, gradeNumeric, parseNumeric } from "./numericAnswer";

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

  it("accepts the units a question lists as equivalent", () => {
    expect(gradeNumeric("1540 cm3", { value: 1540, unit: "cm³" }).correct).toBe(true);
    expect(gradeNumeric("1540 cubic cm", { value: 1540, unit: "cm³", acceptUnits: ["cubic cm"] }).correct).toBe(true);
  });

  it("formats the key for display", () => {
    expect(formatNumericKey({ value: 9, unit: "J" })).toBe("9 J");
    expect(formatNumericKey({ value: 1 / 3 })).toBe("0.333333");
  });
});
