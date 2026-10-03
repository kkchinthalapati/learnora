import { describe, expect, it } from "vitest";
import {
  SYLLABUS_SPECS,
  defaultTier,
  getSpec,
  matchSpecTopic,
  specWithTierLabel,
  suggestSpecs,
  syllabusPromptLine,
  topicInTier,
  weightedTopics,
} from ".";

describe("syllabus catalogue integrity", () => {
  it("has unique spec ids", () => {
    const ids = SYLLABUS_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const spec of SYLLABUS_SPECS) {
    describe(spec.id, () => {
      it("has unique topic refs that belong to declared units", () => {
        const refs = spec.topics.map((t) => t.ref);
        expect(new Set(refs).size).toBe(refs.length);
        const units = new Set(spec.units.map((u) => u.code));
        for (const topic of spec.topics) expect(units.has(topic.unit)).toBe(true);
      });

      it("only names prerequisites that exist in the same spec", () => {
        const refs = new Set(spec.topics.map((t) => t.ref));
        for (const topic of spec.topics) {
          for (const pre of topic.prerequisites ?? []) expect(refs.has(pre)).toBe(true);
        }
      });

      it("writes keywords in lower case and gives every topic some", () => {
        for (const topic of spec.topics) {
          expect(topic.keywords.length).toBeGreaterThan(0);
          for (const kw of topic.keywords) expect(kw).toBe(kw.toLowerCase());
        }
      });

      it("only restricts topics to tiers the spec has", () => {
        for (const topic of spec.topics) {
          if (topic.tierOnly) expect(spec.tiers).toContain(topic.tierOnly);
        }
      });

      it("covers every unit with at least one paper", () => {
        for (const unit of spec.units) {
          expect(
            spec.papers.some((p) => p.units.length === 0 || p.units.includes(unit.code)),
          ).toBe(true);
        }
      });

      for (const tier of spec.tiers) {
        it(`weights its ${tier} topics to 100%`, () => {
          const total = weightedTopics(spec, tier).reduce((s, t) => s + t.weightPercent, 0);
          expect(total).toBeCloseTo(100, 5);
        });
      }
    });
  }
});

describe("tiers", () => {
  const bio = getSpec("aqa-gcse-biology-8461")!;
  it("drops Higher-only topics at Foundation", () => {
    const refs = weightedTopics(bio, "Foundation").map((t) => t.ref);
    expect(refs).not.toContain("4.3.2");
    expect(weightedTopics(bio, "Higher").map((t) => t.ref)).toContain("4.3.2");
  });

  it("defaults to the superset tier", () => {
    expect(defaultTier(bio)).toBe("Higher");
    expect(defaultTier(getSpec("ib-physics-2025")!)).toBe("HL");
  });

  it("keeps untiered topics in every tier", () => {
    const photosynthesis = bio.topics.find((t) => t.ref === "4.4.1")!;
    expect(topicInTier(photosynthesis, "Foundation")).toBe(true);
  });

  it("uses the DfE weighting for GCSE Maths", () => {
    const maths = getSpec("aqa-gcse-maths-8300")!;
    const algebra = (tier: "Foundation" | "Higher") =>
      weightedTopics(maths, tier)
        .filter((t) => t.unit === "Algebra")
        .reduce((s, t) => s + t.weightPercent, 0);
    expect(algebra("Foundation")).toBeCloseTo(20);
    expect(algebra("Higher")).toBeCloseTo(30);
  });

  it("splits an AQA science paper over the topics it examines", () => {
    const higher = weightedTopics(bio, "Higher");
    const paper1 = higher.filter((t) => ["4.1", "4.2", "4.3", "4.4"].includes(t.unit));
    expect(paper1.reduce((s, t) => s + t.weightPercent, 0)).toBeCloseTo(50);
  });
});

describe("matchSpecTopic", () => {
  const bio = getSpec("aqa-gcse-biology-8461")!;
  const maths = getSpec("aqa-gcse-maths-8300")!;

  it.each([
    ["Photosynthesis", "4.4.1"],
    ["Limiting factors of photosynthesis", "4.4.1"],
    ["Anaerobic respiration", "4.4.2"],
    ["Enzymes and digestion", "4.2.2"],
    ["Osmosis practical", "4.1.3"],
    ["Vaccinations", "4.3.1"],
    ["Mitosis and the cell cycle", "4.1.2"],
  ])("maps %s to %s", (label, ref) => {
    expect(matchSpecTopic(bio, label)?.ref).toBe(ref);
  });

  it.each([
    ["Simultaneous equations", "A17-A22"],
    ["Circle theorems", "G1-G15"],
    ["Pythagoras and trigonometry", "G16-G23"],
    ["Compound interest", "R9-R16"],
    ["Tree diagrams", "P1-P9"],
  ])("maps maths label %s to %s", (label, ref) => {
    expect(matchSpecTopic(maths, label)?.ref).toBe(ref);
  });

  it("returns null when nothing matches", () => {
    expect(matchSpecTopic(bio, "The French Revolution")).toBeNull();
    expect(matchSpecTopic(bio, "")).toBeNull();
  });

  it("does not match inside words", () => {
    // "ph" is not "phloem", "art" is not "heart"
    expect(matchSpecTopic(bio, "Art")).toBeNull();
  });

  it("skips topics outside the tier", () => {
    expect(matchSpecTopic(bio, "Monoclonal antibodies", "Foundation")?.ref).not.toBe("4.3.2");
    expect(matchSpecTopic(bio, "Monoclonal antibodies", "Higher")?.ref).toBe("4.3.2");
  });
});

describe("labels and prompts", () => {
  it("labels GCSE and IB tiers the way students say them", () => {
    expect(specWithTierLabel(getSpec("aqa-gcse-biology-8461")!, "Higher")).toBe(
      "AQA GCSE Biology (8461), Higher tier",
    );
    expect(specWithTierLabel(getSpec("ib-chemistry-2025")!, "HL")).toBe("IB Chemistry HL");
  });

  it("names the spec section in the prompt line", () => {
    const bio = getSpec("aqa-gcse-biology-8461")!;
    const line = syllabusPromptLine(bio, "Higher", bio.topics.find((t) => t.ref === "4.4.1"));
    expect(line).toContain("AQA GCSE Biology (8461), Higher tier");
    expect(line).toContain('4.4.1 "Photosynthesis"');
    expect(line).toContain('"Bioenergetics"');
  });

  it("suggests specs from an exam name", () => {
    expect(suggestSpecs("GCSE Biology Paper 1")[0].id).toBe("aqa-gcse-biology-8461");
    expect(suggestSpecs("IB Chem").length).toBe(0);
    expect(suggestSpecs("IB Chemistry")[0].id).toBe("ib-chemistry-2025");
    expect(suggestSpecs("Maths mock", "GCSE").map((s) => s.board)).toEqual([
      "AQA",
      "Pearson Edexcel",
      "OCR",
    ]);
    expect(suggestSpecs("Edexcel maths")[0].id).toBe("edexcel-gcse-maths-1ma1");
  });

  it("returns null for unknown ids", () => {
    expect(getSpec("nope")).toBeNull();
    expect(getSpec(null)).toBeNull();
  });
});
