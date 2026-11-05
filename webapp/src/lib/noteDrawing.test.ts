import { describe, expect, it } from "vitest";
import { hasDrawing, insertDrawing, pickDrawableSection } from "./noteDrawing";

const filler = (topic: string) => `${topic} is covered here in enough detail to be worth revising. `.repeat(4);

const NOTE = [
  "## Photosynthesis",
  "",
  "Let's break down how plants make food.",
  "",
  "### 🌱 Key words",
  "",
  filler("Chlorophyll"),
  "",
  "### The light-dependent stage",
  "",
  `${filler("Light")} The process happens in the thylakoid, in steps that split water.`,
  "",
  "### Why it matters",
  "",
  filler("Food chains"),
].join("\n");

describe("pickDrawableSection", () => {
  it("picks the section that reads as a process or structure", () => {
    const section = pickDrawableSection(NOTE);
    expect(section?.heading).toBe("The light-dependent stage");
    expect(section?.body).toContain("thylakoid");
  });

  it("picks nothing for a short note, a note with a drawing, or nothing drawable", () => {
    expect(pickDrawableSection("### A process\n\nShort.")).toBeNull();
    expect(pickDrawableSection(`${NOTE}\n\n\`\`\`svg\n<svg></svg>\n\`\`\``)).toBeNull();
    const facts = ["## Dates", "", "### When", "", filler("1066"), "", "### Who", "", filler("Harold")].join("\n");
    expect(pickDrawableSection(facts)).toBeNull();
  });
});

describe("insertDrawing", () => {
  it("puts the drawing under the section's prose, before the next heading", () => {
    const section = pickDrawableSection(NOTE)!;
    const out = insertDrawing(NOTE, section, '<svg viewBox="0 0 640 420"><title>Stage</title></svg>');
    expect(hasDrawing(out)).toBe(true);
    const svgAt = out.indexOf("```svg");
    expect(svgAt).toBeGreaterThan(out.indexOf("split water"));
    expect(svgAt).toBeLessThan(out.indexOf("### Why it matters"));
  });
});
