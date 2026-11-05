import { describe, expect, it } from "vitest";
import { addTermCards, cardifyNotes, definedTerms } from "./cardify";

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

describe("words to know", () => {
  const section = [
    "### Cell transport",
    "",
    "**Osmosis** is the diffusion of water across a partially permeable membrane.",
    "",
    "- **Solute**: the substance that dissolves",
    "- **Solvent** — the liquid it dissolves in",
    "",
    "Water moves towards the more concentrated solution.",
  ].join("\n");

  it("collects the terms a section defines, in the note's own words", () => {
    expect(definedTerms(section.split("\n"))).toEqual([
      ["Osmosis", "The diffusion of water across a partially permeable membrane."],
      ["Solute", "The substance that dissolves"],
      ["Solvent", "The liquid it dissolves in"],
    ]);
  });

  it("adds one card at the end of a section with three or more, leaving the prose", () => {
    const out = addTermCards(section);
    expect(out.startsWith(section.trimEnd())).toBe(true);
    expect(out).toContain('t = KeyTerms("Words to know", [["Osmosis", "The diffusion of water across a partially permeable membrane."], ["Solute", "The substance that dissolves"], ["Solvent", "The liquid it dissolves in"]])');
  });

  it("leaves a section with fewer terms, or its own vocabulary card, alone", () => {
    const two = "### A\n\n**Mass** is how much matter there is.\n\n**Weight** is the force of gravity on a mass.";
    expect(addTermCards(two)).toBe(two);
    const withCard = `${section}\n\n\`\`\`openui\nroot = Stack([t])\nt = KeyTerms("Terms", [["a", "b"]])\n\`\`\``;
    expect(addTermCards(withCard)).toBe(withCard);
  });

  it("never reads terms out of a code block", () => {
    const code = "### Code\n\n```js\n**a** is x.\n**b** is y.\n**c** is z.\n```";
    expect(addTermCards(code)).toBe(code);
  });

  it("works per section", () => {
    const two = `${section}\n\n### Next\n\nNo terms here.`;
    const out = addTermCards(two);
    expect(out.indexOf("KeyTerms")).toBeLessThan(out.indexOf("### Next"));
  });
});
