import { describe, expect, it } from "vitest";
import { cutAtBoundary, sectionExcerpt, splitIntoParts, splitSections } from "./sourceExcerpt";

const sentence = (topic: string, n: number) => `${topic} fact number ${n} is worth remembering.`;
const body = (topic: string, sentences: number) =>
  Array.from({ length: sentences }, (_, n) => sentence(topic, n + 1)).join(" ");

/* A chapter shaped like real generated notes: a few long sections, a short
   one, all well past the budget together. */
const chapter = [
  "## Cells",
  body("Cells", 60),
  "## Enzymes",
  body("Enzymes", 60),
  "## Key terms",
  "Diffusion: net movement from high to low concentration.",
  "## Respiration",
  body("Respiration", 60),
].join("\n\n");

describe("sectionExcerpt", () => {
  it("leaves notes within budget untouched", () => {
    expect(sectionExcerpt("## Short\n\nJust this.", 6000)).toBe("## Short\n\nJust this.");
  });

  it("stays within budget and keeps every section, including the last", () => {
    const out = sectionExcerpt(chapter, 3000);
    expect(out.length).toBeLessThanOrEqual(3000);
    for (const heading of ["## Cells", "## Enzymes", "## Key terms", "## Respiration"]) {
      expect(out).toContain(heading);
    }
    expect(out).toContain("Respiration fact number 1 is worth remembering.");
    // The old head cut never reached the last section.
    expect(chapter.substring(0, 3000)).not.toContain("## Respiration");
  });

  it("keeps a short section whole and gives the saving to the long ones", () => {
    const out = sectionExcerpt(chapter, 3000);
    expect(out).toContain("Diffusion: net movement from high to low concentration.");
    const sectionChars = (heading: string) => out.split(heading)[1].split("\n\n## ")[0].length;
    expect(sectionChars("## Cells")).toBeGreaterThan(500);
    expect(Math.abs(sectionChars("## Cells") - sectionChars("## Respiration"))).toBeLessThan(80);
  });

  it("tells the model the text was shortened and to spread its questions", () => {
    expect(sectionExcerpt(chapter, 3000)).toMatch(/^\[This material was shortened to fit\..*all of the sections/);
  });

  it("spreads notes with no headings across the whole document", () => {
    const paragraphs = Array.from({ length: 30 }, (_, n) => body(`Part${n}`, 6)).join("\n\n");
    const out = sectionExcerpt(paragraphs, 4000);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out).toContain("Part0 fact");
    // The last run of paragraphs is represented, not just the opening.
    expect(out).toMatch(/Part2[5-9] fact/);
  });

  it("names the sections it cannot fit when there are too many to share", () => {
    const many = Array.from({ length: 80 }, (_, n) => `## Topic ${n}\n\n${body(`T${n}`, 4)}`).join("\n\n");
    const out = sectionExcerpt(many, 3000);
    expect(out.length).toBeLessThanOrEqual(3000);
    expect(out).toContain("## Topic 0");
    expect(out).toContain("Also covered (not shown in full):");
  });
});

describe("cutAtBoundary", () => {
  it("prefers a sentence end to a mid-word cut", () => {
    expect(cutAtBoundary("One two three. Four five six seven.", 22)).toBe("One two three.…");
  });

  it("returns text within the limit unchanged", () => {
    expect(cutAtBoundary("Short.", 20)).toBe("Short.");
  });
});

describe("splitSections", () => {
  it("splits at headings and keeps a preamble", () => {
    expect(splitSections("Intro\n## A\nalpha\n### B\nbeta")).toEqual([
      { heading: "", body: "Intro" },
      { heading: "## A", body: "alpha" },
      { heading: "### B", body: "beta" },
    ]);
  });
});

describe("splitIntoParts", () => {
  const para = (n: number) => `Paragraph ${n} ${"word ".repeat(40).trim()}.`;
  const doc = Array.from({ length: 60 }, (_, n) => para(n)).join("\n\n");

  it("keeps text that fits as one part", () => {
    expect(splitIntoParts("short", 100, 3)).toEqual(["short"]);
  });

  it("splits into balanced parts within the limit, losing nothing", () => {
    const parts = splitIntoParts(doc, doc.length / 2 + 500, 3);
    expect(parts).toHaveLength(2);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(doc.length / 2 + 500);
    expect(parts.join("\n\n")).toBe(doc);
    expect(Math.abs(parts[0].length - parts[1].length)).toBeLessThan(600);
  });

  it("stops at the part limit", () => {
    const parts = splitIntoParts(doc, 2000, 3);
    expect(parts).toHaveLength(3);
    expect(parts[0].startsWith("Paragraph 0 ")).toBe(true);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(2000);
  });

  it("cuts a paragraph longer than a part at a word", () => {
    const parts = splitIntoParts("word ".repeat(100).trim(), 120, 3);
    expect(parts.length).toBe(3);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(120);
  });
});
