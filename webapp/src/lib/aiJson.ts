/* Ports js/ai.js's three hardened JSON extractors (:257-414) — models don't
 * reliably return clean JSON even when asked for it, so each parser tries
 * several progressively looser strategies before giving up. Pure functions,
 * no network/DOM dependency. */

export interface FlashcardDraft {
  front: string;
  back: string;
}

export interface QuizQuestionDraft {
  question: string;
  choices: string[];
  correctIndex: number;
  feedback?: string;
  topic?: string;
}

/** Loosely typed on purpose — the weekly-plan view (ledger step 15) is what
 *  defines and consumes this shape; this layer only needs to know a valid
 *  plan is an object with a `days` array. */
export interface WeeklyPlanJSON {
  days: unknown[];
  [key: string]: unknown;
}

/** Strips trailing commas from arrays/objects — the single most common way
 *  a model's "valid JSON" isn't. */
function sanitizeJSON(str: string): string {
  return str.replace(/,(\s*[\]}])/g, "$1");
}

function stripCodeFences(text: string): string {
  return text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
}

function isFlashcardArray(arr: unknown): arr is FlashcardDraft[] {
  return (
    Array.isArray(arr) &&
    arr.length > 0 &&
    typeof (arr[0] as { front?: unknown })?.front === "string"
  );
}

/* mode:"flashcards" requests go out with response_format:json_object, which
 * only permits an object at the top level, so those providers return
 * {"cards":[...]}. Gemini isn't sent a response_format and still replies
 * with a bare array, so both shapes are unwrapped here — the same
 * arrangement extractQuizJSON uses for {"questions":[...]}. */
function unwrapCards(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["cards", "flashcards", "items", "data"]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return parsed;
}

export function extractFlashcardJSON(text: string | null | undefined): FlashcardDraft[] {
  if (!text) return [];

  // Strategy 1: direct JSON.parse of trimmed text.
  try {
    const parsed = unwrapCards(JSON.parse(sanitizeJSON(text.trim())));
    if (isFlashcardArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }

  // Strategy 2: strip markdown code fences.
  try {
    const parsed = unwrapCards(JSON.parse(sanitizeJSON(stripCodeFences(text))));
    if (isFlashcardArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }

  // Strategy 3: find the first { ... } block, for an object-wrapped reply
  // that arrived with prose around it.
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const parsed = unwrapCards(
        JSON.parse(sanitizeJSON(text.substring(start, end + 1))),
      );
      if (isFlashcardArray(parsed)) return parsed;
    }
  } catch {
    /* fall through */
  }

  // Strategy 4: find the first [ ... ] block via bracket matching.
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(sanitizeJSON(text.substring(start, end + 1)));
      if (isFlashcardArray(parsed)) return parsed;
    }
  } catch {
    /* fall through */
  }

  // Strategy 5: regex-extract individual card objects, last resort.
  const cards: FlashcardDraft[] = [];
  const regex = /\{\s*"front"\s*:\s*"([^"]+)"\s*,\s*"back"\s*:\s*"([^"]+)"\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    cards.push({ front: match[1], back: match[2] });
  }
  return cards;
}

export function extractPlanJSON(text: string | null | undefined): WeeklyPlanJSON | null {
  if (!text) return null;
  const isValid = (parsed: unknown): parsed is WeeklyPlanJSON =>
    !!parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as WeeklyPlanJSON).days);

  try {
    const parsed = JSON.parse(sanitizeJSON(text.trim()));
    if (isValid(parsed)) return parsed;
  } catch {
    /* fall through */
  }

  try {
    const parsed = JSON.parse(sanitizeJSON(stripCodeFences(text)));
    if (isValid(parsed)) return parsed;
  } catch {
    /* fall through */
  }

  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(sanitizeJSON(text.substring(start, end + 1)));
      if (isValid(parsed)) return parsed;
    }
  } catch {
    /* fall through */
  }

  return null;
}

/* JSON mode (response_format:json_object) only permits an object at the top
 * level, so providers that support it return {"questions":[...]}. Older
 * responses — and Gemini, which isn't sent a response_format — may still
 * send a bare array, so both shapes are unwrapped here. */
function unwrapQuestions(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["questions", "quiz", "items", "data"]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return parsed;
}

/* correctIndex must be validated here, not just question/choices: the quiz
 * view grades with `i === q.correctIndex`, so a model that emits `answer` or
 * `correct_index` instead produces a quiz where every answer — including the
 * right one — is marked wrong, with no error. */
function isQuizArray(arr: unknown): arr is QuizQuestionDraft[] {
  return (
    Array.isArray(arr) &&
    arr.length > 0 &&
    arr.every((q) => {
      const question = q as Partial<QuizQuestionDraft> | null;
      return (
        !!question &&
        typeof question.question === "string" &&
        Array.isArray(question.choices) &&
        question.choices.length > 1 &&
        Number.isInteger(question.correctIndex) &&
        (question.correctIndex as number) >= 0 &&
        (question.correctIndex as number) < question.choices.length
      );
    })
  );
}

export function extractQuizJSON(text: string | null | undefined): QuizQuestionDraft[] {
  if (!text) return [];

  try {
    const parsed = unwrapQuestions(JSON.parse(sanitizeJSON(text.trim())));
    if (isQuizArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }

  try {
    const parsed = unwrapQuestions(JSON.parse(sanitizeJSON(stripCodeFences(text))));
    if (isQuizArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }

  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(sanitizeJSON(text.substring(start, end + 1)));
      if (isQuizArray(parsed)) return parsed;
    }
  } catch {
    /* fall through */
  }

  return [];
}
