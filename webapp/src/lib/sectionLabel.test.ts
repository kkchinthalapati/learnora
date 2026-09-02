import { describe, expect, it } from "vitest";
import {
  isLibrarySection,
  primaryDestinationForPath,
  sectionLabel,
} from "./sectionLabel";
import { translate } from "./i18n";

const t = (key: Parameters<typeof translate>[1]) => translate("en", key);

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
    expect(sectionLabel("/", t)).toBe("Dashboard");
  });

  it("labels every library-family route as Library", () => {
    expect(sectionLabel("/library", t)).toBe("Library");
    expect(sectionLabel("/folders/f-1", t)).toBe("Library");
    expect(sectionLabel("/notes/m-1", t)).toBe("Library");
    expect(sectionLabel("/quiz/q-1", t)).toBe("Library");
    expect(sectionLabel("/review/d-1", t)).toBe("Library");
  });

  it("labels the remaining top-level sections", () => {
    expect(sectionLabel("/timer", t)).toBe("Timer");
    expect(sectionLabel("/analytics", t)).toBe("Progress");
    expect(sectionLabel("/tasks", t)).toBe("Task Manager");
    expect(sectionLabel("/plan", t)).toBe("This week's plan");
    expect(sectionLabel("/exams", t)).toBe("Exams");
    expect(sectionLabel("/settings", t)).toBe("Settings");
  });

  it("falls back for anything unrecognized", () => {
    expect(sectionLabel("/definitely-not-a-route", t)).toBe("Learnora");
  });

  it("translates when given a non-English t", () => {
    const es = (key: Parameters<typeof translate>[1]) => translate("es", key);
    expect(sectionLabel("/", es)).toBe("Tablero");
    expect(sectionLabel("/tasks", es)).toBe("Tareas");
  });
});

describe("primaryDestinationForPath", () => {
  it("groups planning and library child routes under their primary links", () => {
    expect(primaryDestinationForPath("/tasks")).toBe("plan");
    expect(primaryDestinationForPath("/exams")).toBe("plan");
    expect(primaryDestinationForPath("/notes/material-1")).toBe("library");
  });

  it("returns no primary destination for secondary tools", () => {
    expect(primaryDestinationForPath("/debugger")).toBeNull();
    expect(primaryDestinationForPath("/friends")).toBeNull();
  });
});
