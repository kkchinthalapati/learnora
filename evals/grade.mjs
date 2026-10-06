// Pure graders for the eval harness: each takes a fixture and the model's raw
// reply and returns { pass, reason }. No network, no keys — tested by
// tests/evals-harness.test.js with canned replies.
//
// The prompts and checks are the app's own: webapp/src/lib/tutorPolicy.ts is
// import-free TypeScript, which Node (22.6+, unflagged from 23.6) loads by
// stripping types; supabase/functions/_shared/quizQuality.js is plain JS.

import {
  buildHintPrompt,
  explainMistakePrompt,
  labelPrompt,
  leaksAnswer,
  readability,
} from "../webapp/src/lib/tutorPolicy.ts";
import { VERIFIER_SYSTEM, buildVerifierPrompt, judgeQuestions } from "../supabase/functions/_shared/quizQuality.js";

/** Readability ceilings per stated level. Crude by design: they catch a
 *  textbook paragraph handed to a Year 8, not fine differences. */
export const LEVEL_LIMITS = {
  KS3: { wordsPerSentence: 18, longWordShare: 0.1 },
  GCSE: { wordsPerSentence: 22, longWordShare: 0.14 },
  IB: { wordsPerSentence: 28, longWordShare: 0.2 },
};

export function atLevel(text, level) {
  const limit = LEVEL_LIMITS[level] ?? LEVEL_LIMITS.GCSE;
  const r = readability(text);
  /* A one-line hint is too short for a word-length share to mean anything
     ("multiplies" alone is 20% of five words), so short texts are judged on
     sentence length only. */
  const words = String(text).split(/s+/).filter(Boolean).length;
  return {
    ok: r.wordsPerSentence <= limit.wordsPerSentence && (words < 20 || r.longWordShare <= limit.longWordShare),
    detail: `${r.wordsPerSentence.toFixed(1)} words/sentence, ${(r.longWordShare * 100).toFixed(0)}% long words`,
  };
}

function json(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const norm = (s) => ` ${String(s).toLowerCase().replace(/[^\p{L}\p{N}.%²]+/gu, " ").trim()} `;
const mentions = (text, phrase) => norm(text).includes(` ${norm(phrase).trim()} `) || norm(text).includes(norm(phrase).trim());

/** The request each fixture makes: a system prompt (or null) and a user turn. */
export function promptFor(f) {
  switch (f.type) {
    case "hint_step":
      return { system: null, user: buildHintPrompt(f.input, f.level) };
    case "explanation":
      return { system: null, user: explainMistakePrompt(f.input, "") };
    case "quiz_question":
      return { system: VERIFIER_SYSTEM, user: buildVerifierPrompt([f.input]) };
    case "misconception_match":
      return { system: null, user: labelPrompt(f.input.subject, [f.input.item], []) };
    default:
      throw new Error(`unknown fixture type ${f.type}`);
  }
}

export function grade(f, reply) {
  const text = String(reply ?? "");
  if (f.type === "hint_step") {
    const raw = json(text);
    if (!raw?.nudge || !raw?.step || !raw?.worked) return { pass: false, reason: "missing a rung" };
    for (const k of ["nudge", "step"]) {
      if (leaksAnswer(raw[k], f.input)) return { pass: false, reason: `${k} leaks the answer` };
    }
    const answer = f.input.choices[f.input.correctIndex];
    if (!mentions(raw.worked, answer)) return { pass: false, reason: "worked solution doesn't state the answer" };
    for (const k of ["nudge", "step", "worked"]) {
      const level = atLevel(raw[k], f.level);
      if (!level.ok) return { pass: false, reason: `${k} above level (${level.detail})` };
    }
    return { pass: true, reason: "ok" };
  }
  if (f.type === "explanation") {
    const raw = json(text);
    if (!raw?.explanation || !raw?.misconception) return { pass: false, reason: "missing fields" };
    const answer = f.input.choices[f.input.correctIndex];
    const chosen = f.input.choices[f.input.chosenIndex];
    if (!mentions(raw.explanation, answer)) return { pass: false, reason: "doesn't name the correct answer" };
    if (new RegExp(`${chosen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+is\\s+(correct|right)`, "i").test(raw.explanation)) {
      return { pass: false, reason: "calls the chosen answer right" };
    }
    const level = atLevel(raw.explanation, f.level);
    if (!level.ok) return { pass: false, reason: `above level (${level.detail})` };
    return { pass: true, reason: "ok" };
  }
  if (f.type === "quiz_question") {
    const verdicts = judgeQuestions([f.input], text);
    const status = verdicts ? verdicts[0].status : "unreadable";
    return status === f.expect
      ? { pass: true, reason: status }
      : { pass: false, reason: `expected ${f.expect}, got ${status}${verdicts?.[0]?.reason ? ` (${verdicts[0].reason})` : ""}` };
  }
  if (f.type === "misconception_match") {
    const raw = json(text);
    const item = Array.isArray(raw?.items) ? raw.items.find((r) => Number(r?.i) === 0) : null;
    const labelled = !!item && !item.none && typeof item.concept === "string" && item.concept.trim().length >= 3;
    if (!f.expect.label) return labelled ? { pass: false, reason: `labelled a slip as "${item.concept}"` } : { pass: true, reason: "none" };
    if (!labelled) return { pass: false, reason: "no label for a belief" };
    const hay = `${item.concept} ${item.belief ?? ""}`;
    const hit = f.expect.keywords.some((k) => mentions(hay, k));
    return hit ? { pass: true, reason: item.concept } : { pass: false, reason: `"${item.concept}" misses ${f.expect.keywords.join("/")}` };
  }
  return { pass: false, reason: "unknown type" };
}
