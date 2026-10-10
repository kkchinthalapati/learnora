import { AiError, callEdge } from "./ai";
import { materialsApi } from "./materials";
import { fenceUntrusted } from "../lib/actionTags";
import { extractJSON } from "../lib/aiJson";
import { explainMistakePrompt } from "../lib/tutorPolicy";
import { questionKey } from "../lib/questionKey";

/* "Why was I wrong?" — one quiz mistake, explained.
 *
 * Billed to the existing `debugger` tool rather than a new one: this is the
 * Cognitive Debugger's job (diagnose the belief behind a failed question) at
 * the size of a single answer, and billing it to `quiz` would let three
 * explanations spend a free student's whole day of quiz generation. It uses
 * the debugger's `solver` mode too, so the edge function's input and output
 * safety screens apply exactly as they do there.
 *
 * Only ever called from an explicit button — never on render — so it cannot
 * burn quota a student did not choose to spend.
 *
 * The answer is structured JSON and is validated before anything is shown: a
 * reply that does not parse, or parses without the two fields that carry the
 * explanation, degrades to a plain message rather than raw model text. */

export interface MistakeCheck {
  question: string;
  choices: string[];
  correctIndex: number;
}

export interface MistakeExplanation {
  /** The concept the error lives in — the ledger's fallback when the
   *  question carries no topic of its own. */
  concept: string;
  /** One sentence: the wrong belief most likely behind the pick. */
  misconception: string;
  /** A few sentences: why the right answer is right and the pick is not. */
  explanation: string;
  /** One new question on the same idea. Absent when the model's was
   *  unusable — the explanation still stands without it. */
  check?: MistakeCheck;
}

export interface ExplainMistakeInput {
  question: string;
  choices: string[];
  correctIndex: number;
  chosenIndex: number;
  topic?: string;
  subject?: string;
  /** The quiz's source material, when it has one. Read on demand. */
  materialId?: string | null;
  /** The student's stated level, so the explanation is pitched at it. */
  level?: string | null;
  /** False for a question the quiz checker couldn't verify: its
   *  explanation isn't cached, since the question may be replaced. */
  verified?: boolean;
  /** "bank:<uuid>" for a practice-bank question (shared server cache). */
  ref?: string | null;
}

export type ExplainMistakeResult =
  | { explanation: MistakeExplanation; degraded?: undefined }
  | {
      explanation?: undefined;
      degraded: {
        reason: "unavailable" | "unreadable" | "refused";
        /** A sentence for the student, never a stack trace. */
        message: string;
      };
    };

const MAX_EXCERPT_CHARS = 1500;
const MAX_MISCONCEPTION_CHARS = 400;
const MAX_EXPLANATION_CHARS = 1500;
const MAX_CONCEPT_CHARS = 80;

const STOPWORDS = new Set(
  "about above after again against because before being below between both could does doing during each from further have having here into itself just more most other over same should some such than that their them then there these they this those through under until very were what when where which while whom will with would your".split(
    " ",
  ),
);

/** Content words as crude stems: long enough to mean something (or a short
 *  acronym like ATP or DNA), stopwords dropped, cut to six letters so
 *  "ribosome"/"ribosomes" and "mitochondrion"/"mitochondria" meet. */
function keywords(text: string): Set<string> {
  return new Set(
    text
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4 || /^[A-Z0-9]{2,}$/.test(w))
      .map((w) => w.toLowerCase())
      .filter((w) => !STOPWORDS.has(w))
      .map((w) => w.slice(0, 6)),
  );
}

/**
 * The part of the source material that bears on this question.
 *
 * Deterministic and local: paragraphs are scored by how many of the
 * question's and answers' keywords they contain, and the best are kept in
 * their original order up to a budget. A material with nothing in common
 * with the question contributes nothing — unrelated notes in the prompt
 * are more likely to mislead the explanation than to ground it.
 */
export function pickSourceExcerpt(
  raw: string | null | undefined,
  about: string,
  maxChars = MAX_EXCERPT_CHARS,
): string {
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const terms = keywords(about);
  if (terms.size === 0) return "";

  const paragraphs = text
    .split(/\n\s*\n/)
    .flatMap((p) =>
      p.length <= 600 ? [p] : p.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [p],
    )
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const scored = paragraphs
    .map((p, index) => {
      const words = keywords(p);
      let score = 0;
      for (const term of terms) if (words.has(term)) score += 1;
      return { p, index, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const kept: typeof scored = [];
  let used = 0;
  for (const entry of scored) {
    const cost = entry.p.length + (kept.length ? 2 : 0);
    if (used + cost > maxChars) {
      if (kept.length === 0) {
        kept.push({ ...entry, p: `${entry.p.slice(0, maxChars - 1).trimEnd()}…` });
      }
      break;
    }
    kept.push(entry);
    used += cost;
  }
  return kept
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.p)
    .join("\n\n");
}

/** The prompt itself lives in lib/tutorPolicy.ts (import-free, so the eval
 *  runner tests the exact text); this binds the app's fencing. */
export function buildExplainMistakePrompt(input: ExplainMistakeInput, sourceExcerpt = ""): string {
  return explainMistakePrompt(input, sourceExcerpt, fenceUntrusted);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A trimmed string field, or "" when it is missing, empty, a placeholder
 *  the model copied from the schema, or not a string at all. */
function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/[ \t]+/g, " ").trim();
  if (!text || /^(n\/?a|none|null|undefined|string|\.\.\.|…)$/i.test(text)) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function parseCheck(value: unknown): MistakeCheck | undefined {
  if (!isRecord(value)) return undefined;
  const question = cleanText(value.question, 400);
  if (!question || !Array.isArray(value.choices)) return undefined;
  const choices = value.choices.map((c) => cleanText(c, 200));
  if (choices.length < 2 || choices.length > 5 || choices.some((c) => !c)) {
    return undefined;
  }
  if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) {
    return undefined;
  }
  const correctIndex = Number(value.correctIndex);
  if (
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= choices.length
  ) {
    return undefined;
  }
  return { question, choices, correctIndex };
}

/** Validate the model's reply. `null` when the parts that carry the
 *  explanation are missing — the caller shows a fallback, never raw text. */
export function parseMistakeExplanation(
  text: string | null | undefined,
): MistakeExplanation | null {
  const parsed = extractJSON<unknown>(text);
  if (!isRecord(parsed)) return null;
  const misconception = cleanText(parsed.misconception, MAX_MISCONCEPTION_CHARS);
  const explanation = cleanText(parsed.explanation, MAX_EXPLANATION_CHARS);
  if (!misconception || !explanation) return null;
  const check = parseCheck(parsed.check);
  return {
    concept: cleanText(parsed.concept, MAX_CONCEPT_CHARS),
    misconception,
    explanation,
    ...(check ? { check } : {}),
  };
}

/** The source material's relevant part, or "" — a missing or unreadable
 *  material only means the explanation is ungrounded, never that it fails. */
async function loadSourceExcerpt(input: ExplainMistakeInput): Promise<string> {
  if (!input.materialId) return "";
  try {
    const material = await materialsApi.fetchById(input.materialId);
    return pickSourceExcerpt(
      material?.raw_content,
      [
        input.question,
        input.choices[input.correctIndex] ?? "",
        input.choices[input.chosenIndex] ?? "",
        input.topic ?? "",
      ].join(" "),
    );
  } catch (err) {
    console.warn("[explainMistake] Source material unavailable:", err);
    return "";
  }
}

function studentFacingReason(err: unknown): string {
  if (err instanceof AiError && !err.retryable && err.message.trim()) {
    return err.message.trim();
  }
  return "We couldn't reach the tutor just now.";
}

const UNREADABLE_MESSAGE =
  "The tutor answered, but not in a form we could show. Try again, or read the explanation under the question.";

const CACHE_KEY = "learnora_mistake_explanations_v1";
const CACHE_MAX = 150;
const cacheId = (input: ExplainMistakeInput) =>
  [questionKey(input.question), input.chosenIndex, (input.level ?? "").toLowerCase()].join("|");

function readCache(): Record<string, { e: MistakeExplanation; at: number }> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/** A previous explanation of this exact mistake at this level, if any. */
export function cachedExplanation(input: ExplainMistakeInput): MistakeExplanation | null {
  return readCache()[cacheId(input)]?.e ?? null;
}

function storeExplanation(input: ExplainMistakeInput, e: MistakeExplanation): void {
  if (input.verified === false) return;
  const all = readCache();
  all[cacheId(input)] = { e, at: Date.now() };
  const entries = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, CACHE_MAX);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* A full or blocked store only means the next view asks again. */
  }
}

export async function explainMistake(
  input: ExplainMistakeInput,
): Promise<ExplainMistakeResult> {
  /* Explanations of verified questions are kept on the device, so asking
     again (or reopening the review) doesn't spend another call. */
  const cached = cachedExplanation(input);
  if (cached) return { explanation: cached };
  const excerpt = await loadSourceExcerpt(input);
  let text: string;
  try {
    const result = await callEdge({
      history: [
        { role: "user", content: buildExplainMistakePrompt(input, excerpt) },
      ],
      mode: "solver",
      tool: "debugger",
      ...(input.ref?.startsWith("bank:") ? { itemCache: { ref: input.ref } } : {}),
    });
    if (result.refused) {
      return { degraded: { reason: "refused", message: result.text } };
    }
    text = result.text;
  } catch (err) {
    if (err instanceof AiError && err.refused) {
      return { degraded: { reason: "refused", message: err.message } };
    }
    return {
      degraded: { reason: "unavailable", message: studentFacingReason(err) },
    };
  }

  const explanation = parseMistakeExplanation(text);
  if (!explanation) {
    return { degraded: { reason: "unreadable", message: UNREADABLE_MESSAGE } };
  }
  storeExplanation(input, explanation);
  return { explanation };
}
