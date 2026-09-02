import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET_SCORE,
  INTERVENTION_BLOCK_MINS,
  MAX_CONFIDENCE_BAND,
  UNMEASURED_MASTERY,
  bestTopicFor,
  buildTopicStates,
  decayOneDay,
  forecast,
  learningGain,
  scoreOf,
  type TopicState,
} from "./trajectory";
import type { Flashcard, FlashcardDeck, QuizAttempt } from "../api/types";

const TODAY = "2026-09-01";
const EXAM = "2026-09-15";

function topic(patch: Partial<TopicState> & { id: string }): TopicState {
  return {
    label: patch.id,
    mastery: 0.5,
    evidence: 0.5,
    stabilityDays: 10,
    weight: 1,
    cardCount: 10,
    ...patch,
  };
}

/** Even weights, so a test's expectations are about the model rather than
 *  about which topic happened to carry more cards. */
function evenly(topics: TopicState[]): TopicState[] {
  return topics.map((t) => ({ ...t, weight: 1 / topics.length }));
}

function deck(patch: Partial<FlashcardDeck> & { id: string }): FlashcardDeck {
  return {
    user_id: "u1",
    folder_id: "f1",
    title: `Deck ${patch.id}`,
    created_at: `${TODAY}T00:00:00Z`,
    ...patch,
  } as FlashcardDeck;
}

function card(patch: Partial<Flashcard> & { id: string }): Flashcard {
  return {
    user_id: "u1",
    deck_id: "d1",
    front: "q",
    back: "a",
    next_review_date: `${TODAY}T00:00:00Z`,
    srs_interval: 10,
    ease_factor: 2.5,
    created_at: "2026-08-01T00:00:00Z",
    ...patch,
  } as Flashcard;
}

function attempt(patch: Partial<QuizAttempt> & { id: string }): QuizAttempt {
  return {
    user_id: "u1",
    quiz_id: "q1",
    score: 5,
    total: 10,
    answers_json: null,
    weak_topics: [],
    created_at: `${TODAY}T00:00:00Z`,
    ...patch,
  } as QuizAttempt;
}

/** A flat plan: `mins` every day from today to the exam. */
function plan(mins: number, days = 14): Record<string, number> {
  const out: Record<string, number> = {};
  const d = new Date(`${TODAY}T00:00:00`);
  for (let i = 0; i <= days; i += 1) {
    out[
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    ] = mins;
    d.setDate(d.getDate() + 1);
  }
  return out;
}

describe("learningGain", () => {
  it("is worth far more on a topic you barely know", () => {
    /* The single most useful thing this model says out loud. Students spend
       the hour on the topic they already know because it feels better. */
    const weak = learningGain(0.2, 60);
    const strong = learningGain(0.9, 60);
    expect(weak).toBeGreaterThan(strong * 5);
  });

  it("has diminishing returns within a session", () => {
    const first = learningGain(0.3, 60);
    const twoHours = learningGain(0.3, 120);
    expect(twoHours).toBeGreaterThan(first);
    expect(twoHours).toBeLessThan(first * 2);
  });

  it("never pushes past mastery", () => {
    expect(0.5 + learningGain(0.5, 100000)).toBeLessThanOrEqual(1);
    expect(learningGain(1, 600)).toBe(0);
  });

  it("is zero for no time spent", () => {
    expect(learningGain(0.4, 0)).toBe(0);
    expect(learningGain(0.4, -30)).toBe(0);
  });
});

describe("decayOneDay", () => {
  it("loses ground every day", () => {
    expect(decayOneDay(0.8, 10)).toBeLessThan(0.8);
  });

  it("loses it more slowly the more stable the memory", () => {
    expect(decayOneDay(0.8, 30)).toBeGreaterThan(decayOneDay(0.8, 3));
  });

  it("keeps a floor on stability so nothing decays instantly", () => {
    expect(decayOneDay(0.8, 0)).toBeGreaterThan(0.2);
  });
});

describe("scoreOf", () => {
  it("is a weighted average of mastery, in points", () => {
    expect(
      scoreOf([
        topic({ id: "a", mastery: 1, weight: 0.5 }),
        topic({ id: "b", mastery: 0, weight: 0.5 }),
      ]),
    ).toBe(50);
  });

  it("weights a bigger topic more", () => {
    expect(
      scoreOf([
        topic({ id: "a", mastery: 1, weight: 0.9 }),
        topic({ id: "b", mastery: 0, weight: 0.1 }),
      ]),
    ).toBe(90);
  });

  it("is zero for no topics", () => {
    expect(scoreOf([])).toBe(0);
  });
});

describe("bestTopicFor", () => {
  it("picks the weakest topic when weights are equal", () => {
    const topics = evenly([
      topic({ id: "strong", mastery: 0.9 }),
      topic({ id: "weak", mastery: 0.2 }),
    ]);
    expect(topics[bestTopicFor(topics, 45).index].id).toBe("weak");
  });

  it("prefers a heavier topic when mastery is close", () => {
    const topics = [
      topic({ id: "minor", mastery: 0.5, weight: 0.1 }),
      topic({ id: "major", mastery: 0.55, weight: 0.9 }),
    ];
    expect(topics[bestTopicFor(topics, 45).index].id).toBe("major");
  });

  it("reports no candidate when everything is mastered", () => {
    expect(bestTopicFor([topic({ id: "a", mastery: 1 })], 45).index).toBe(-1);
  });
});

describe("buildTopicStates", () => {
  it("returns nothing when there are no decks to project", () => {
    expect(buildTopicStates({ decks: [], cards: [], attempts: [] })).toEqual(
      [],
    );
  });

  it("scopes to the exam's folder when one is known", () => {
    const topics = buildTopicStates({
      decks: [
        deck({ id: "d1", folder_id: "chem" }),
        deck({ id: "d2", folder_id: "bio" }),
      ],
      cards: [],
      attempts: [],
      folderId: "chem",
    });
    expect(topics.map((t) => t.id)).toEqual(["d1"]);
  });

  it("treats a deck with no cards as unmeasured, not as zero", () => {
    /* Zero would make a student who has just uploaded their syllabus look
       doomed, which is both wrong and the opposite of motivating. */
    const [t] = buildTopicStates({
      decks: [deck({ id: "d1" })],
      cards: [],
      attempts: [],
    });
    expect(t.mastery).toBe(UNMEASURED_MASTERY);
    expect(t.evidence).toBe(0);
  });

  it("reads mastery out of real card memory state", () => {
    const now = new Date(`${TODAY}T12:00:00`);
    const [fresh] = buildTopicStates({
      decks: [deck({ id: "d1" })],
      cards: [
        card({ id: "c1", srs_interval: 30, next_review_date: "2026-09-20" }),
      ],
      attempts: [],
      now,
    });
    const [stale] = buildTopicStates({
      decks: [deck({ id: "d1" })],
      cards: [
        card({ id: "c1", srs_interval: 1, next_review_date: "2026-08-01" }),
      ],
      attempts: [],
      now,
    });
    expect(fresh.mastery).toBeGreaterThan(stale.mastery);
  });

  it("trusts a well-reviewed deck more than a brand-new one", () => {
    const many = buildTopicStates({
      decks: [deck({ id: "d1" })],
      cards: Array.from({ length: 25 }, (_, i) =>
        card({ id: `c${i}`, srs_interval: 30 }),
      ),
      attempts: [],
    })[0];
    const few = buildTopicStates({
      decks: [deck({ id: "d1" })],
      cards: [card({ id: "c1", srs_interval: 0 })],
      attempts: [],
    })[0];
    expect(many.evidence).toBeGreaterThan(few.evidence);
  });

  it("pulls mastery down where quizzes keep catching the topic", () => {
    const cards = [card({ id: "c1", srs_interval: 30 })];
    const clean = buildTopicStates({
      decks: [deck({ id: "d1", title: "Titration" })],
      cards,
      attempts: [],
    })[0];
    const flagged = buildTopicStates({
      decks: [deck({ id: "d1", title: "Titration" })],
      cards,
      attempts: [
        attempt({ id: "a1", weak_topics: ["titration"] }),
        attempt({ id: "a2", weak_topics: ["Titration"] }),
      ],
    })[0];
    expect(flagged.mastery).toBeLessThan(clean.mastery);
  });

  it("weights a bigger deck more, but sub-linearly", () => {
    const topics = buildTopicStates({
      decks: [deck({ id: "big" }), deck({ id: "small" })],
      cards: [
        ...Array.from({ length: 100 }, (_, i) =>
          card({ id: `b${i}`, deck_id: "big" }),
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          card({ id: `s${i}`, deck_id: "small" }),
        ),
      ],
      attempts: [],
    });
    const big = topics.find((t) => t.id === "big")!;
    const small = topics.find((t) => t.id === "small")!;
    expect(big.weight).toBeGreaterThan(small.weight);
    expect(big.weight).toBeLessThan(small.weight * 10);
  });

  it("normalises weights to one", () => {
    const topics = buildTopicStates({
      decks: [deck({ id: "a" }), deck({ id: "b" }), deck({ id: "c" })],
      cards: [card({ id: "c1", deck_id: "a" })],
      attempts: [],
    });
    const total = topics.reduce((s, t) => s + t.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

describe("forecast", () => {
  const topics = evenly([
    topic({ id: "weak", mastery: 0.3, stabilityDays: 8 }),
    topic({ id: "ok", mastery: 0.6, stabilityDays: 12 }),
    topic({ id: "strong", mastery: 0.85, stabilityDays: 25 }),
  ]);

  const base = {
    topics,
    examName: "Chemistry Paper 1",
    examDate: EXAM,
    today: TODAY,
    plannedMinutes: plan(90),
  };

  it("projects a better score than doing nothing", () => {
    const f = forecast(base);
    expect(f.projectedScore).toBeGreaterThan(f.driftScore);
    expect(f.planValue).toBe(f.projectedScore - f.driftScore);
  });

  it("shows drift falling below today's score", () => {
    /* The honest half of the feature, and the number that gets someone off
       the sofa: doing nothing is not standing still. */
    const f = forecast(base);
    expect(f.driftScore).toBeLessThan(f.todayScore);
  });

  it("returns one curve point per day, inclusive of both ends", () => {
    const f = forecast(base);
    expect(f.curve).toHaveLength(15);
    expect(f.curve[0].date).toBe(TODAY);
    expect(f.curve[f.curve.length - 1].date).toBe(EXAM);
    expect(f.curve[0].projected).toBe(f.todayScore);
    expect(f.curve[f.curve.length - 1].projected).toBe(f.projectedScore);
  });

  it("rewards more study with a higher projection", () => {
    const light = forecast({ ...base, plannedMinutes: plan(30) });
    const heavy = forecast({ ...base, plannedMinutes: plan(180) });
    expect(heavy.projectedScore).toBeGreaterThan(light.projectedScore);
    expect(heavy.availableMins).toBeGreaterThan(light.availableMins);
  });

  it("beats cramming with fewer hours, spread out", () => {
    /* Studying buys stability as well as mastery, and a day can only absorb
       so much — so spacing wins here without any rule that says "space your
       revision", which is the only way that advice has ever landed. */
    const spread = forecast({ ...base, plannedMinutes: plan(50) });
    const crammed = forecast({
      ...base,
      plannedMinutes: { "2026-09-13": 420, "2026-09-14": 420 },
    });
    expect(spread.availableMins).toBeLessThan(crammed.availableMins);
    expect(spread.projectedScore).toBeGreaterThan(crammed.projectedScore);
  });

  it("refuses to let one huge day stand in for a fortnight", () => {
    const oneDay = forecast({ ...base, plannedMinutes: { "2026-09-14": 600 } });
    const cappedDay = forecast({
      ...base,
      plannedMinutes: { "2026-09-14": 180 },
    });
    /* Tripling the hours in a single day buys almost nothing, because the day
       runs out of room to absorb them long before the hours run out. */
    expect(oneDay.projectedScore - cappedDay.projectedScore).toBeLessThan(3);
  });

  it("ignores planned time that falls after the exam", () => {
    const f = forecast({
      ...base,
      plannedMinutes: { ...plan(90), "2026-10-01": 600 },
    });
    expect(f.availableMins).toBe(forecast(base).availableMins);
  });

  it("ignores planned time before today", () => {
    const f = forecast({
      ...base,
      plannedMinutes: { ...plan(90), "2026-08-01": 600 },
    });
    expect(f.availableMins).toBe(forecast(base).availableMins);
  });

  it("ranks the next block by points gained, weakest-first", () => {
    const f = forecast(base);
    expect(f.interventions[0].topicId).toBe("weak");
    expect(f.interventions[0].points).toBeGreaterThan(
      f.interventions[f.interventions.length - 1].points,
    );
  });

  it("reports points per hour so topics are comparable", () => {
    const f = forecast(base);
    const top = f.interventions[0];
    expect(top.pointsPerHour).toBeCloseTo(
      top.points * (60 / INTERVENTION_BLOCK_MINS),
      6,
    );
  });

  it("marks a fading topic as at risk but not an unlearned one", () => {
    const f = forecast({
      ...base,
      topics: evenly([
        topic({ id: "fading", mastery: 0.4, evidence: 0.8 }),
        topic({ id: "never-seen", mastery: 0.25, evidence: 0 }),
      ]),
    });
    const byId = Object.fromEntries(f.interventions.map((i) => [i.topicId, i]));
    expect(byId.fading.atRisk).toBe(true);
    expect(byId["never-seen"].atRisk).toBe(false);
  });

  it("widens the confidence band when the evidence is thin", () => {
    const thin = forecast({
      ...base,
      topics: topics.map((t) => ({ ...t, evidence: 0 })),
    });
    const solid = forecast({
      ...base,
      topics: topics.map((t) => ({ ...t, evidence: 1 })),
    });
    expect(thin.confidence.upper - thin.confidence.lower).toBeGreaterThan(
      solid.confidence.upper - solid.confidence.lower,
    );
    expect(solid.confidence.upper - solid.confidence.lower).toBe(0);
  });

  it("opens the band to its full width when there is no evidence at all", () => {
    const f = forecast({
      ...base,
      /* Held mid-range on purpose: near either end the band is clipped by
         0 and 100, which is correct and would hide the width being tested. */
      topics: [
        topic({ id: "a", mastery: 0.5, evidence: 0, stabilityDays: 5000 }),
      ],
      plannedMinutes: {},
    });
    expect(f.confidence.upper - f.confidence.lower).toBe(
      MAX_CONFIDENCE_BAND * 2,
    );
  });

  it("keeps the confidence band inside 0-100", () => {
    const f = forecast({
      ...base,
      topics: [topic({ id: "a", mastery: 0.99, evidence: 0 })],
    });
    expect(f.confidence.lower).toBeGreaterThanOrEqual(0);
    expect(f.confidence.upper).toBeLessThanOrEqual(100);
  });

  it("calls it on track once the projection clears the target", () => {
    const f = forecast({
      ...base,
      topics: evenly([topic({ id: "a", mastery: 0.95, stabilityDays: 60 })]),
      targetScore: 70,
    });
    expect(f.verdict).toBe("on-track");
    expect(f.minsToTarget).toBeNull();
  });

  it("says how much more work would reach the target", () => {
    const f = forecast({
      ...base,
      plannedMinutes: plan(20),
      targetScore: 85,
    });
    expect(f.verdict).not.toBe("on-track");
    if (f.minsToTarget !== null) expect(f.minsToTarget).toBeGreaterThan(0);
  });

  it("admits when there is not enough time left rather than inventing a number", () => {
    const f = forecast({
      ...base,
      examDate: "2026-09-02",
      topics: evenly([topic({ id: "a", mastery: 0.05, evidence: 1 })]),
      plannedMinutes: { "2026-09-01": 30, "2026-09-02": 30 },
      targetScore: 95,
    });
    expect(f.verdict).toBe("not-enough-time");
    expect(f.minsToTarget).toBeNull();
  });

  it("defaults the target to a passing grade", () => {
    expect(forecast(base).targetScore).toBe(DEFAULT_TARGET_SCORE);
  });

  it("handles an exam today without dividing by a zero-length week", () => {
    const f = forecast({ ...base, examDate: TODAY, plannedMinutes: {} });
    expect(f.daysRemaining).toBe(0);
    expect(f.curve).toHaveLength(1);
    expect(f.projectedScore).toBe(f.todayScore);
    expect(f.driftScore).toBe(f.todayScore);
  });

  it("handles having no topics at all", () => {
    const f = forecast({ ...base, topics: [] });
    expect(f.todayScore).toBe(0);
    expect(f.interventions).toEqual([]);
  });

  it("gives the same forecast for the same inputs", () => {
    expect(forecast(base)).toEqual(forecast(base));
  });
});
