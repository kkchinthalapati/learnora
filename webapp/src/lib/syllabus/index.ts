/* Reading the exam-board ledger: look a spec up, weight its topics for a
 * tier, and work out which spec topic a free-text label is about.
 *
 * Every other module talks about topics as free text — a quiz's "topic"
 * field, a deck title, a session objective — and that is not going to change.
 * `matchSpecTopic` is the bridge: it maps those labels onto the spec so a
 * weak quiz topic can be priced in exam marks. */

import { normaliseTopicKey } from "../topicKey";
import { SYLLABUS_SPECS } from "./catalogue";
import type {
  Qualification,
  SyllabusSpec,
  SyllabusTier,
  SyllabusTopic,
  WeightedTopic,
} from "./types";

export type * from "./types";
export { SYLLABUS_SPECS };

const BY_ID = new Map(SYLLABUS_SPECS.map((s) => [s.id, s]));

export function getSpec(id: string | null | undefined): SyllabusSpec | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** The key a spec's practice questions are stored under in question_bank. */
export function bankKey(spec: SyllabusSpec): string {
  return spec.questionBankKey ?? spec.id;
}

/** "AQA GCSE Biology (8461)", "IB Chemistry". */
export function specLabel(spec: SyllabusSpec): string {
  const qual = spec.board === spec.qualification ? spec.qualification : `${spec.board} ${spec.qualification}`;
  return `${qual} ${spec.level ? `${spec.level} ` : ""}${spec.subject}${spec.code ? ` (${spec.code})` : ""}`;
}

/** "AQA GCSE Biology (8461), Higher tier" / "IB Chemistry HL". */
export function specWithTierLabel(spec: SyllabusSpec, tier: SyllabusTier | null): string {
  /* One tier for everyone (CBSE Science): naming it would only confuse. */
  if (!tier || spec.tiers.length <= 1) return specLabel(spec);
  return spec.qualification === "IB" || spec.qualification === "CBSE"
    ? `${specLabel(spec)} ${tier}`
    : `${specLabel(spec)}, ${tier} tier`;
}

/** The tier to assume when none was chosen: Higher for GCSE, HL for IB —
 *  the superset, so nothing the student might be examined on is left out. */
export function defaultTier(spec: SyllabusSpec): SyllabusTier {
  return spec.tiers.includes("Higher") ? "Higher" : spec.tiers.includes("HL") ? "HL" : spec.tiers[0];
}

export function isTier(spec: SyllabusSpec, tier: unknown): tier is SyllabusTier {
  return typeof tier === "string" && (spec.tiers as string[]).includes(tier);
}

/** Whether a topic is examined at this tier. Higher-only / HL-only topics
 *  are out at Foundation / SL; everything else is in at every tier. */
export function topicInTier(topic: SyllabusTopic, tier: SyllabusTier): boolean {
  if (!topic.tierOnly) return true;
  return topic.tierOnly === tier;
}

/**
 * The spec's topics at one tier, each with its share of the written-paper
 * marks (summing to 100).
 *
 * With a published unit weighting (GCSE Maths) the unit's share is split
 * evenly over its topics. Otherwise each paper's share is split evenly over
 * the topics that paper examines. Internal assessment is excluded: it is not
 * a topic a student can revise for an exam.
 */
export function weightedTopics(spec: SyllabusSpec, tier: SyllabusTier): WeightedTopic[] {
  const topics = spec.topics.filter((t) => topicInTier(t, tier));
  const weights = new Map<string, number>();

  const unitWeights = spec.units.every((u) => u.weightByTier?.[tier] !== undefined);
  if (unitWeights) {
    for (const unit of spec.units) {
      const inUnit = topics.filter((t) => t.unit === unit.code);
      for (const topic of inUnit) {
        weights.set(topic.ref, (unit.weightByTier![tier] ?? 0) / inUnit.length);
      }
    }
  } else {
    const papers = spec.papers.filter((p) => !p.tier || p.tier === tier);
    const total = papers.reduce((sum, p) => sum + p.weightPercent, 0) || 1;
    for (const paper of papers) {
      const covered = topics.filter((t) => paper.units.length === 0 || paper.units.includes(t.unit));
      for (const topic of covered) {
        const share = (paper.weightPercent / total) * 100 / covered.length;
        weights.set(topic.ref, (weights.get(topic.ref) ?? 0) + share);
      }
    }
  }

  return topics.map((t) => ({ ...t, weightPercent: weights.get(t.ref) ?? 0 }));
}

/* Singular forms, so "enzymes" in a label meets "enzyme" in the keywords. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) {
    return word.slice(0, -1);
  }
  return word;
}

function tokens(text: string): string[] {
  return normaliseTopicKey(text).split(" ").filter(Boolean).map(stem);
}

/** True when `phrase` occurs as a run of whole words inside `haystack`. */
function containsPhrase(haystack: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - phrase.length; i++) {
    for (let j = 0; j < phrase.length; j++) {
      if (haystack[i + j] !== phrase[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** How strongly a label points at a topic. A multi-word keyword is stronger
 *  evidence than a single word ("limiting factor" vs "light"), and the
 *  topic's own title counts most. 0 means no match. */
export function topicMatchScore(label: string, topic: SyllabusTopic): number {
  const words = tokens(label);
  if (words.length === 0) return 0;
  let score = 0;
  const title = tokens(topic.title);
  if (containsPhrase(words, title)) score += 3 + title.length;
  for (const kw of topic.keywords) {
    const phrase = tokens(kw);
    if (containsPhrase(words, phrase)) score += phrase.length;
  }
  return score;
}

/** The spec topic a free-text label is about, or null when nothing in it
 *  matches. Ties go to the earlier topic in the spec. */
export function matchSpecTopic(
  spec: SyllabusSpec,
  label: string,
  tier?: SyllabusTier | null,
): SyllabusTopic | null {
  let best: SyllabusTopic | null = null;
  let bestScore = 0;
  for (const topic of spec.topics) {
    if (tier && !topicInTier(topic, tier)) continue;
    const score = topicMatchScore(label, topic);
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  return best;
}

/** Specs a free-text subject name could be ("Biology", "GCSE Maths"), best
 *  first. Used to suggest a spec from an exam's name. */
export function suggestSpecs(name: string, qualification?: Qualification | null): SyllabusSpec[] {
  const words = new Set(tokens(name));
  const subjectWords = (s: SyllabusSpec) =>
    s.subject === "Mathematics" ? ["mathematic", "math", "maths"] : [stem(s.subject.toLowerCase())];
  return SYLLABUS_SPECS.filter((s) => subjectWords(s).some((w) => words.has(w)))
    .filter((s) => !qualification || s.qualification === qualification)
    .sort((a, b) => {
      const score = (s: SyllabusSpec) =>
        (words.has(s.qualification.toLowerCase()) ? 2 : 0) + (words.has(s.board.toLowerCase().split(" ").pop()!) ? 1 : 0);
      return score(b) - score(a);
    });
}

/** One line for an AI prompt: which exam the student is sitting, and — when
 *  a topic is known — where it sits in that spec. Kept to the spec's own
 *  words, so a model can use it to pitch depth without inventing content. */
export function syllabusPromptLine(
  spec: SyllabusSpec,
  tier: SyllabusTier | null,
  topic?: SyllabusTopic | null,
): string {
  const base = `EXAM SPECIFICATION: ${specWithTierLabel(spec, tier)}.`;
  if (!topic) return base;
  const unit = spec.units.find((u) => u.code === topic.unit);
  return `${base} This topic is spec section ${topic.ref} "${topic.title}"${unit ? ` in "${unit.title}"` : ""}${topic.tierOnly ? ` (${topic.tierOnly} only)` : ""}. Keep to what that section examines.`;
}
