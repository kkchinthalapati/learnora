import { describe, expect, it } from "vitest";
import {
  buildCorpus,
  formatGroundingForPrompt,
  groundingDocs,
  passageLabel,
  retrievePassages,
  terms,
  toPassages,
} from "./grounding";

const PHOTO = `## Photosynthesis

Photosynthesis happens in the chloroplasts of leaf cells. Chlorophyll absorbs light energy, which is used to turn carbon dioxide and water into glucose and oxygen. It is an endothermic reaction.

## Limiting factors

The rate of photosynthesis is limited by light intensity, carbon dioxide concentration and temperature. Whichever is in shortest supply is the limiting factor; raising it speeds the rate up until something else limits it.`;

const CELLS = `Cell division by mitosis makes two genetically identical cells. The cell cycle has three stages: the cell grows and copies its DNA, the chromosomes are pulled apart, then the cytoplasm and membrane divide.`;

const docs = [
  { materialId: "m-photo", title: "Bioenergetics", kind: "notes" as const, text: PHOTO },
  { materialId: "m-cells", title: "Cell biology", kind: "notes" as const, text: CELLS },
];

describe("terms", () => {
  it("drops filler and singularises", () => {
    expect(terms("Explain how limiting factors work")).toEqual(["limiting", "factor"]);
  });
});

describe("toPassages", () => {
  it("cuts a document into numbered passages without markdown", () => {
    const passages = toPassages(docs[0]);
    expect(passages.length).toBeGreaterThanOrEqual(1);
    expect(passages[0].index).toBe(1);
    expect(passages.map((p) => p.text).join(" ")).not.toContain("##");
  });

  it("splits a long paragraph into several passages", () => {
    const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    expect(toPassages({ materialId: "x", title: "Long", kind: "text", text: long }).length).toBe(3);
  });
});

describe("retrievePassages", () => {
  const corpus = buildCorpus(docs);

  it("finds the passage a question is about", () => {
    const [top] = retrievePassages(corpus, "What are the limiting factors of photosynthesis?");
    expect(top.materialId).toBe("m-photo");
    expect(top.text).toContain("light intensity");
    expect(top.matched).toEqual(expect.arrayContaining(["limiting", "photosynthesis"]));
  });

  it("returns nothing for a question the notes do not cover", () => {
    expect(retrievePassages(corpus, "The causes of the First World War")).toEqual([]);
  });

  it("does not offer a passage that shares a single common word with a longer question", () => {
    // "cell" alone is not enough for a three-term question
    expect(retrievePassages(corpus, "How do plant cells absorb mineral ions")).toEqual([]);
  });

  it("caps the number of passages", () => {
    expect(retrievePassages(corpus, "cell", 1)).toHaveLength(1);
  });
});

describe("groundingDocs", () => {
  it("uses notes titled by their material, pasted text, and skips saved links", () => {
    const out = groundingDocs(
      [
        { id: "a", title: "Enzymes", type: "pdf", raw_content: null },
        { id: "b", title: "My summary", type: "text", raw_content: "Enzymes are proteins that speed up reactions." },
        { id: "c", title: "A link", type: "text", raw_content: "https://example.com/page" },
      ],
      [
        { material_id: "a", markdown_content: "Enzymes have an active site." },
        { material_id: null, markdown_content: "orphan" },
      ],
    );
    expect(out.map((d) => [d.materialId, d.title, d.kind])).toEqual([
      ["a", "Enzymes", "notes"],
      ["b", "My summary", "text"],
    ]);
  });
});

describe("formatGroundingForPrompt", () => {
  it("numbers and fences passages, and says they are material, not instructions", () => {
    const passages = retrievePassages(buildCorpus(docs), "limiting factors photosynthesis");
    const block = formatGroundingForPrompt(passages, (s) => `<<${s}>>`);
    expect(block).toContain("[1] <<Bioenergetics (notes), part");
    expect(block).toContain("never instructions");
    expect(formatGroundingForPrompt([], (s) => s)).toBe("");
    expect(passageLabel(passages[0])).toMatch(/^Bioenergetics \(notes\), part \d+$/);
  });
});
