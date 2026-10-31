import { describe, expect, it } from "vitest";
import { learnSections, MAX_SECTIONS } from "./learnSections";

const body = "A sentence long enough to be worth teaching from here.";

describe("learnSections", () => {
  it("takes the notes' ### sections as the outline, without the welcome or emoji", () => {
    const notes = `## 🧬 Your guide to cell division\n\nWelcome!\n\n### 🔬 Mitosis\n${body}\n\n### Meiosis ✨\n${body}`;
    const sections = learnSections(notes);
    expect(sections.map((s) => s.title)).toEqual(["Mitosis", "Meiosis"]);
    expect(sections[0].body).toBe(body);
    expect(sections[0].key).toBe("0-mitosis");
  });

  it("skips a heading with nothing under it", () => {
    const notes = `## Title\n\n### Empty\n\n### Real\n${body}`;
    expect(learnSections(notes).map((s) => s.title)).toEqual(["Real"]);
  });

  it("falls back to ## sections, then to the whole text", () => {
    expect(learnSections(`## One\n${body}\n\n## Two\n${body}`).map((s) => s.title)).toEqual(["One", "Two"]);
    const single = learnSections(`## Photosynthesis\n${body}`);
    expect(single).toHaveLength(1);
    expect(single[0].title).toBe("Photosynthesis");
    expect(learnSections(body)[0].title).toBe("The main idea");
  });

  it("has nothing to teach from empty notes", () => {
    expect(learnSections("")).toEqual([]);
    expect(learnSections("## Just a title")).toEqual([]);
  });

  it("merges a long tail into the last section instead of dropping it", () => {
    const notes = Array.from({ length: MAX_SECTIONS + 3 }, (_, i) => `### Part ${i + 1}\n${body}`).join("\n\n");
    const sections = learnSections(notes);
    expect(sections).toHaveLength(MAX_SECTIONS);
    expect(sections.at(-1)!.body).toContain(`### Part ${MAX_SECTIONS + 3}`);
  });
});
