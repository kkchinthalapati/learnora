import { describe, expect, it } from "vitest";
import type { Misconception } from "./misconceptions";
import { formatMisconceptionsForPrompt } from "./misconceptions";
import { MISCONCEPTION_CATALOGUE } from "./misconceptionCatalogue";
import {
  HABITS,
  categoryOf,
  habitBySlug,
  habitHref,
  habitPromptBlock,
  habitQuizFocus,
  habitSentence,
  habitsForStudent,
  habitsForSubject,
  joinSubjects,
  subjectIs,
} from "./errorHabits";

const NOW = new Date("2026-10-27T09:00:00Z");

function row(catalogueId: string, patch: Partial<Misconception> = {}): Misconception {
  const entry = MISCONCEPTION_CATALOGUE.find((e) => e.id === catalogueId)!;
  return {
    id: catalogueId,
    subject: entry.subject,
    concept: entry.concept,
    conceptKey: entry.concept.toLowerCase(),
    summary: entry.belief,
    status: "open",
    severity: "moderate",
    originTool: "quiz",
    timesObserved: 1,
    timesCorrected: 0,
    firstSeenAt: "2026-10-12T09:00:00.000Z",
    lastSeenAt: "2026-10-20T09:00:00.000Z",
    resolvedAt: null,
    catalogueId,
    ...patch,
  };
}

/* Three real "Overgeneralisation" beliefs, one in each of three subjects. */
const physics = (p: Partial<Misconception> = {}) => row("phys-heavier-falls-faster", p);
const biology = (p: Partial<Misconception> = {}) => row("bio-antibiotics-viruses", p);
const maths = (p: Partial<Misconception> = {}) => row("maths-multiply-makes-bigger", p);

describe("the habits' content", () => {
  it("covers every catalogue category except the one left out on purpose", () => {
    const categories = new Set(MISCONCEPTION_CATALOGUE.map((e) => e.category));
    for (const c of categories) {
      if (c === "Term conflation") expect(c in HABITS).toBe(false);
      else expect(c in HABITS, `no habit for "${c}"`).toBe(true);
    }
  });

  it("has unique slugs and complete text, in sentence case", () => {
    const slugs = Object.values(HABITS).map((h) => h.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const h of Object.values(HABITS)) {
      for (const text of [h.name, h.looksLike, h.move, h.question]) expect(text.trim().length).toBeGreaterThan(8);
      expect(h.name[0]).toBe(h.name[0].toUpperCase());
      expect(habitBySlug(h.slug)?.category).toBe(h.category);
    }
  });

  it("looks a habit up by slug", () => {
    expect(habitBySlug("overgeneralisation")?.name).toBe("Stretching a rule too far");
    expect(habitBySlug("nope")).toBeNull();
    expect(habitHref(HABITS.Overgeneralisation)).toBe("/analytics/habits/overgeneralisation");
  });
});

describe("habitsForStudent", () => {
  it("calls it spreading when open mistakes of one kind are in two subjects", () => {
    const [h] = habitsForStudent([physics(), biology()]);
    expect(h.habit.category).toBe("Overgeneralisation");
    expect(h.kind).toBe("spreading");
    expect(h.openSubjects.sort()).toEqual(["Biology", "Physics"]);
    expect(h.open).toHaveLength(2);
  });

  it("needs two subjects: two mistakes of one kind in one subject is not a cross-subject habit", () => {
    expect(habitsForStudent([biology(), row("bio-arteries-oxygenated")])).toEqual([]);
  });

  it("calls it carry-over when one is open and the same kind is fixed in another subject", () => {
    const [h] = habitsForStudent([physics({ status: "resolved", resolvedAt: "2026-10-25T00:00:00Z" }), biology()]);
    expect(h.kind).toBe("carry-over");
    expect(h.openSubjects).toEqual(["Biology"]);
    expect(h.fixedSubjects).toEqual(["Physics"]);
    expect(habitSentence(h)).toBe("You fixed this in Physics. Watch for it in Biology.");
  });

  it("says nothing when everything of that kind is fixed, or when it is fixed only where it is also open", () => {
    expect(habitsForStudent([physics({ status: "resolved" }), biology({ status: "resolved" })])).toEqual([]);
    expect(
      habitsForStudent([physics({ status: "resolved" }), row("phys-sound-in-vacuum")]),
    ).toEqual([]);
  });

  it("leaves out slips, and AI labels seen only once", () => {
    expect(habitsForStudent([physics(), biology({ errorType: "calculation" })])).toEqual([]);
    expect(habitsForStudent([physics(), biology({ provisional: true, timesObserved: 1 })])).toEqual([]);
    expect(habitsForStudent([physics(), biology({ provisional: true, timesObserved: 2 })])).toHaveLength(1);
  });

  it("leaves out term conflation, which is the pairs' job", () => {
    const rows = [row("bio-respiration-is-breathing"), row("chem-ionic-sharing")];
    expect(rows.every((r) => categoryOf(r) === null)).toBe(true);
    expect(habitsForStudent(rows)).toEqual([]);
  });

  it("finds the entry for a row with no catalogue id by reading its diagnosis", () => {
    const loose = physics({ catalogueId: null, concept: "Free fall", summary: "Thinks heavier objects fall faster." });
    expect(categoryOf(loose)).toBe("Overgeneralisation");
    expect(habitsForStudent([loose, biology()])).toHaveLength(1);
  });

  it("reads a row filed under 'Maths' as Mathematics, by the catalogue's own subject", () => {
    const [h] = habitsForStudent([maths({ subject: "GCSE Maths" }), physics()]);
    expect(h.openSubjects.sort()).toEqual(["Mathematics", "Physics"]);
  });

  it("ranks spreading before carry-over, then by subjects, then by sightings", () => {
    const ranked = habitsForStudent([
      /* carry-over: reversed process */
      row("chem-exo-endo-swapped", { status: "resolved" }),
      row("phys-cold-flows"),
      /* spreading in two subjects, lightly seen */
      physics({ timesObserved: 1 }),
      biology({ timesObserved: 1 }),
    ]);
    expect(ranked.map((h) => [h.habit.category, h.kind])).toEqual([
      ["Overgeneralisation", "spreading"],
      ["Reversed process", "carry-over"],
    ]);
    const three = habitsForStudent([physics({ timesObserved: 1 }), biology({ timesObserved: 1 }), maths({ timesObserved: 1 })]);
    expect(three[0].openSubjects).toHaveLength(3);
  });

  it("sums sightings across the open rows only", () => {
    const [h] = habitsForStudent([physics({ timesObserved: 2 }), biology({ timesObserved: 3 }), maths({ status: "resolved", timesObserved: 9 })]);
    expect(h.observed).toBe(5);
  });
});

describe("how it is worded", () => {
  it("says only what the ledger shows", () => {
    const [h] = habitsForStudent([physics(), biology(), maths()]);
    expect(habitSentence(h)).toMatch(/^Shows up in (Mathematics|Biology|Physics), (Mathematics|Biology|Physics) and (Mathematics|Biology|Physics)\.$/);
    expect(joinSubjects(["Physics"])).toBe("Physics");
    expect(joinSubjects(["Physics", "Biology"])).toBe("Physics and Biology");
    expect(joinSubjects([])).toBe("");
  });
});

describe("subjects", () => {
  it("matches a student's own name for a subject to the catalogue's", () => {
    expect(subjectIs("Mathematics", "GCSE Maths")).toBe(true);
    expect(subjectIs("Mathematics", "Mathematics")).toBe(true);
    expect(subjectIs("Physics", "Physics (AQA)")).toBe(true);
    expect(subjectIs("Physics", "Chemistry")).toBe(false);
    expect(subjectIs("Physics", "  ")).toBe(false);
  });

  it("finds the habits that touch a subject, open or fixed there", () => {
    const spreading = habitsForStudent([physics(), biology()]);
    expect(habitsForSubject(spreading, "Biology")).toHaveLength(1);
    expect(habitsForSubject(spreading, "History")).toEqual([]);
    const carry = habitsForStudent([physics({ status: "resolved" }), biology()]);
    expect(habitsForSubject(carry, "Physics")).toHaveLength(1);
  });
});

describe("the prompts", () => {
  it("say nothing without a cross-subject habit", () => {
    expect(habitPromptBlock([])).toBe("");
    expect(habitPromptBlock([physics()])).toBe("");
    expect(habitQuizFocus([])).toBe("");
    expect(habitQuizFocus([physics()])).toBe("");
  });

  it("carry the habit, the move that helps, and the rule not to call it a verdict", () => {
    const block = habitPromptBlock([physics(), biology()]);
    expect(block).toContain("CROSS-SUBJECT HABITS");
    expect(block).toContain("Stretching a rule too far (open in");
    const carry = habitPromptBlock([physics({ status: "resolved" }), biology()]);
    expect(carry).toContain("(fixed in Physics, still open in Biology)");
    expect(block).toContain(HABITS.Overgeneralisation.move);
    expect(block).toContain("Never say they always do it");
    expect(block).not.toContain(physics().summary);
  });

  it("only asks the quiz for a habit that is spreading, not carry-over", () => {
    expect(habitQuizFocus([physics({ status: "resolved" }), biology()])).toBe("");
    const focus = habitQuizFocus([physics(), biology()]);
    expect(focus).toContain("whose most tempting WRONG option comes from one of these habits");
    expect(focus).toContain("Do not name the habit");
  });

  it("reach every prompt that carries the ledger", () => {
    const text = formatMisconceptionsForPrompt([physics(), biology()], { now: NOW });
    expect(text).toContain("MISCONCEPTION LEDGER");
    expect(text).toContain("CROSS-SUBJECT HABITS");
    expect(formatMisconceptionsForPrompt([physics()], { now: NOW })).not.toContain("CROSS-SUBJECT HABITS");
  });
});
