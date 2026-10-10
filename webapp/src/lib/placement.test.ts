import { describe, expect, it } from "vitest";
import { getSpec } from "./syllabus";
import {
  nextPlacementTopic,
  PLACEMENT_MAX_QUESTIONS,
  placementResult,
  recordPlacement,
  startPlacement,
} from "./placement";

const spec = getSpec("cbse-10-maths-041")!;
const tier = "Standard" as const;

describe("placement check", () => {
  it("opens on a topic with the most riding on it", () => {
    const first = nextPlacementTopic(spec, tier, startPlacement(spec, tier));
    expect(first).not.toBeNull();
    /* Real Numbers (1) and Polynomials (2) underpin most of the course. */
    expect(["1", "2", "6"]).toContain(first);
  });

  it("a right answer lends confidence to prerequisites; a wrong one doubts dependents", () => {
    let s = startPlacement(spec, tier);
    s = recordPlacement(spec, s, "4", "right"); // Quadratic Equations ← Polynomials ← Real Numbers
    expect(s.belief["2"]).toBeGreaterThanOrEqual(0.75);
    expect(s.belief["1"]).toBeGreaterThanOrEqual(0.75);
    s = recordPlacement(spec, s, "8", "not-learned"); // Intro to Trigonometry → Applications
    expect(s.belief["9"]).toBeLessThanOrEqual(0.3);
  });

  it("never asks about a settled topic, and stops at the cap", () => {
    let s = startPlacement(spec, tier);
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const ref = nextPlacementTopic(spec, tier, s);
      if (!ref) break;
      expect(seen).not.toContain(ref);
      seen.push(ref);
      s = recordPlacement(spec, s, ref, i % 2 ? "right" : "wrong");
    }
    expect(seen.length).toBeLessThanOrEqual(PLACEMENT_MAX_QUESTIONS);
  });

  it("only asks where the bank has a question", () => {
    const ref = nextPlacementTopic(spec, tier, startPlacement(spec, tier), (r) => r === "13");
    expect(ref).toBe("13");
  });

  it("lists gaps foundations first", () => {
    let s = startPlacement(spec, tier);
    s = recordPlacement(spec, s, "9", "wrong");
    s = recordPlacement(spec, s, "8", "wrong");
    s = recordPlacement(spec, s, "6", "wrong");
    const { gaps } = placementResult(spec, s);
    expect(gaps.indexOf("6")).toBeLessThan(gaps.indexOf("8"));
    expect(gaps.indexOf("8")).toBeLessThan(gaps.indexOf("9"));
  });
});
