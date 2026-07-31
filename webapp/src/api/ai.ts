import { supabase, SUPABASE_URL } from "../lib/supabase";
import { loadSettings } from "../lib/settings";
import { localDateStr, mondayOfWeek } from "../lib/date";
import { decodeBase64UTF8, fenceUntrusted } from "../lib/aiActionTags";
import {
  extractFlashcardJSON,
  extractPlanJSON,
  extractQuizJSON,
} from "../lib/aiJson";
import { materialsApi } from "./materials";
import { notesApi } from "./notes";
import { decksApi } from "./decks";
import { flashcardsApi } from "./flashcards";
import { quizzesApi } from "./quizzes";
import { tasksApi } from "./tasks";
import { examsApi } from "./exams";
import { plansApi } from "./plans";
import type {
  Exam,
  FlashcardDeck,
  Material,
  MaterialType,
  Quiz,
  Task,
  WeeklyPlan,
} from "./types";

/* Direct port of js/ai.js's edge-function client and unified generation
 * pipeline (createStudyPackage, generateWeeklyPlan) — the pieces of the AI
 * layer that are pure service logic, not tied to any one view. The chat
 * widget (`AI.send`/`sendNotesChat`), drag-and-drop, voice input and bubble
 * rendering are NOT ported here: they're the "Turbo chat" surface itself
 * (ledger step 17), which this step's own dependency table lists as
 * depending on 13, not the reverse. See REACT_MIGRATION.md's step 14 entry
 * for the full scoping rationale.
 *
 * Unlike js/ai.js's `AI` object, none of this calls a UI layer on failure —
 * it throws, matching Decision #6 ("API layer throws on error") that every
 * other module in `api/` already follows. `generateWeeklyPlan()`'s vanilla
 * counterpart swallows its own errors and calls `UI.showPopup`; here that
 * responsibility moves to the caller (a `useMutation`'s `onError`), the same
 * as every other mutation in this app already works. */

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;

/* One retry, not two — the edge function walks its own chain of providers
 * before giving up, so a second client-side replay mostly just adds another
 * round trip. Exported so tests can assert on the real retry delay instead
 * of guessing it. */
export const MAX_RETRIES = 1;
export const RETRY_DELAY_MS = 2000;
/* Slightly above the edge function's own ~55s provider-chain budget, so the
 * server gets to return a real error message rather than the client giving
 * up on it first. */
export const REQUEST_TIMEOUT_MS = 60000;

export type AIMode = "notes" | "flashcards" | "quiz" | "plan";

export interface AIHistoryEntry {
  role: "user" | "model";
  content: string;
}

export interface AIFilePayload {
  name: string;
  mimeType: string;
  /** Base64-encoded, no `data:...;base64,` prefix. */
  data: string;
}

export interface AIError extends Error {
  /** Set on responses the edge function's own provider chain refused for
   *  content-safety reasons — carries its own explanation and must be shown
   *  verbatim rather than flattened into a generic failure message. */
  refused?: boolean;
}

function edgeError(message: string, refused = false): AIError {
  const err = new Error(message) as AIError;
  err.refused = refused;
  return err;
}

interface CallAIPayload {
  history: AIHistoryEntry[];
  mode?: AIMode;
  file?: AIFilePayload | null;
}

/** Calls the edge function once, retrying up to `MAX_RETRIES` times on a
 *  5xx/429 response with a growing delay. `timeoutMs` is a parameter (not
 *  just the `REQUEST_TIMEOUT_MS` default) purely so tests can exercise the
 *  timeout path without a real 60-second wait.
 *
 *  Despite reading `response.body` this ports the vanilla's `reader.read()`
 *  loop faithfully — the edge function has never actually streamed. It
 *  returns one complete JSON body, not chunked, not SSE. The loop
 *  accumulates the full text and does one `JSON.parse` at the end; a
 *  malformed body silently falls back to the raw text rather than throwing,
 *  which this preserves by reading via `.text()` and parsing by hand instead
 *  of the simpler `.json()` (which would throw and lose that fallback). */
export async function callAI(
  payload: CallAIPayload,
  { retries = MAX_RETRIES, timeoutMs = REQUEST_TIMEOUT_MS }: { retries?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const body = JSON.stringify({ ...payload, settings: loadSettings() });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Without a deadline a stalled connection leaves the UI on its loading
      // state indefinitely, with no error and no way back.
      const response = await fetch(EDGE_URL, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as {
          error?: string;
          refused?: boolean;
        };
        const err = edgeError(
          errBody.error || "AI is temporarily unavailable. Please try again in a moment.",
          errBody.refused === true,
        );
        // 4xx (other than 429) means the request itself is wrong — retrying
        // it just burns another round trip for the same result.
        (err as AIError & { retryable?: boolean }).retryable =
          response.status >= 500 || response.status === 429;
        throw err;
      }

      const rawText = await response.text();
      let parsedText = rawText;
      try {
        const parsed = JSON.parse(rawText) as { text?: string };
        if (parsed?.text) parsedText = parsed.text;
      } catch {
        /* Malformed body — fall back to the raw text, matching the vanilla. */
      }
      return parsedText;
    } catch (err) {
      const name = (err as { name?: string }).name;
      // Hitting our own deadline means the server already spent its whole
      // budget walking the provider chain. Replaying that costs another
      // round of waiting to almost certainly time out again.
      if (name === "TimeoutError" || name === "AbortError") {
        throw edgeError(
          "That took longer than expected and timed out. Please try again in a moment.",
        );
      }
      const retryable = (err as AIError & { retryable?: boolean }).retryable;
      const isLast = attempt === retries;
      if (isLast || retryable === false) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  // Unreachable — the loop above always returns or throws — but keeps the
  // return type non-optional without an unsound assertion.
  throw edgeError("AI is temporarily unavailable. Please try again in a moment.");
}

/* =========================================================================
   UNIFIED CREATION PIPELINE

   Every notes document, flashcard deck and quiz in the app is produced by
   createStudyPackage() — the only place that talks to the model for content
   generation, always asking for exactly one kind of output per call so the
   response shape is never ambiguous. Direct port of js/ai.js:472-826.
   ========================================================================= */

export type SourceKind = "file" | "text" | "link" | "material" | "topic";

export interface CreateStudyPackageSource {
  kind: SourceKind;
  file?: File;
  text?: string;
  url?: string;
  materialId?: string;
  topic?: string;
}

export interface CreateStudyPackageOutputs {
  flashcards?: boolean;
  quiz?: boolean;
}

export type QuizDifficulty = "Easy" | "Medium" | "Hard";

export interface CreateStudyPackageOptions {
  cardCount?: number;
  questionCount?: number;
  difficulty?: QuizDifficulty;
  personality?: string;
}

export interface CreateStudyPackageRequest {
  source: CreateStudyPackageSource;
  folderId?: string | null;
  /** Optional custom title; defaults to the file/topic name. */
  title?: string;
  outputs?: CreateStudyPackageOutputs;
  options?: CreateStudyPackageOptions;
  /** Called as generation moves through its stages, so a loading state can
   *  reflect the run actually in flight. */
  onProgress?: (message: string) => void;
}

export interface CreateStudyPackageResult {
  material: Material | null;
  notes: string | null;
  deck: FlashcardDeck | null;
  quiz: Quiz | null;
  /** "notes" | "flashcards" | "quiz" — partial success is normal and
   *  reported here rather than thrown, so a deck that generated plus a quiz
   *  that failed doesn't lose the deck. */
  errors: string[];
}

/* Applied whenever the caller omits a value. The Create modal shows these as
 * its initial state, so what the form submits and what a scripted call
 * produces cannot drift apart. */
export const CREATE_DEFAULTS: Required<CreateStudyPackageOptions> = Object.freeze({
  cardCount: 12,
  questionCount: 10,
  difficulty: "Medium",
  personality: "Friendly Tutor",
});

/* How much of a notes document is fed back into a follow-up generation.
 * Shared by decks and quizzes so both see the same slice of the material. */
export const MAX_SOURCE_CHARS = 6000;

/** Reads a File into the base64 shape the edge function expects. */
function fileToPayload(file: File): Promise<AIFilePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      resolve({ name: file.name, mimeType: file.type, data: result.split(",")[1] });
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/* Primitive 1 — notes. Notes are the canonical text form of a material:
 * decks and quizzes are always built from them rather than the original
 * file, so a 40-page PDF is uploaded once and never re-sent. That is why a
 * brand-new material always gets notes even if the student only asked for
 * flashcards. */
async function generateNotes(
  material: Material,
  filePayload: AIFilePayload | null,
): Promise<string | null> {
  let prompt = `You are a premium AI study guide creator and personal tutor for a student.

Analyze the provided study material and write comprehensive, well-structured Markdown study notes:
- Start with a welcoming title using ## and a brief intro addressing the student directly ("Let's break down...", "Here's your guide to...")
- Use ### for main topics and #### for subtopics
- Bold **key terms** when first introduced
- Use bullet lists for related concepts
- Include code blocks with \`\`\`language syntax if the material involves programming
- Use > blockquotes for important definitions or formulas
- Keep the tone conversational and encouraging — like a friendly tutor, not a textbook
- Be thorough — cover all major concepts from the material

Output the Markdown notes only. Do not add any preamble or closing commentary.`;

  let payload = filePayload;

  // Gemini rejects text/plain as inlineData, so text sources are folded into
  // the prompt instead of being sent as an attachment.
  if (filePayload && filePayload.mimeType === "text/plain") {
    try {
      const decoded = decodeBase64UTF8(filePayload.data);
      if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(decoded)) {
        prompt += `\n\nThe student provided a YouTube video link: ${decoded}\nYou cannot watch the video, but based on the URL and any context in the title, generate useful study notes about the likely topic. Be transparent that these notes are based on the video's topic, not its exact transcript. If you can identify the topic from the URL, focus your notes on that subject.`;
      } else {
        prompt += `\n\nStudy Material Content:\n"""\n${decoded}\n"""`;
      }
      payload = null;
    } catch (e) {
      console.error("[ai] generateNotes: failed to decode text payload", e);
    }
  }

  const text = await callAI({
    history: [{ role: "user", content: prompt }],
    file: payload,
    mode: "notes",
  });

  const markdown = (text || "").trim();
  // A handful of characters back is a truncated or refused response, not a
  // study guide — saving it would leave a material that looks processed but
  // yields nothing for decks and quizzes to build on.
  if (markdown.length < 50) return null;

  await notesApi.add(material.id, markdown);
  return markdown;
}

/* Notes for an existing material, fenced so the model treats them as data.
 * Every downstream generator reads its source through here. */
async function loadSourceText(materialId: string): Promise<string> {
  const notes = await notesApi.fetchByMaterial(materialId);
  const markdown = notes[0]?.markdown_content;
  if (!markdown) return "";
  return fenceUntrusted(markdown.substring(0, MAX_SOURCE_CHARS));
}

/* Primitive 2 — flashcard deck. */
async function generateDeck({
  sourceText,
  folderId,
  title,
  count,
}: {
  sourceText: string;
  folderId: string | null;
  title: string;
  count?: number;
}): Promise<FlashcardDeck | null> {
  const n = count || CREATE_DEFAULTS.cardCount;

  const prompt = `Generate exactly ${n} flashcards from the study material below. Each card must test a distinct concept — no two cards may restate the same fact.

Study Material:
"""
${sourceText}
"""`;

  const text = await callAI({ history: [{ role: "user", content: prompt }], mode: "flashcards" });
  const cards = extractFlashcardJSON(text);
  if (cards.length === 0) return null;

  const deck = await decksApi.add(folderId, title);
  await flashcardsApi.addBatch(deck.id, cards);
  return deck;
}

/* Primitive 3 — quiz. */
async function generateQuizFrom({
  sourceText,
  topic,
  title,
  materialId,
  folderId,
  options,
}: {
  sourceText: string;
  topic: string;
  title: string;
  materialId: string | null;
  folderId: string | null;
  options: CreateStudyPackageOptions;
}): Promise<Quiz | null> {
  const opts = { ...CREATE_DEFAULTS, ...options };
  const { difficulty, personality, questionCount: count } = opts;

  let difficultyGuidance: string;
  if (difficulty === "Easy") {
    difficultyGuidance = `Target Difficulty: EASY
- Test core definitions, primary facts, fundamental terminology, and basic concepts.
- Questions should be direct, assessing basic comprehension and clear recognition.`;
  } else if (difficulty === "Hard") {
    difficultyGuidance = `Target Difficulty: HARD / ADVANCED
- Questions must demand deep critical thinking, multi-step logical deduction, error spotting in subtle/flawed proofs, edge case analysis, counter-examples, or synthesizing multiple principles.
- Avoid superficial recall. For mathematical, scientific, or logical topics, test exact preconditions, subtle logical fallacies, edge cases (e.g. why logic holds or breaks under altered conditions), and higher generalizations.
- Distractors (incorrect choices) must be highly plausible, non-trivial, and reflect common advanced fallacies or subtle misconceptions.`;
  } else {
    difficultyGuidance = `Target Difficulty: MEDIUM
- Test conceptual understanding, mechanisms, cause-and-effect, step-by-step applications, and relationships between key ideas.
- Distractors should reflect typical student misunderstandings.`;
  }

  const prompt = `Generate a high-quality, non-repetitive multiple-choice quiz based on the provided material or topic.

Configuration:
- Topic: ${topic}
- Difficulty Level: ${difficulty}
- AI Host Personality: ${personality}
- Total Questions Required: ${count}

${difficultyGuidance}

STRICT DIVERSITY & QUALITY RULES:
1. ABSOLUTELY NO REPETITIVE QUESTIONS: Every single question MUST cover a completely DIFFERENT concept, sub-step, logical component, or angle. DO NOT ask back-to-back similar questions or rephrase the same premise.
2. QUESTION ANGLE VARIETY: Distribute questions across different angles such as:
   - Core Principles / Definitions
   - Step Mechanics & Logical Justifications (Why a specific step or assumption is necessary)
   - Flaw Spotting / Error Identification (Finding the logical mistake in a flawed statement or step)
   - Edge Cases & Counter-examples (Examining failure conditions or special cases)
   - Extensions & Applications (Applying the concept to related contexts or generalizations)
3. DISTRACTORS: All wrong choices MUST be realistic, meaningful, and carefully crafted. No obvious filler or duplicate choices across options.
4. FEEDBACK: For EACH question, include a comprehensive "feedback" string. The feedback MUST explain why the correct answer is right and why each incorrect option is wrong, written in the voice of the chosen AI Host Personality (${personality}). Address the student directly and engage them.

Material / Topic Content:
"""
${sourceText}
"""`;

  const text = await callAI({ history: [{ role: "user", content: prompt }], mode: "quiz" });
  const questions = extractQuizJSON(text);
  if (questions.length === 0) return null;

  return quizzesApi.add(materialId, folderId, title, questions);
}

/** The one entry point. Resolves to `{ material, notes, deck, quiz, errors }`
 *  — partial success is normal, not thrown. Throws only for pre-flight
 *  validation problems (missing file/text/link/topic, an oversized file, an
 *  unresolvable material) and for a content-safety refusal encountered while
 *  generating a requested output (which carries its own message and must
 *  reach the caller verbatim, not get folded into a generic failure). */
export async function createStudyPackage(
  request: CreateStudyPackageRequest,
): Promise<CreateStudyPackageResult> {
  const src = request.source;
  const outputs = request.outputs ?? {};
  const options = { ...CREATE_DEFAULTS, ...(request.options ?? {}) };
  const result: CreateStudyPackageResult = {
    material: null,
    notes: null,
    deck: null,
    quiz: null,
    errors: [],
  };

  const step = (message: string) => {
    try {
      request.onProgress?.(message);
    } catch (e) {
      console.error("[ai] onProgress", e);
    }
  };

  let folderId = request.folderId ?? null;
  let sourceText = "";
  let baseTitle = (request.title || "").trim();
  let topic = (src.topic || "").trim();

  /* ---- Step 1: resolve the source into a material + its notes ---------- */
  if (src.kind === "file" || src.kind === "text" || src.kind === "link") {
    let filePayload: AIFilePayload | null;

    if (src.kind === "file") {
      const file = src.file;
      if (!file) throw new Error("Please choose a file first.");
      // Matches the chat uploader: base64-encoding a huge file freezes the
      // tab, and the edge function rejects it anyway.
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("File too large. Maximum size is 10MB.");
      }
      const isAudio = /\.(mp3|mp4|wav|m4a|aac|ogg)$/i.test(file.name);
      const type: MaterialType = isAudio ? "audio" : "pdf";
      step(`Uploading ${file.name}…`);
      result.material = await materialsApi.uploadFile(file, folderId, type, baseTitle || undefined);
      filePayload = await fileToPayload(file);
    } else {
      const raw = (src.kind === "link" ? src.url : src.text)?.trim() ?? "";
      if (!raw) {
        throw new Error(
          src.kind === "link" ? "Please provide a link." : "Please paste some text first.",
        );
      }
      result.material = await materialsApi.addLink(raw, folderId, baseTitle || undefined);
      filePayload = {
        name: src.kind === "link" ? "Link" : "Raw Text",
        mimeType: "text/plain",
        data: btoa(unescape(encodeURIComponent(raw))),
      };
    }

    baseTitle = result.material.title;
    if (!topic) topic = baseTitle;

    // Always generated for new material — see generateNotes() above.
    step("Reading your material and writing notes…");
    const markdown = await generateNotes(result.material, filePayload);
    if (!markdown) {
      // Without notes there is nothing for a deck or quiz to read, so stop
      // here rather than firing two more calls that are certain to fail.
      result.errors.push("notes");
      return result;
    }
    result.notes = markdown;
    sourceText = fenceUntrusted(markdown.substring(0, MAX_SOURCE_CHARS));
  } else if (src.kind === "material") {
    if (!src.materialId) throw new Error("Pick something to create from first.");
    const material = await materialsApi.fetchById(src.materialId);
    if (!material) throw new Error("That material could not be found.");
    result.material = material;
    folderId = folderId || material.folder_id || null;
    baseTitle = baseTitle || material.title;
    if (!topic) topic = material.title;

    step("Loading your saved notes…");
    sourceText = await loadSourceText(material.id);
    if (!sourceText) {
      throw new Error(
        "No notes are available for this material yet — wait for AI processing to finish, then try again.",
      );
    }
  } else if (src.kind === "topic") {
    if (!topic) throw new Error("Please enter a topic.");
    baseTitle = baseTitle || topic;
    sourceText = `Topic: ${topic}`;
  } else {
    throw new Error("Pick something to create from first.");
  }

  /* ---- Step 2: derive the requested outputs ---------------------------- */
  if (outputs.flashcards) {
    try {
      step(`Building ${options.cardCount} flashcards…`);
      result.deck = await generateDeck({
        sourceText,
        folderId,
        title: `${baseTitle} Flashcards`,
        count: options.cardCount,
      });
      if (!result.deck) result.errors.push("flashcards");
    } catch (err) {
      console.error("[ai] createStudyPackage flashcards", err);
      result.errors.push("flashcards");
      if ((err as AIError)?.refused) throw err;
    }
  }

  if (outputs.quiz) {
    try {
      step(`Writing ${options.questionCount} quiz questions…`);
      result.quiz = await generateQuizFrom({
        sourceText,
        topic,
        title: `${baseTitle} Quiz`,
        materialId: result.material?.id ?? null,
        folderId,
        options,
      });
      if (!result.quiz) result.errors.push("quiz");
    } catch (err) {
      console.error("[ai] createStudyPackage quiz", err);
      result.errors.push("quiz");
      if ((err as AIError)?.refused) throw err;
    }
  }

  return result;
}

/* =========================================================================
   WEEKLY PLAN GENERATION
   ========================================================================= */

function buildWeeklyPlanPrompt(tasks: Task[], exams: Exam[]): { prompt: string; weekStartISO: string } {
  const todayStr = localDateStr();
  const pendingTasks =
    tasks
      .filter((t) => !t.is_done)
      .map((t) => (t.due_date ? `${t.text} (due ${t.due_date})` : t.text))
      .join(", ") || "None";
  // Only feed the model exams that haven't already happened — an exam that's
  // already past (or manually marked Completed) isn't "upcoming" and
  // shouldn't shape the schedule as if it still were.
  const upcomingExams =
    exams
      .filter((e) => e.status !== "Completed" && e.exam_date >= todayStr)
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
      .map((e) => `${e.exam_name} on ${e.exam_date} (difficulty: ${e.difficulty || "unspecified"})`)
      .join(", ") || "None";

  const monday = mondayOfWeek();
  const weekStartISO = localDateStr(monday);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateStr(d);
  });

  const prompt = `Build a weekly study schedule for the week of ${weekStartISO} (days: ${weekDates.join(", ")}).
Pending tasks: ${pendingTasks}
Upcoming exams: ${upcomingExams}
Prioritize subjects with closer/harder exams and tasks with closer due dates. Keep daily blocks realistic (30-90 minutes each, a couple of blocks per day at most). If there is no exam/task data, suggest light general review blocks.`;

  return { prompt, weekStartISO };
}

/** Generates and persists this week's plan, overwriting any existing one for
 *  the same week (`plansApi.upsert`'s `onConflict`). Throws on failure —
 *  unlike its vanilla counterpart, which swallows the error and shows a
 *  popup itself, matching Decision #6: this layer reports, the caller (a
 *  `useMutation`) decides how to tell the user. The caller is also where the
 *  "you already have a plan this week, overwrite it?" confirmation lives
 *  (`AIActionsCard`), same as the vanilla's dashboard button, not this
 *  function — `generateWeeklyPlan` itself never confirms, in either app. */
export async function generateWeeklyPlan(): Promise<WeeklyPlan> {
  const [tasks, exams] = await Promise.all([tasksApi.fetch(), examsApi.fetch()]);
  const { prompt, weekStartISO } = buildWeeklyPlanPrompt(tasks, exams);

  const text = await callAI({ history: [{ role: "user", content: prompt }], mode: "plan" });
  const planJson = extractPlanJSON(text);
  if (!planJson) {
    throw new Error("Couldn't generate a plan this time. Please try again.");
  }

  return plansApi.upsert(weekStartISO, planJson);
}
