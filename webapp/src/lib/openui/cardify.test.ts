import { describe, expect, it } from "vitest";
import { cardifyNotes } from "./cardify";

describe("cardifyNotes", () => {
  it("boxes a labelled paragraph as a Callout card", () => {
    const md = "Intro.\n\nDefinition: Geometry is the study of shapes.\n\nAfter.";
    const out = cardifyNotes(md);
    expect(out).toContain('c1 = Callout("definition", "Geometry is the study of shapes.")');
    expect(out).toContain("```openui");
    expect(out.startsWith("Intro.")).toBe(true);
    expect(out.endsWith("After.")).toBe(true);
  });

  it("maps each label to its callout kind and strips bold markers", () => {
    const out = cardifyNotes("**Key idea:** One thing.\n\n**Common mistake:** Two thing.\n\nFormula: F = ma");
    expect(out).toContain('Callout("key", "One thing.")');
    expect(out).toContain('Callout("mistake", "Two thing.")');
    expect(out).toContain('Callout("formula", "F = ma")');
  });

  it("makes one stack from consecutive labelled lines", () => {
    const out = cardifyNotes("Key idea: A.\n\nDefinition: B.");
    expect(out).toContain("root = Stack([c1, c2])");
    expect((out.match(/```openui/g) ?? []).length).toBe(1);
  });

  it("leaves labels inside code fences alone", () => {
    const md = "```\nDefinition: not a card\n```";
    expect(cardifyNotes(md)).toBe(md);
  });

  it("leaves ordinary notes untouched", () => {
    const md = "## Heading\n\nPlain prose, with no labels.";
    expect(cardifyNotes(md)).toBe(md);
  });

  it("keeps a student's quote characters from breaking the card", () => {
    const out = cardifyNotes('Key idea: He said "hi".');
    expect(out).toContain('Callout("key", "He said \u201dhi\u201d.")');
  });
});
