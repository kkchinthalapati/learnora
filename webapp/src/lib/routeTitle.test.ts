import { describe, expect, it } from "vitest";
import { titleForPath } from "./routeTitle";

describe("titleForPath", () => {
  it("names every primary destination", () => {
    expect(titleForPath("/")).toBe("Home · Learnora");
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

  /* Audit F-10: every page a student can open gets its own name. */
  it("names pages that used to be titled just Learnora", () => {
    expect(titleForPath("/capture")).toBe("New lesson · Learnora");
    expect(titleForPath("/exam-detective")).toBe("Exam traps · Learnora");
    expect(titleForPath("/setup")).toBe("Study profile · Learnora");
  });

  it("falls back to the app name for unknown paths", () => {
    expect(titleForPath("/nope")).toBe("Learnora");
  });
});
