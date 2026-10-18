import { describe, expect, it } from "vitest";
import { dobProblem } from "./auth";

function yearsAgo(years: number, plusDays = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + plusDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("dobProblem", () => {
  it("asks for a date when it is empty", () => {
    expect(dobProblem("")).toBe("Please enter your date of birth.");
  });

  it("refuses under 13", () => {
    expect(dobProblem(yearsAgo(12))).toBe("You must be at least 13 years old.");
  });

  it("accepts 13 and over", () => {
    expect(dobProblem(yearsAgo(13, -1))).toBeNull();
    expect(dobProblem(yearsAgo(20))).toBeNull();
  });
});
