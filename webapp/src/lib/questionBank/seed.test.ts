import { describe, expect, it } from "vitest";
import { LEARNORA_SEED } from "./seed";
import { SYLLABUS_SPECS, bankKey } from "../syllabus";
import { getKnownMisconception } from "../misconceptionCatalogue";
import { gradeNumeric } from "../numericAnswer";

/* Guards the hand-written seed: every question must point at a real spec
   section, be askable at its tier, and have exactly one defensible answer as
   far as a machine can check. */

function specFor(key: string) {
  const spec = SYLLABUS_SPECS.find((s) => bankKey(s) === key);
  if (!spec) throw new Error(`No spec for bank key ${key}`);
  return spec;
}

function fractionValue(text: string): number | null {
  const m = /^\s*(-?\d+)\s*\/\s*(\d+)\s*$/.exec(text);
  return m ? Number(m[1]) / Number(m[2]) : null;
}

describe("Learnora seed questions", () => {
  it("covers every topic of the GCSE sciences and maths at least once", () => {
    for (const [key, entries] of Object.entries(LEARNORA_SEED)) {
      const refs = new Set(entries.map((e) => e.ref));
      for (const topic of specFor(key).topics) expect(refs.has(topic.ref)).toBe(true);
    }
  });

  for (const [key, entries] of Object.entries(LEARNORA_SEED)) {
    describe(key, () => {
      const spec = specFor(key);
      const byRef = new Map(spec.topics.map((t) => [t.ref, t]));

      it("has no duplicate questions", () => {
        const qs = entries.map((e) => e.q.trim().toLowerCase());
        expect(new Set(qs).size).toBe(qs.length);
      });

      for (const [i, e] of entries.entries()) {
        it(`#${i} ${e.ref}: ${e.q.slice(0, 50)}`, () => {
          const topic = byRef.get(e.ref);
          expect(topic, `unknown ref ${e.ref}`).toBeDefined();
          if (e.num) {
            /* A typed-in answer: one shown key, and that key must itself mark
               as correct, so what students see and what is marked agree. */
            expect(e.c).toHaveLength(1);
            expect(e.a).toBe(0);
            expect(gradeNumeric(e.c[0], e.num).correct, `shown key "${e.c[0]}" vs ${e.num.value}`).toBe(true);
            return;
          }
          expect(e.c.length).toBeGreaterThanOrEqual(3);
          expect(e.c.length).toBeLessThanOrEqual(5);
          expect(Number.isInteger(e.a) && e.a >= 0 && e.a < e.c.length).toBe(true);
          expect(new Set(e.c.map((c) => c.trim().toLowerCase())).size).toBe(e.c.length);
          expect(e.why.trim().length).toBeGreaterThan(10);
          if (e.tier) expect(spec.tiers).toContain(e.tier);
          // a question on a tier-only topic must be marked with that tier
          if (topic?.tierOnly) expect(e.tier).toBe(topic.tierOnly);
          // two choices that are the same fraction would be two right answers
          const values = e.c.map(fractionValue).filter((v): v is number => v !== null);
          expect(new Set(values).size).toBe(values.length);
        });
      }
    });
  }
});

describe("mapped distractors", () => {
  it("name catalogue misconceptions, one per choice, and never the key", () => {
    let mapped = 0;
    for (const entries of Object.values(LEARNORA_SEED)) {
      for (const e of entries) {
        if (!e.mis) continue;
        expect(e.mis).toHaveLength(e.c.length);
        expect(e.mis[e.a]).toBeNull();
        for (const id of e.mis) {
          if (id === null) continue;
          mapped += 1;
          expect(getKnownMisconception(id), `unknown misconception ${id}`).not.toBeNull();
        }
      }
    }
    expect(mapped).toBeGreaterThan(0);
  });

  it("CBSE questions state their kind, and some ask to apply", () => {
    for (const key of ["cbse-10-science-086", "cbse-10-maths-041"]) {
      const entries = LEARNORA_SEED[key];
      expect(entries.every((e) => e.kind === "recall" || e.kind === "apply")).toBe(true);
      expect(entries.filter((e) => e.kind === "apply").length).toBeGreaterThan(entries.length / 4);
    }
  });
});
