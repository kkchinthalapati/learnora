import { describe, expect, it } from "vitest";
import type { Misconception } from "./misconceptions";
import { MISCONCEPTION_CATALOGUE } from "./misconceptionCatalogue";
import {
  beliefClause,
  canArguePastYou,
  CONVINCED_AT,
  correctIdeaFor,
  isConvinced,
  MAX_DROP_PER_TURN,
  MAX_RISE_PER_TURN,
  nextBelief,
  pastYouHref,
  START_BELIEF,
} from "./pastYou";

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
    lastSeenAt: "2026-10-12T09:00:00.000Z",
    resolvedAt: null,
    ...patch,
  };
}

const ARGUMENT = "Drop a heavy and a light ball together and they land together.";

describe("canArguePastYou", () => {
  it("argues with a named belief that is still open or improving", () => {
    expect(canArguePastYou(row())).toBe(true);
    expect(canArguePastYou(row({ status: "improving" }))).toBe(true);
  });

  it("leaves fixed rows alone", () => {
    expect(canArguePastYou(row({ status: "resolved" }))).toBe(false);
  });

  it("has nothing to argue with in a slip, a placeholder or an empty summary", () => {
    expect(canArguePastYou(row({ errorType: "calculation" }))).toBe(false);
    expect(canArguePastYou(row({ summary: 'Missed: "Which falls faster?"' }))).toBe(false);
    expect(canArguePastYou(row({ summary: "  " }))).toBe(false);
  });

  it("waits for a provisional AI label to be seen twice before treating it as a belief", () => {
    expect(canArguePastYou(row({ provisional: true, timesObserved: 1 }))).toBe(false);
    expect(canArguePastYou(row({ provisional: true, timesObserved: 2 }))).toBe(true);
  });
});

describe("nextBelief", () => {
  it("never drops more than the cap in one message, so one line can't win", () => {
    expect(nextBelief(START_BELIEF, 0, ARGUMENT)).toBe(START_BELIEF - MAX_DROP_PER_TURN);
    const afterTwo = nextBelief(START_BELIEF - MAX_DROP_PER_TURN, 0, ARGUMENT);
    expect(isConvinced(afterTwo)).toBe(true);
  });

  it("lets past you get surer, a little at a time", () => {
    expect(nextBelief(40, 100, ARGUMENT)).toBe(40 + MAX_RISE_PER_TURN);
    expect(nextBelief(95, 100, ARGUMENT)).toBe(100);
  });

  it("takes a proposal inside the caps as it is, rounded", () => {
    expect(nextBelief(80, 61.6, ARGUMENT)).toBe(62);
  });

  it("ignores a missing or non-numeric proposal", () => {
    expect(nextBelief(70, null, ARGUMENT)).toBe(70);
    expect(nextBelief(70, "lots", ARGUMENT)).toBe(70);
  });

  it("doesn't move for a message too short to carry a reason", () => {
    expect(nextBelief(70, 0, "ur wrong")).toBe(70);
  });

  it("reads a numeric string", () => {
    expect(nextBelief(70, "50", ARGUMENT)).toBe(50);
  });
});

describe("isConvinced", () => {
  it("concedes at the threshold and below", () => {
    expect(isConvinced(CONVINCED_AT)).toBe(true);
    expect(isConvinced(CONVINCED_AT + 1)).toBe(false);
  });
});

describe("correctIdeaFor", () => {
  it("uses the catalogue's own reason and re-teach when the row names an entry", () => {
    const entry = MISCONCEPTION_CATALOGUE[0];
    const idea = correctIdeaFor(row({ catalogueId: entry.id, repairText: "Something else." }));
    expect(idea).toContain(entry.whyWrong);
    expect(idea).toContain(entry.remediation);
    expect(idea).not.toContain("Something else.");
  });

  it("falls back to the stored repair, then to nothing", () => {
    expect(correctIdeaFor(row({ repairText: "Gravity pulls every mass the same.", contrastText: "Air resistance differs." })))
      .toBe("Gravity pulls every mass the same. Air resistance differs.");
    expect(correctIdeaFor(row())).toBe("");
  });
});

describe("beliefClause", () => {
  it("drops the summary's own closing stop so the sentence around it doesn't double up", () => {
    expect(beliefClause("Heavier objects fall faster. ")).toBe("Heavier objects fall faster");
    expect(beliefClause("Is mass the same as weight?")).toBe("Is mass the same as weight");
    expect(beliefClause("Big events have one cause")).toBe("Big events have one cause");
  });
});

describe("pastYouHref", () => {
  it("encodes the id", () => {
    expect(pastYouHref("a b")).toBe("/past-you/a%20b");
  });
});
