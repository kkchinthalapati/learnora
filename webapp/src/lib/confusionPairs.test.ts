import { beforeEach, describe, expect, it } from "vitest";
import type { Misconception } from "./misconceptions";
import { formatMisconceptionsForPrompt } from "./misconceptions";
import { getKnownMisconception } from "./misconceptionCatalogue";
import { CONFUSABLE_PAIRS, getPair } from "./confusionPairData";
import {
  activePairs,
  confusionPromptBlock,
  confusionQuizFocus,
  drillOrder,
  GOOD_GAP_DAYS,
  isPairDue,
  ledgerOutcome,
  loadPairState,
  namedPairForRow,
  nextDuePair,
  pairsMentionedIn,
  savePairResult,
  tellApartHref,
  WEAK_GAP_DAYS,
  type DrillAnswer,
} from "./confusionPairs";

const NOW = new Date("2026-10-27T09:00:00Z");
const DAY = 86_400_000;

function row(patch: Partial<Misconception> = {}): Misconception {
  return {
    id: "m1",
    subject: "Physics",
    concept: "Free fall",
    conceptKey: "free fall",
    summary: "Heavier objects fall faster than lighter ones.",
    status: "open",
    severity: "moderate",
    originTool: "quiz",
    timesObserved: 1,
    timesCorrected: 0,
    firstSeenAt: "2026-10-12T09:00:00.000Z",
    lastSeenAt: "2026-10-20T09:00:00.000Z",
    resolvedAt: null,
    ...patch,
  };
}

const massWeight = (patch: Partial<Misconception> = {}) =>
  row({
    id: "mw",
    concept: "Mass and weight",
    summary: "Mass and weight are the same thing, so mass changes on the Moon.",
    catalogueId: "phys-mass-weight",
    ...patch,
  });

beforeEach(() => localStorage.clear());

describe("the pairs' content", () => {
  it("has unique ids and links only to real catalogue entries", () => {
    const ids = CONFUSABLE_PAIRS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of CONFUSABLE_PAIRS) {
      for (const c of p.catalogueIds) expect(getKnownMisconception(c), `${p.id} → ${c}`).not.toBeNull();
    }
  });

  it("gives every pair six statements, three for each side, each with a reason", () => {
    for (const p of CONFUSABLE_PAIRS) {
      expect(p.statements, p.id).toHaveLength(6);
      expect(p.statements.filter((s) => s.side === "a"), p.id).toHaveLength(3);
      expect(p.statements.filter((s) => s.side === "b"), p.id).toHaveLength(3);
      for (const s of p.statements) {
        expect(s.text.trim().length, `${p.id}: ${s.text}`).toBeGreaterThan(8);
        expect(s.why.trim().length, `${p.id}: ${s.text}`).toBeGreaterThan(10);
      }
      expect(new Set(p.statements.map((s) => s.text)).size, p.id).toBe(6);
    }
  });

  it("keeps cues lowercase so they match normalised ledger text", () => {
    for (const p of CONFUSABLE_PAIRS) {
      for (const side of [p.a, p.b]) {
        expect(side.cues.length, p.id).toBeGreaterThan(0);
        for (const c of side.cues) expect(c).toBe(c.toLowerCase());
      }
    }
  });

  it("looks a pair up by id", () => {
    expect(getPair("mass-weight")?.a.term).toBe("Mass");
    expect(getPair("nope")).toBeNull();
  });
});

describe("activePairs", () => {
  it("names a confusion when the row's own catalogue belief is the pair", () => {
    const [p] = activePairs([massWeight()]);
    expect(p.pair.id).toBe("mass-weight");
    expect(p.kind).toBe("named");
  });

  it("names it when one row's own words mention both terms", () => {
    const [p] = activePairs([
      row({ concept: "Forces", summary: "Thinks weight and mass are the same quantity." }),
    ]);
    expect(p.pair.id).toBe("mass-weight");
    expect(p.kind).toBe("named");
  });

  it("only says 'slipped on both' when two separate rows each touch one side", () => {
    const [p] = activePairs([
      row({ id: "a", subject: "Biology", concept: "Mitosis", summary: "Gets the stages in the wrong order." }),
      row({ id: "b", subject: "Biology", concept: "Meiosis", summary: "Forgets chromosomes are halved at the start." }),
    ]);
    expect(p.pair.id).toBe("mitosis-meiosis");
    expect(p.kind).toBe("both");
    expect(p.rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("does nothing with one side alone", () => {
    expect(
      activePairs([row({ subject: "Biology", concept: "Mitosis", summary: "Mixes up the stages." })]),
    ).toEqual([]);
  });

  it("ignores fixed rows, and AI labels seen only once", () => {
    expect(activePairs([massWeight({ status: "resolved" })])).toEqual([]);
    expect(activePairs([massWeight({ provisional: true, timesObserved: 1 })])).toEqual([]);
    expect(activePairs([massWeight({ provisional: true, timesObserved: 2 })])).toHaveLength(1);
  });

  it("keeps a pair inside its own subject", () => {
    expect(
      activePairs([
        row({ subject: "Chemistry", concept: "Relative formula mass", summary: "Confuses mass and weight of an atom." }),
      ]),
    ).toEqual([]);
  });

  it("reads 'Maths' as Mathematics", () => {
    const [p] = activePairs([
      row({ subject: "Maths", concept: "Straight lines", summary: "Says the gradient is where the line meets the y intercept." }),
    ]);
    expect(p.pair.id).toBe("gradient-intercept");
  });

  it("ranks named before both, then by how much evidence there is", () => {
    const ranked = activePairs([
      row({ id: "a", subject: "Biology", concept: "Mitosis", summary: "Stage order.", timesObserved: 9 }),
      row({ id: "b", subject: "Biology", concept: "Meiosis", summary: "Chromosome halving.", timesObserved: 9 }),
      massWeight({ timesObserved: 1 }),
    ]);
    expect(ranked.map((p) => p.pair.id)).toEqual(["mass-weight", "mitosis-meiosis"]);
  });

  it("sums sightings and keeps the latest day", () => {
    const [p] = activePairs([
      massWeight({ timesObserved: 2, lastSeenAt: "2026-10-01T00:00:00Z" }),
      row({ id: "x", concept: "Weight", summary: "Mass and weight again.", timesObserved: 3, lastSeenAt: "2026-10-22T00:00:00Z" }),
    ]);
    expect(p.observed).toBe(5);
    expect(p.lastSeenAt).toBe("2026-10-22T00:00:00Z");
  });
});

describe("namedPairForRow and pairsMentionedIn", () => {
  it("finds the pair a named row belongs to, and none for a 'both' row", () => {
    const mw = massWeight();
    expect(namedPairForRow([mw], mw)?.pair.id).toBe("mass-weight");
    const a = row({ id: "a", subject: "Biology", concept: "Mitosis", summary: "x" });
    const b = row({ id: "b", subject: "Biology", concept: "Meiosis", summary: "y" });
    expect(namedPairForRow([a, b], a)).toBeNull();
  });

  it("matches a page's title or headings to either side of an active pair", () => {
    const active = activePairs([massWeight()]);
    expect(pairsMentionedIn(active, "Forces, Weight and gravity")).toHaveLength(1);
    expect(pairsMentionedIn(active, "Photosynthesis")).toEqual([]);
    expect(pairsMentionedIn(active, "Massive stars")).toEqual([]);
  });
});

describe("when a pair is due", () => {
  it("is due until it has been drilled, then waits by how well it went", () => {
    expect(isPairDue("mass-weight", {}, NOW)).toBe(true);
    const weak = { "mass-weight": { at: new Date(NOW.getTime() - (WEAK_GAP_DAYS - 1) * DAY).toISOString(), correct: 3, total: 6 } };
    expect(isPairDue("mass-weight", weak, NOW)).toBe(false);
    const weakDue = { "mass-weight": { at: new Date(NOW.getTime() - WEAK_GAP_DAYS * DAY).toISOString(), correct: 3, total: 6 } };
    expect(isPairDue("mass-weight", weakDue, NOW)).toBe(true);
    const good = { "mass-weight": { at: new Date(NOW.getTime() - (GOOD_GAP_DAYS - 1) * DAY).toISOString(), correct: 5, total: 6 } };
    expect(isPairDue("mass-weight", good, NOW)).toBe(false);
    const goodDue = { "mass-weight": { at: new Date(NOW.getTime() - GOOD_GAP_DAYS * DAY).toISOString(), correct: 6, total: 6 } };
    expect(isPairDue("mass-weight", goodDue, NOW)).toBe(true);
  });

  it("offers the strongest due pair, skipping one done today", () => {
    const active = activePairs([
      massWeight({ timesObserved: 3 }),
      row({ id: "r", subject: "Biology", concept: "Respiration", summary: "Says respiration is the same as breathing." }),
    ]);
    expect(nextDuePair(active, {}, NOW)?.pair.id).toBe("mass-weight");
    const done = { "mass-weight": { at: NOW.toISOString(), correct: 6, total: 6 } };
    expect(nextDuePair(active, done, NOW)?.pair.id).toBe("respiration-breathing");
    expect(nextDuePair([], {}, NOW)).toBeNull();
  });

  it("round-trips a result through storage and shrugs off junk", () => {
    savePairResult("mass-weight", 5, 6, NOW);
    expect(loadPairState()["mass-weight"]).toEqual({ at: NOW.toISOString(), correct: 5, total: 6 });
    localStorage.setItem("learnora_tell_apart_v1", JSON.stringify({ a: "nope", b: { at: 1 }, c: null }));
    expect(loadPairState()).toEqual({});
    localStorage.setItem("learnora_tell_apart_v1", "[1,2]");
    expect(loadPairState()).toEqual({});
  });
});

describe("drillOrder", () => {
  const pair = getPair("series-parallel")!;

  it("is a shuffle of the same six, repeatable from its seed", () => {
    const one = drillOrder(pair, 7);
    expect([...one].map((s) => s.text).sort()).toEqual(pair.statements.map((s) => s.text).sort());
    expect(drillOrder(pair, 7)).toEqual(one);
    expect(drillOrder(pair, 8)).not.toEqual(one);
  });

  it("never runs more than two from the same side in a row", () => {
    for (let seed = 0; seed < 40; seed++) {
      const o = drillOrder(pair, seed);
      for (let i = 2; i < o.length; i++) {
        expect(o[i].side === o[i - 1].side && o[i].side === o[i - 2].side, `seed ${seed}`).toBe(false);
      }
    }
  });
});

describe("ledgerOutcome", () => {
  const pair = getPair("mass-weight")!;
  const answers = (missed: number): DrillAnswer[] =>
    pair.statements.map((statement, i) => ({
      statement,
      picked: i < missed ? (statement.side === "a" ? "b" : "a") : statement.side,
    }));

  it("is evidence from two misses, a correction from none, and silent for one", () => {
    expect(ledgerOutcome(answers(0))).toBe("correction");
    expect(ledgerOutcome(answers(1))).toBe("none");
    expect(ledgerOutcome(answers(2))).toBe("evidence");
    expect(ledgerOutcome(answers(6))).toBe("evidence");
    expect(ledgerOutcome([])).toBe("none");
  });
});

describe("the prompts", () => {
  it("say nothing without a named confusion", () => {
    expect(confusionPromptBlock([])).toBe("");
    expect(confusionQuizFocus([])).toBe("");
    const both = [
      row({ id: "a", subject: "Biology", concept: "Mitosis", summary: "x" }),
      row({ id: "b", subject: "Biology", concept: "Meiosis", summary: "y" }),
    ];
    expect(confusionPromptBlock(both)).toBe("");
    expect(confusionQuizFocus(both)).toBe("");
  });

  it("carry a named pair, its difference, and the instruction not to announce it", () => {
    const block = confusionPromptBlock([massWeight({ timesObserved: 2 })]);
    expect(block).toContain("CONFUSED PAIRS");
    expect(block).toContain("Mass and Weight (2 sightings)");
    expect(block).toContain(getPair("mass-weight")!.difference);
    expect(block).toContain("do not announce");
    expect(confusionQuizFocus([massWeight()])).toContain("whose most tempting WRONG option is the other idea");
  });

  it("reach every prompt that carries the ledger", () => {
    const text = formatMisconceptionsForPrompt([massWeight()], { now: NOW });
    expect(text).toContain("MISCONCEPTION LEDGER");
    expect(text).toContain("CONFUSED PAIRS");
    expect(formatMisconceptionsForPrompt([row()], { now: NOW })).not.toContain("CONFUSED PAIRS");
  });
});

describe("tellApartHref", () => {
  it("encodes the id", () => {
    expect(tellApartHref("mass-weight")).toBe("/tell-apart/mass-weight");
    expect(tellApartHref("a b")).toBe("/tell-apart/a%20b");
  });
});
