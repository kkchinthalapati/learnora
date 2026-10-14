import { describe, expect, it } from "vitest";
import { boardOptions } from "./boards";

describe("first-run board picker", () => {
  const options = boardOptions();
  const byId = (id: string) => options.find((o) => o.id === id)!;

  it("calls a board Ready only when its syllabus and checked questions both exist", () => {
    expect(byId("aqa-gcse-biology-8461").support).toBe("ready");
    expect(byId("cbse-10-science-086").support).toBe("ready");
    /* Syllabus built in, no bank yet. */
    expect(byId("ib-biology-2025").support).toBe("partly");
    expect(byId("cbse-9-science-086").support).toBe("partly");
  });

  it("says plainly what a partly-ready board is missing", () => {
    expect(byId("ib-biology-2025").honesty).toMatch(
      /no checked questions for it yet/,
    );
    expect(byId("icse-10").honesty).toMatch(/no ICSE syllabus behind this yet/);
    expect(byId("aqa-gcse-biology-8461").honesty).toBeUndefined();
  });

  it("includes ICSE, A-level and students not doing exams yet", () => {
    expect(byId("icse-10").support).toBe("partly");
    expect(byId("a-level").support).toBe("partly");
    expect(byId("no-exams").label).toBe("Not doing exams yet (Year 7–9)");
    expect(byId("other").support).toBe("none");
  });
});
