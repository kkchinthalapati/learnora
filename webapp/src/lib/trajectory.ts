/* Trajectory — what your studying is actually worth.
 *
 * Every other tool in this category is an artifact factory. NotebookLM answers
 * questions from your sources. Notion gives you a database and asks you to
 * build the system yourself — which is the exact skill our users don't have.
 * Turbo AI and its cousins turn a PDF into flashcards. All three optimise the
 * *material*. None of them own the *outcome*, and none of them can, because
 * none of them holds the two models you need to:
 *
 *   1. what this person currently knows, per topic, and how fast it is fading
 *      (the SRS memory state and quiz evidence Learnora already accumulates)
 *   2. when this person is actually free between now and the exam
 *      (Life Sync — `availability.ts`)
 *
 * With both, a question opens up that no amount of content generation can
 * answer: *what is the next hour of your life worth, and where should it go?*
 *
 * That is what this module computes. It projects each topic forward to exam
 * day under memory decay, adds the effect of the hours the student genuinely
 * has, and reports three numbers that matter:
 *
 *   - where they land if they follow the plan
 *   - where they land if they do nothing (the cost of drift, which is the
 *     number that gets someone off the sofa)
 *   - which topic the next block should go to, in points per hour
 *
 * It is a model, not an oracle, and it is built to say so: every forecast
 * carries a confidence band that is wide when the evidence is thin and narrows
 * as the student does more work. A forecast presented without one would be a
 * lie told with a decimal point.
 *
 * Deterministic and pure — same inputs, same forecast. See `autoSchedule.ts`
 * for why that property is load-bearing rather than nice to have. */

import type { Flashcard, FlashcardDeck, QuizAttempt } from "../api/types";
import { computeRetentionProbability } from "./adaptiveLearning";
import { dateInDays, localDateStr, parseLocalDate } from "./date";

/* --- Model constants ---------------------------------------------------
 *
 * Chosen to be defensible rather than precise. The decisions this engine
 * informs — "put the next hour into Titration, not Bonding" — are robust to
 * these being somewhat off; what would not be robust is pretending to a
 * precision we cannot support, which is what the confidence band exists to
 * prevent. Every one is exported so a test can state the behaviour it wants
 * rather than hard-coding a number that drifts. */

/** Minutes of focused study that close ~63% of the gap to mastery on a topic.
 *  Diminishing returns: the first hour on something you barely know is worth
 *  far more than the fifth hour on something you nearly have. */
export const LEARNING_CONSTANT_MINS = 90;

/** Days of extra memory stability bought per hour of study. Studying does not
 *  only raise what you know, it slows how fast you lose it — which is why
 *  spreading work beats cramming it, and why this model rewards that without
 *  anyone having to lecture the student about spacing. */
export const STABILITY_DAYS_PER_HOUR = 2.5;

/** Floor on stability, so a brand-new topic still decays at a finite rate
 *  rather than collapsing to zero the day after it is learned. */
export const MIN_STABILITY_DAYS = 1.5;

/** Half of the widest confidence band, in points, at zero evidence. */
export const MAX_CONFIDENCE_BAND = 22;

/** A topic with no cards and no quiz history is not "0% mastered", it is
 *  unmeasured — and treating unmeasured as zero would make a student who has
 *  just uploaded their syllabus look doomed. This is the mastery assumed for
 *  a topic we have no evidence about at all. */
export const UNMEASURED_MASTERY = 0.25;

/** The block size used when ranking interventions. Points-per-hour is the
 *  headline, but the model is non-linear, so the ranking is computed against a
 *  realistic single sitting rather than an infinitesimal one. */
export const INTERVENTION_BLOCK_MINS = 45;

/** The most of a topic's remaining gap that one day can close, however many
 *  hours go into it.
 *
 * Without this the model will happily tell a student that sixty hours over the
 * next two days gets them to 95%, which is arithmetic rather than advice.
 * Consolidation is the real constraint — you cannot learn a term's material in
 * a night, and a forecast that implies otherwise would be actively harmful to
 * exactly the student most likely to try.
 *
 * It is also what makes "spread beats crammed" fall out of the model instead of
 * being asserted at the student as a study tip nobody has ever acted on. */
export const MAX_DAILY_GAP_CLOSURE = 0.4;

/** The most study we will assume a student could add to any one day when
 *  answering "how much more work would reach my target". */
export const MAX_REALISTIC_DAY_MINS = 480;

export interface TopicState {
  id: string;
  label: string;
  /** 0-1. What we believe they know now. */
  mastery: number;
  /** 0-1. How much we trust that number — evidence volume, not performance. */
  evidence: number;
  /** Memory stability in days: the `S` in `exp(-t/S)`. */
  stabilityDays: number;
  /** Share of the exam this topic carries. Normalised across the set. */
  weight: number;
  /** How many cards back this topic, for the UI's "based on…" line. */
  cardCount: number;
}

export interface TrajectoryPoint {
  date: string;
  /** 0-100 projected score if the student follows the plan from here. */
  projected: number;
  /** 0-100 projected score if they do nothing from here. */
  drift: number;
}

export interface Intervention {
  topicId: string;
  label: string;
  /** Points on the final score gained by one block on this topic. */
  points: number;
  /** The same, per hour — the number that makes topics comparable. */
  pointsPerHour: number;
  mastery: number;
  /** True when the topic is fading rather than simply unlearned; the advice
   *  differs (revisit versus learn) and so should the words around it. */
  atRisk: boolean;
}

export type Verdict = "on-track" | "close" | "at-risk" | "not-enough-time";

export interface TrajectoryForecast {
  examDate: string;
  examName: string;
  daysRemaining: number;
  /** What they would score if the exam were today. */
  todayScore: number;
  /** Where they land on exam day if they use the hours they have. */
  projectedScore: number;
  /** Where they land if they do nothing more. */
  driftScore: number;
  /** Points the remaining plan is worth: projected − drift. */
  planValue: number;
  confidence: { lower: number; upper: number; evidence: number };
  curve: TrajectoryPoint[];
  interventions: Intervention[];
  /** Total study minutes the student actually has before the exam. */
  availableMins: number;
  /** Minutes that would be needed to reach the target, or null if the target
   *  is already met by the projection. */
  minsToTarget: number | null;
  targetScore: number;
  verdict: Verdict;
  topics: TopicState[];
}

/* --- Building topic state from what the app already knows --------------- */

/** How much a card's memory state tells us. A card reviewed ten times is
 *  stronger evidence than one created this morning and never seen. */
function cardEvidence(card: Flashcard): number {
  const interval = Math.max(0, card.srs_interval ?? 0);
  return Math.min(1, interval / 21);
}

/** Memory stability for a card, in days — the same `S` the retention model in
 *  `adaptiveLearning.ts` uses, kept in one shape so the two never disagree
 *  about how fast this student forgets. */
function cardStability(card: Flashcard): number {
  const interval = Math.max(0, card.srs_interval ?? 0);
  const ease =
    card.ease_factor && card.ease_factor > 0 ? card.ease_factor : 2.5;
  return Math.max(MIN_STABILITY_DAYS, interval * (ease / 2.5));
}

export interface TopicSources {
  decks: FlashcardDeck[];
  cards: Flashcard[];
  attempts: QuizAttempt[];
  /** Only decks under this folder count toward the exam, when known. An exam
   *  with no folder falls back to everything, which is wrong-ish but far less
   *  wrong than forecasting a Chemistry exam off an empty topic list. */
  folderId?: string | null;
  now?: Date;
}

/** Turn decks, cards and quiz history into the topic set a forecast runs on.
 *
 * A deck is the unit of a topic because a deck is the unit that carries memory
 * state: cards have intervals and ease factors, and those are the only honest
 * measurement of knowing something this app collects. Quiz weak-topics adjust
 * the picture downward but cannot create a topic on their own — a topic with
 * no cards has nothing to project. */
export function buildTopicStates(src: TopicSources): TopicState[] {
  const now = src.now ?? new Date();
  const decks = src.folderId
    ? src.decks.filter((d) => d.folder_id === src.folderId)
    : src.decks;
  if (decks.length === 0) return [];

  /* How often each topic name has come back wrong recently. Matched against
     deck titles loosely, because a quiz's weak topic is free text written by
     the model and a deck title is free text written by the student — they
     agree often enough to be worth using and never reliably enough to trust. */
  const weakCounts = new Map<string, number>();
  for (const attempt of src.attempts) {
    for (const topic of attempt.weak_topics ?? []) {
      const key = topic.trim().toLowerCase();
      if (key) weakCounts.set(key, (weakCounts.get(key) ?? 0) + 1);
    }
  }
  const weaknessFor = (title: string): number => {
    const key = title.trim().toLowerCase();
    let hits = 0;
    for (const [topic, count] of weakCounts) {
      if (key.includes(topic) || topic.includes(key)) hits += count;
    }
    return hits;
  };

  const raw = decks.map((deck) => {
    const cards = src.cards.filter((c) => c.deck_id === deck.id);
    const cardCount = cards.length;

    if (cardCount === 0) {
      return {
        id: deck.id,
        label: deck.title,
        mastery: UNMEASURED_MASTERY,
        evidence: 0,
        stabilityDays: MIN_STABILITY_DAYS,
        weight: 1,
        cardCount: 0,
      };
    }

    const retention =
      cards.reduce((sum, c) => sum + computeRetentionProbability(c, now), 0) /
      cardCount;
    const evidence =
      cards.reduce((sum, c) => sum + cardEvidence(c), 0) / cardCount;
    const stabilityDays =
      cards.reduce((sum, c) => sum + cardStability(c), 0) / cardCount;

    /* Quiz misses pull mastery down, capped: three bad answers on a topic is
       a signal, thirty is the same signal with more noise attached. */
    const penalty = Math.min(0.3, weaknessFor(deck.title) * 0.06);

    return {
      id: deck.id,
      label: deck.title,
      mastery: Math.max(0, Math.min(1, retention - penalty)),
      evidence: Math.min(1, evidence * 0.7 + Math.min(1, cardCount / 20) * 0.3),
      stabilityDays: Math.max(MIN_STABILITY_DAYS, stabilityDays),
      /* Bigger decks weigh more, but sub-linearly — a hundred-card deck is a
         bigger part of the exam than a ten-card deck, not ten times bigger. */
      weight: Math.sqrt(cardCount) || 1,
      cardCount,
    };
  });

  const total = raw.reduce((sum, t) => sum + t.weight, 0) || 1;
  return raw.map((t) => ({ ...t, weight: t.weight / total }));
}

/* --- The model ---------------------------------------------------------- */

/** One day of forgetting. */
export function decayOneDay(mastery: number, stabilityDays: number): number {
  return mastery * Math.exp(-1 / Math.max(MIN_STABILITY_DAYS, stabilityDays));
}

/** What `minutes` of study on a topic at `mastery` buys.
 *
 * Diminishing returns against the gap that is left, which is the single most
 * useful thing this model says out loud: an hour on a topic you are at 20% on
 * is worth roughly eight times an hour on a topic you are at 90% on, and
 * students reliably spend the hour on the 90% topic because it feels better. */
export function learningGain(mastery: number, minutes: number): number {
  if (minutes <= 0) return 0;
  const gap = Math.max(0, 1 - mastery);
  return gap * (1 - Math.exp(-minutes / LEARNING_CONSTANT_MINS));
}

/** Score, 0-100, of a set of topic states. */
export function scoreOf(topics: TopicState[]): number {
  if (topics.length === 0) return 0;
  const total = topics.reduce((sum, t) => sum + t.weight, 0) || 1;
  const score =
    topics.reduce((sum, t) => sum + t.weight * t.mastery, 0) / total;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

/** Apply `minutes` of study to one topic: it raises mastery and, separately,
 *  slows the decay — the mechanism that makes spread-out work beat cramming
 *  in this model without any rule saying so. */
function study(topic: TopicState, minutes: number): TopicState {
  if (minutes <= 0) return topic;
  return {
    ...topic,
    mastery: Math.min(1, topic.mastery + learningGain(topic.mastery, minutes)),
    stabilityDays:
      topic.stabilityDays + (minutes / 60) * STABILITY_DAYS_PER_HOUR,
  };
}

/** The topic a marginal block is worth most on, by weighted points gained.
 *  Exported because the ranking is the product, not an implementation detail —
 *  `TrajectoryView` and the scheduler both want it. */
export function bestTopicFor(
  topics: TopicState[],
  minutes: number,
  /** Indices that have had all the study they can absorb today. */
  skip: ReadonlySet<number> = new Set(),
): { index: number; gain: number } {
  let index = -1;
  let best = 0;
  topics.forEach((t, i) => {
    if (skip.has(i)) return;
    const gain = t.weight * learningGain(t.mastery, minutes);
    if (gain > best) {
      best = gain;
      index = i;
    }
  });
  return { index, gain: best };
}

export interface SimulationOptions {
  /** Study minutes available on each date, from Life Sync. */
  plannedMinutes: Record<string, number>;
  /** Largest single sitting, so a long day is spent across topics rather than
   *  pouring six hours into one. Mirrors `LifeContext.maxBlockMins`. */
  blockMins: number;
}

/** Roll the topic set forward one day at a time to `examDate`.
 *
 * Decay is applied before study each day: a day you don't study is a day you
 * lose ground, and a day you do study has to pay that back before it gains.
 * That ordering is what makes the drift line fall rather than sit flat, and
 * the drift line is the honest part of this whole feature. */
function simulate(
  topics: TopicState[],
  today: string,
  examDate: string,
  options: SimulationOptions | null,
): { states: TopicState[]; curve: { date: string; score: number }[] } {
  const days = Math.max(
    0,
    Math.round(
      (parseLocalDate(examDate).getTime() - parseLocalDate(today).getTime()) /
        86400000,
    ),
  );
  let states = topics.map((t) => ({ ...t }));
  const curve = [{ date: today, score: scoreOf(states) }];

  for (let i = 1; i <= days; i += 1) {
    const date = dateInDays(i, today);
    states = states.map((t) => ({
      ...t,
      mastery: decayOneDay(t.mastery, t.stabilityDays),
    }));

    let budget = options ? (options.plannedMinutes[date] ?? 0) : 0;
    /* The ceiling each topic can reach today, fixed before any studying so a
       long day cannot walk it upward one block at a time. */
    const ceiling = states.map(
      (t) => t.mastery + (1 - t.mastery) * MAX_DAILY_GAP_CLOSURE,
    );
    const exhausted = new Set<number>();

    /* Greedy, block by block. Greedy is optimal enough here and has a property
       a cleverer optimiser would lose: it produces the same ordering the
       intervention list shows the student, so the plan and the advice can
       never contradict each other. */
    while (budget > 0) {
      const take = Math.min(budget, options?.blockMins ?? 45);
      const { index, gain } = bestTopicFor(states, take, exhausted);
      if (index === -1 || gain <= 0) break;

      const studied = study(states[index], take);
      states[index] = {
        ...studied,
        mastery: Math.min(studied.mastery, ceiling[index]),
      };
      /* Hitting the ceiling retires the topic for the day; the remaining
         budget flows to the next-best one, and once every topic is retired the
         rest of the day is genuinely wasted. That is the model refusing to
         pretend an all-nighter works. */
      if (states[index].mastery >= ceiling[index] - 1e-9) exhausted.add(index);
      budget -= take;
    }

    curve.push({ date, score: scoreOf(states) });
  }

  return { states, curve };
}

export interface TrajectoryInput {
  topics: TopicState[];
  examName: string;
  examDate: string;
  today?: string;
  plannedMinutes: Record<string, number>;
  blockMins?: number;
  /** The score the student is aiming at. */
  targetScore?: number;
}

export const DEFAULT_TARGET_SCORE = 70;

/** How many more minutes, spent as well as possible, would reach the target.
 *
 * Answered by simulation rather than algebra: the model is non-linear and
 * time-dependent, so "how much more work" genuinely depends on when it
 * happens. Capped, because past a point the honest answer is not a number of
 * hours, it is "not with the time you have left". */
function minutesToTarget(
  topics: TopicState[],
  today: string,
  examDate: string,
  blockMins: number,
  target: number,
  plannedMinutes: Record<string, number>,
): number | null {
  const MAX_EXTRA_MINS = 60 * 60; // sixty hours; past this the answer is "no"
  let extra = 0;
  const days = Object.keys(plannedMinutes);

  while (extra <= MAX_EXTRA_MINS) {
    const boosted: Record<string, number> = { ...plannedMinutes };
    /* The extra minutes are spread evenly across the days that already have
       time on them, which is the only realistic place to put them — inventing
       hours on a day the student told us they are busy would make the number
       meaningless. */
    const perDay = days.length ? extra / days.length : extra;
    for (const d of days) {
      boosted[d] = Math.min(
        MAX_REALISTIC_DAY_MINS,
        (plannedMinutes[d] ?? 0) + perDay,
      );
    }

    const { states } = simulate(topics, today, examDate, {
      plannedMinutes: boosted,
      blockMins,
    });
    if (scoreOf(states) >= target) return Math.round(extra);
    extra += 60;
  }
  return null;
}

export function forecast(input: TrajectoryInput): TrajectoryForecast {
  const today = input.today ?? localDateStr();
  const blockMins = input.blockMins ?? 45;
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const topics = input.topics;

  const daysRemaining = Math.max(
    0,
    Math.round(
      (parseLocalDate(input.examDate).getTime() -
        parseLocalDate(today).getTime()) /
        86400000,
    ),
  );

  /* Only the minutes between today and the exam count. A student with a plan
     running past the exam should not see those hours inflate a forecast for
     something that has already happened. */
  const plannedMinutes: Record<string, number> = {};
  let availableMins = 0;
  for (const [date, mins] of Object.entries(input.plannedMinutes)) {
    if (date >= today && date <= input.examDate && mins > 0) {
      plannedMinutes[date] = mins;
      availableMins += mins;
    }
  }

  const planned = simulate(topics, today, input.examDate, {
    plannedMinutes,
    blockMins,
  });
  const drifted = simulate(topics, today, input.examDate, null);

  const todayScore = scoreOf(topics);
  const projectedScore = scoreOf(planned.states);
  const driftScore = scoreOf(drifted.states);

  const curve: TrajectoryPoint[] = planned.curve.map((point, i) => ({
    date: point.date,
    projected: point.score,
    drift: drifted.curve[i]?.score ?? point.score,
  }));

  /* Interventions are ranked against *today's* state, not the projected one:
     the student is deciding what to do this afternoon, and the answer to that
     depends on what they know now. */
  const interventions: Intervention[] = topics
    .map((topic) => {
      const before = scoreOf(topics);
      const after = scoreOf(
        topics.map((t) =>
          t.id === topic.id ? study(t, INTERVENTION_BLOCK_MINS) : t,
        ),
      );
      const points = after - before;
      return {
        topicId: topic.id,
        label: topic.label,
        points,
        pointsPerHour: points * (60 / INTERVENTION_BLOCK_MINS),
        mastery: topic.mastery,
        /* Fading rather than unlearned: there is real memory here and it is
           slipping, which is a different sentence to say to a student than
           "you have never learned this". */
        atRisk: topic.evidence > 0.2 && topic.mastery < 0.7,
      };
    })
    .filter((i) => i.points > 0)
    .sort((a, b) => b.points - a.points);

  const evidence = topics.length
    ? topics.reduce((sum, t) => sum + t.weight * t.evidence, 0) /
      (topics.reduce((sum, t) => sum + t.weight, 0) || 1)
    : 0;
  const band = Math.round((1 - evidence) * MAX_CONFIDENCE_BAND);

  const needed = minutesToTarget(
    topics,
    today,
    input.examDate,
    blockMins,
    targetScore,
    plannedMinutes,
  );

  let verdict: Verdict;
  if (projectedScore >= targetScore) verdict = "on-track";
  else if (needed === null) verdict = "not-enough-time";
  else if (projectedScore >= targetScore - band) verdict = "close";
  else verdict = "at-risk";

  return {
    examDate: input.examDate,
    examName: input.examName,
    daysRemaining,
    todayScore,
    projectedScore,
    driftScore,
    planValue: projectedScore - driftScore,
    confidence: {
      lower: Math.max(0, projectedScore - band),
      upper: Math.min(100, projectedScore + band),
      evidence,
    },
    curve,
    interventions,
    availableMins,
    minsToTarget: projectedScore >= targetScore ? null : needed,
    targetScore,
    verdict,
    topics,
  };
}
