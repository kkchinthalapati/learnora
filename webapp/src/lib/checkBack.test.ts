import { describe, expect, it } from "vitest";
import {
  checkBackHref,
  checkBackOutcome,
  mixUpState,
  nextCheckBack,
  onDay,
} from "./checkBack";
import { questionKey } from "./questionKey";
import type { Misconception } from "./misconceptions";

const NOW = new Date("2026-10-10T09:00:00Z");

function row(patch: Partial<Misconception> = {}): Misconception {
  return {
    id: "m1",
    subject: "Biology",
    concept: "Osmosis",
    conceptKey: "osmosis",
    summary: "Salt soaks into cells.",
    status: "improving",
    severity: "moderate",
    originTool: "quiz",
    timesObserved: 2,
    timesCorrected: 0,
    firstSeenAt: "2026-10-01T09:00:00Z",
    lastSeenAt: "2026-10-05T09:00:00Z",
    resolvedAt: null,
    repairedAt: "2026-10-05T09:00:00Z",
    retestDueAt: "2026-10-07T09:00:00Z",
    excludedQuestionKeys: [],
    ...patch,
  };
}

describe("mix-up state", () => {
  it("is Fixed, Check-back ready or Fixing", () => {
    expect(mixUpState(row({ status: "resolved" }), NOW)).toBe("fixed");
    expect(mixUpState(row(), NOW)).toBe("check_back_ready");
    expect(mixUpState(row({ retestDueAt: "2026-10-12T09:00:00Z" }), NOW)).toBe(
      "fixing",
    );
    expect(
      mixUpState(
        row({ repairedAt: null, retestDueAt: null, status: "open" }),
        NOW,
      ),
    ).toBe("fixing");
  });

  it("leads Today with the check-back that has waited longest", () => {
    const older = row({ id: "old", retestDueAt: "2026-10-06T09:00:00Z" });
    expect(
      nextCheckBack(
        [
          row(),
          older,
          row({ id: "later", retestDueAt: "2026-10-20T09:00:00Z" }),
        ],
        NOW,
      )?.id,
    ).toBe("old");
    expect(nextCheckBack([], NOW)).toBeNull();
  });

  it("links to its own check-back screen", () => {
    expect(checkBackHref("a b")).toBe("/check-back/a%20b");
  });
});

describe("check-back outcome follows the loop's rule", () => {
  it("is Fixed only for a right answer on a new question at least two days after the re-teach", () => {
    expect(
      checkBackOutcome(row(), "Which way does water move?", true, NOW),
    ).toBe("fixed");
  });

  it("is not Fixed for a question already tied to this mix-up", () => {
    const q = "Which way does water move?";
    expect(
      checkBackOutcome(
        row({ excludedQuestionKeys: [questionKey(q)] }),
        q,
        true,
        NOW,
      ),
    ).toBe("improving");
  });

  it("is not Fixed too soon after the re-teach", () => {
    expect(
      checkBackOutcome(
        row({ repairedAt: "2026-10-09T09:00:00Z" }),
        "New?",
        true,
        NOW,
      ),
    ).toBe("improving");
  });

  it("is Not yet for a wrong answer", () => {
    expect(checkBackOutcome(row(), "New?", false, NOW)).toBe("not_yet");
  });

  it("names the day the belief was re-taught", () => {
    expect(onDay("2026-10-05T09:00:00Z", NOW)).toBe("On Monday");
    expect(onDay("2026-09-01T09:00:00Z", NOW)).toMatch(/^On Tue 1 Sept?$/);
  });
});
