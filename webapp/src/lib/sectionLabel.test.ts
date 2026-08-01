import { describe, expect, it } from "vitest";
import { isLibrarySection, sectionLabel } from "./sectionLabel";

describe("isLibrarySection", () => {
  it("is true for the library shell and its tabs", () => {
    expect(isLibrarySection("/library")).toBe(true);
    expect(isLibrarySection("/library/quizzes")).toBe(true);
  });

  it("is true for pages reached from the library that have no sidebar entry", () => {
    expect(isLibrarySection("/folders/f-1")).toBe(true);
    expect(isLibrarySection("/notes/m-1")).toBe(true);
    expect(isLibrarySection("/quiz/q-1")).toBe(true);
    expect(isLibrarySection("/quiz/q-1/review")).toBe(true);
    expect(isLibrarySection("/review/d-1")).toBe(true);
  });

  it("is false for every other section", () => {
    expect(isLibrarySection("/")).toBe(false);
    expect(isLibrarySection("/tasks")).toBe(false);
    expect(isLibrarySection("/settings")).toBe(false);
  });
});

describe("sectionLabel", () => {
  it("labels the dashboard", () => {
    expect(sectionLabel("/")).toBe("Dashboard");
  });

  it("labels every library-family route as Library", () => {
    expect(sectionLabel("/library")).toBe("Library");
    expect(sectionLabel("/folders/f-1")).toBe("Library");
    expect(sectionLabel("/notes/m-1")).toBe("Library");
    expect(sectionLabel("/quiz/q-1")).toBe("Library");
    expect(sectionLabel("/review/d-1")).toBe("Library");
  });

  it("labels the remaining top-level sections", () => {
    expect(sectionLabel("/timer")).toBe("Timer");
    expect(sectionLabel("/tasks")).toBe("Task Manager");
    expect(sectionLabel("/plan")).toBe("This week's plan");
    expect(sectionLabel("/exams")).toBe("Exams");
    expect(sectionLabel("/settings")).toBe("Settings");
  });

  it("falls back for anything unrecognized", () => {
    expect(sectionLabel("/definitely-not-a-route")).toBe("Learnora");
  });
});
