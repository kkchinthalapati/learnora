import { afterEach, describe, expect, it } from "vitest";
import { isFlagOn } from "./flags";

afterEach(() => localStorage.clear());

describe("isFlagOn", () => {
  it("defaults on in development and off in production", () => {
    expect(isFlagOn("weeklyGoal", { dev: true })).toBe(true);
    expect(isFlagOn("weeklyGoal", { dev: false })).toBe(false);
  });

  it("honours a per-browser override either way", () => {
    localStorage.setItem("learnora:flag:guessFirst", "true");
    expect(isFlagOn("guessFirst", { dev: false })).toBe(true);
    localStorage.setItem("learnora:flag:guessFirst", "false");
    expect(isFlagOn("guessFirst", { dev: true })).toBe(false);
  });
});
