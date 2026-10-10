import { describe, expect, it } from "vitest";
import { getSpec, matchSpecTopic, specLabel, specWithTierLabel, suggestSpecs, weightedTopics } from "./index";
import { CBSE_SPECS } from "./cbse";

/* Unit marks from CBSE's 2025-26 curriculum (out of the 80-mark theory paper). */
const OFFICIAL_UNIT_MARKS: Record<string, number[]> = {
  "cbse-10-science-086": [25, 25, 12, 13, 5],
  "cbse-10-maths-041": [6, 20, 6, 15, 12, 10, 11],
  "cbse-9-science-086": [25, 22, 27, 6],
  "cbse-9-maths-041": [10, 20, 4, 27, 13, 6],
};

describe("CBSE specs", () => {
  it("are registered and labelled with their class", () => {
    const spec = getSpec("cbse-10-science-086")!;
    expect(spec).not.toBeNull();
    expect(specLabel(spec)).toBe("CBSE Class 10 Science (086)");
    /* One paper for everyone: the tier is never shown. */
    expect(specWithTierLabel(spec, "Standard")).toBe("CBSE Class 10 Science (086)");
    expect(specWithTierLabel(getSpec("cbse-10-maths-041")!, "Basic")).toBe(
      "CBSE Class 10 Mathematics (041/241) Basic",
    );
  });

  it.each(CBSE_SPECS.map((s) => [s.id]))("%s carries CBSE's unit marks, and topic weights sum to 100", (id) => {
    const spec = getSpec(id)!;
    const marks = OFFICIAL_UNIT_MARKS[id];
    expect(marks.reduce((a, b) => a + b, 0)).toBe(80);
    for (const tier of spec.tiers) {
      spec.units.forEach((u, i) => expect(u.weightByTier?.[tier]).toBeCloseTo((marks[i] / 80) * 100, 6));
      const total = weightedTopics(spec, tier).reduce((sum, t) => sum + t.weightPercent, 0);
      expect(total).toBeCloseTo(100, 6);
    }
    const refs = spec.topics.map((t) => t.ref);
    expect(new Set(refs).size).toBe(refs.length);
    for (const topic of spec.topics) {
      expect(spec.units.some((u) => u.code === topic.unit)).toBe(true);
      for (const p of topic.prerequisites ?? []) expect(refs).toContain(p);
    }
  });

  it("maps a student's wording onto the NCERT chapter", () => {
    const sci = getSpec("cbse-10-science-086")!;
    expect(matchSpecTopic(sci, "Ohm's law and resistors in series")?.title).toBe("Electricity");
    expect(matchSpecTopic(sci, "concave mirror ray diagrams")?.ref).toBe("9");
    const maths = getSpec("cbse-10-maths-041")!;
    expect(matchSpecTopic(maths, "angle of elevation problems")?.ref).toBe("9");
    expect(matchSpecTopic(maths, "discriminant and nature of roots")?.ref).toBe("4");
  });

  it("can be suggested from a subject name when the board is CBSE", () => {
    expect(suggestSpecs("Mathematics", "CBSE").map((s) => s.id)).toContain("cbse-10-maths-041");
    expect(suggestSpecs("Science", "CBSE").map((s) => s.id)).toEqual(
      expect.arrayContaining(["cbse-10-science-086", "cbse-9-science-086"]),
    );
  });
});
