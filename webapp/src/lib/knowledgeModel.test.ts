import { describe, expect, it } from "vitest";
import type { Attempt } from "./attempts";
import { answerWeight, bktPosterior, buildKnowledge, foldTopic, KM } from "./knowledgeModel";

const now = new Date("2026-10-09T12:00:00Z");
const DAY = 86_400_000;
let n = 0;

function ans(overrides: Partial<Attempt> & { daysAgo?: number } = {}): Attempt {
  const { daysAgo = 0, ...rest } = overrides;
  n += 1;
  return {
    id: `a${n}`,
    topicKey: "osmosis",
    skill: null,
    ref: `bank:q${n}`,
    correct: true,
    chosenIndex: 0,
    options: 4,
    kind: "recall",
    verified: true,
    confidence: null,
    secondsSpent: 20,
    hintRung: 0,
    misconception: null,
    occurredAt: new Date(now.getTime() - daysAgo * DAY - 3600_000).toISOString(),
    source: "quiz",
    ...rest,
  };
}

describe("bktPosterior", () => {
  it("a right answer to a 4-option question raises belief less than one to an open question", () => {
    const mcq = bktPosterior(0.25, true, 0.25);
    const open = bktPosterior(0.25, true, KM.openGuess);
    expect(mcq).toBeGreaterThan(0.25);
    expect(open).toBeGreaterThan(mcq);
  });

  it("a wrong answer lowers belief", () => {
    expect(bktPosterior(0.8, false, 0.25)).toBeLessThan(0.8);
  });
});

describe("answerWeight", () => {
  it("gives nothing for an unverified key or a hinted right answer", () => {
    expect(answerWeight(ans({ verified: false }), new Set())).toBe(0);
    expect(answerWeight(ans({ hintRung: 1 }), new Set())).toBe(0);
  });

  it("still counts a hinted wrong answer, and discounts repeats, guesses and slow answers", () => {
    expect(answerWeight(ans({ correct: false, hintRung: 3 }), new Set())).toBe(1);
    const a = ans();
    expect(answerWeight(a, new Set([a.ref!]))).toBe(KM.repeatWeight);
    expect(answerWeight(ans({ confidence: "guess" }), new Set())).toBe(KM.doubtWeight);
    expect(answerWeight(ans({ secondsSpent: 200 }), new Set())).toBe(KM.doubtWeight);
  });
});

describe("foldTopic", () => {
  it("one right answer is Seen, not Recalled", () => {
    const k = foldTopic("osmosis", [ans()], now);
    expect(k.rung).toBe(1);
    expect(k.status).toBe("learning");
  });

  it("many right recall answers never reach Applied without an application question", () => {
    const list = Array.from({ length: 8 }, (_, i) => ans({ daysAgo: i % 3 }));
    const k = foldTopic("osmosis", list, now);
    expect(k.rung).toBe(2);
    expect(k.status).not.toBe("secure");
  });

  it("is secure with three different questions over two days including an application", () => {
    const k = foldTopic(
      "osmosis",
      [
        ans({ daysAgo: 3 }),
        ans({ daysAgo: 3 }),
        ans({ daysAgo: 1, kind: "apply" }),
        ans({ daysAgo: 1 }),
        ans({ daysAgo: 0, kind: "apply" }),
      ],
      now,
    );
    expect(k.rung).toBe(3);
    expect(k.status).toBe("secure");
    expect(k.rightDays).toBeGreaterThanOrEqual(2);
  });

  it("the same question answered over and over is not mastery", () => {
    const list = Array.from({ length: 10 }, (_, i) => ans({ ref: "bank:same", daysAgo: i % 4 }));
    const k = foldTopic("osmosis", list, now);
    expect(k.rightItems).toBe(1);
    expect(k.status).not.toBe("secure");
  });

  it("unverified answers leave a topic unmeasured", () => {
    const k = foldTopic("osmosis", [ans({ verified: false }), ans({ verified: false })], now);
    expect(k.status).toBe("unmeasured");
    expect(k.rung).toBe(0);
  });

  it("belief fades between answers and over time", () => {
    const recent = foldTopic("osmosis", [ans({ daysAgo: 0 }), ans({ daysAgo: 0 })], now);
    const old = foldTopic("osmosis", [ans({ daysAgo: 30 }), ans({ daysAgo: 30 })], now);
    expect(old.p).toBeLessThan(recent.p);
    expect(recent.pInWeek).toBeLessThan(recent.p);
  });

  it("ignores evidence past the horizon", () => {
    const k = foldTopic("osmosis", [ans({ daysAgo: KM.horizonDays + 2 })], now);
    expect(k.status).toBe("unmeasured");
  });
});

describe("buildKnowledge", () => {
  it("groups by skill when named, else by topic key", () => {
    const map = buildKnowledge(
      [ans({ skill: "aqa-gcse-biology-8461:4.1.3" }), ans({ topicKey: "enzymes" })],
      now,
    );
    expect([...map.keys()].sort()).toEqual(["aqa-gcse-biology-8461:4.1.3", "enzymes"]);
  });
});
