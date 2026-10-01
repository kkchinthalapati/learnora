import { describe, expect, it } from "vitest";
import { titleForPath } from "./routeTitle";

describe("titleForPath", () => {
  it("names every primary destination", () => {
    expect(titleForPath("/")).toBe("Today · Learnora");
    expect(titleForPath("/library")).toBe("Library · Learnora");
    expect(titleForPath("/study")).toBe("Study · Learnora");
    expect(titleForPath("/plan")).toBe("Study plan · Plan · Learnora");
    expect(titleForPath("/analytics")).toBe("Progress · Learnora");
  });

  it("prefers the more specific path", () => {
    expect(titleForPath("/library/flashcards")).toBe("Flashcards · Library · Learnora");
    expect(titleForPath("/study/s-123")).toBe("Study session · Learnora");
    expect(titleForPath("/welcome-pro")).toBe("Welcome to Pro · Learnora");
  });

  it("falls back to the app name for unknown paths", () => {
    expect(titleForPath("/nope")).toBe("Learnora");
  });
});
