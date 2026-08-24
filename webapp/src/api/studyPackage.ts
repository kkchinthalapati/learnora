/* The unified creation pipeline — ports `AI.createStudyPackage` and its four
 * primitives (js/ai.js:472-826).
 *
 * Every notes document, flashcard deck and quiz in the app is produced here.
 * The vanilla's header explains why it exists at all: it replaced three
 * unrelated code paths reached from eight buttons, and an ingestion call that
 * asked one model request for Markdown *and* a JSON array at once and split
 * them on a token the model was free not to emit. Each primitive below asks
 * for exactly one kind of output in the matching edge mode, so a response
 * shape is never ambiguous.
 *
 * Three deliberate changes from the vanilla, each a consequence of a decision
 * already made on this branch:
 *
 *  1. `settings` is a parameter, not a `UI.loadSettings()` global read — same
 *     as `aiPlan.ts` and `aiQuiz.ts`.
 *  2. Failures are reported as structured `StageFailure`s instead of a bare
 *     `errors: string[]`, and a content refusal in a *later* stage no longer
 *     re-throws out of the whole run. The vanilla did re-throw (js/ai.js:784,
 *     :803), which threw away the reference to a deck that had already been
 *     generated and saved a moment earlier — the caller reported "Create
 *     failed" for a run that had in fact created something. Carrying the
 *     refusal message on the result keeps both facts.
 *  3. Untrusted text is fenced before it re-enters a prompt (`fenceUntrusted`),
 *     including the uploaded/pasted source itself. The vanilla interpolated a
 *     decoded document straight into the notes prompt (js/ai.js:535) — exactly
 *     the hole `lib/actionTags.ts` exists to close.
 */

import { AiError, callEdge, type FilePayload } from "./ai";
import {
  generateQuizFrom,
  QUIZ_DEFAULTS,
  QuizShapeError,
  type QuizDifficulty,
} from "./aiQuiz";
import { decksApi } from "./decks";
import { flashcardsApi } from "./flashcards";
import { materialsApi } from "./materials";
import { notesApi } from "./notes";
import { decodeBase64UTF8, extractFlashcardJSON } from "../lib/aiJson";
import { fenceUntrusted } from "../lib/actionTags";
import { supabase } from "../lib/supabase";
import { setMaterialProcessing } from "../lib/materialProcessing";
import type { Settings } from "../lib/settings";
import type { FlashcardDeck, Material, Quiz } from "./types";

/** Applied whenever the caller omits a value. The Create modal shows these as
 *  its initial state, so what the form submits and what a scripted call
 *  produces cannot drift apart (js/ai.js:489-494).
 *
 *  Widened to `Required<CreateOptions>` rather than left as literal types: the
 *  form seeds its state from these and then lets the student change them, so
 *  `12` has to mean "a number, initially 12". */
export const CREATE_DEFAULTS: Readonly<Required<CreateOptions>> = Object.freeze(
  {
    cardCount: 12,
    questionCount: QUIZ_DEFAULTS.questionCount,
    difficulty: QUIZ_DEFAULTS.difficulty,
    personality: QUIZ_DEFAULTS.personality,
  },
);

/** How much of a notes document is fed back into a follow-up generation.
 *  Shared by decks and quizzes so both see the same slice of the material. */
export const MAX_SOURCE_CHARS = 6000;

/** Matches the chat uploader: base64-encoding a huge file freezes the tab, and
 *  the edge function rejects it anyway. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** A handful of characters back is a truncated or refused response, not a
 *  study guide — saving it would leave a material that looks processed but
 *  yields nothing for decks and quizzes to build on. */
const MIN_NOTES_CHARS = 50;

/* `createStudyPackage` decides audio-vs-document from this, and the notes
   prompt spots a video link from the other. Both carried over verbatim. */
const AUDIO_FILE = /\.(mp3|mp4|wav|m4a|aac|ogg)$/i;
const YOUTUBE_LINK = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//;

/** Thrown when the model replied but the reply was too short to be a study
 *  guide — distinct from the service being down, and worth different wording. */
export class NotesShapeError extends Error {
  constructor() {
    super(
      "Couldn't write notes from that material this time. Please try again.",
    );
    this.name = "NotesShapeError";
  }
}

/** Thrown when the model replied but nothing card-shaped survived validation. */
export class DeckShapeError extends Error {
  constructor() {
    super("Couldn't generate flashcards this time. Please try again.");
    this.name = "DeckShapeError";
  }
}

/* =========================================================================
   Primitive 1 — notes.

   Notes are the canonical text form of a material: decks and quizzes are
   always built from them rather than from the original file, so a 40-page PDF
   is uploaded once and never re-sent. That is why a brand-new material always
   gets notes even if the student only asked for flashcards.
   ========================================================================= */

/** Carried over verbatim (js/ai.js:511-523) — it is what the edge function's
 *  `mode: "notes"` instructions were tuned against. */
export const NOTES_INSTRUCTIONS = `You are a premium AI study guide creator and personal tutor for a student.

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

/** `inlineText` is the source folded into the prompt rather than attached —
 *  see `generateNotes`. Fenced here, not by the caller, so no path into this
 *  prompt can forget to. */
export function buildNotesPrompt(inlineText?: string | null): string {
  if (!inlineText) return NOTES_INSTRUCTIONS;

  const safe = fenceUntrusted(inlineText);
  if (YOUTUBE_LINK.test(inlineText)) {
    return `${NOTES_INSTRUCTIONS}

The student provided a YouTube video link: ${safe}
You cannot watch the video, but based on the URL and any context in the title, generate useful study notes about the likely topic. Be transparent that these notes are based on the video's topic, not its exact transcript. If you can identify the topic from the URL, focus your notes on that subject.`;
  }

  return `${NOTES_INSTRUCTIONS}

Study Material Content:
"""
${safe}
"""`;
}

/** Where the notes are written from: text the student typed or pasted, or a
 *  file they uploaded. */
export type NotesSource = { inlineText: string } | { file: File };

/** Write notes for a freshly-created material and save them. Resolves with the
 *  Markdown; throws `NotesShapeError` if the reply was not usable. */
export async function generateNotes({
  material,
  source,
  settings,
}: {
  material: Material;
  source: NotesSource;
  settings: Settings;
}): Promise<string> {
  let inlineText: string | null = null;
  let attachment: FilePayload | null = null;

  if ("inlineText" in source) {
    inlineText = source.inlineText;
  } else {
    const payload = await fileToPayload(source.file);
    /* Gemini rejects text/plain as inlineData, so a plain-text upload is
       folded into the prompt instead of being attached. If the decode itself
       fails the payload is sent as-is — the vanilla's fallback
       (js/ai.js:538), and better than dropping the source entirely. */
    if (payload.mimeType === "text/plain") {
      try {
        inlineText = decodeBase64UTF8(payload.data);
      } catch (err) {
        console.error("[studyPackage] failed to decode text payload", err);
        attachment = payload;
      }
    } else {
      attachment = payload;
    }
  }

  const { text, refused } = await callEdge({
    history: [{ role: "user", content: buildNotesPrompt(inlineText) }],
    file: attachment,
    mode: "notes",
    settings,
  });

  /* `notes` isn't a JSON mode, so a safety refusal comes back as a 200 with
     the refusal sentence *as* `text` rather than a thrown error (see
     EdgeResult.refused) — the one path in this file where the reply is read
     as data instead of being displayed. Without this check, an upload that
     trips the content screen would silently save "I can't help with that
     topic…" to the database as the material's notes, with nothing telling
     the student generation had failed. */
  if (refused) throw new AiError(text, { refused: true, retryable: false });

  const markdown = text.trim();
  if (markdown.length < MIN_NOTES_CHARS) throw new NotesShapeError();

  await notesApi.add(material.id, markdown);
  return markdown;
}

/** Notes for an existing material, fenced so the model treats them as data.
 *  Every downstream generator reads its source through here. Empty string when
 *  the material has no notes yet. */
export async function loadSourceText(materialId: string): Promise<string> {
  const notes = await notesApi.fetchByMaterial(materialId);
  const markdown = notes[0]?.markdown_content;
  if (!markdown) return "";
  return fenceUntrusted(markdown.substring(0, MAX_SOURCE_CHARS));
}

/* =========================================================================
   Primitive 2 — flashcard deck.
   ========================================================================= */

/** `sourceText` is already fenced by the caller — see `loadSourceText`. */
export function buildDeckPrompt(sourceText: string, count: number): string {
  return `Generate exactly ${count} flashcards from the study material below. Each card must test a distinct concept — no two cards may restate the same fact.

Study Material:
"""
${sourceText}
"""`;
}

export async function generateDeck({
  sourceText,
  folderId,
  title,
  count,
  settings,
}: {
  sourceText: string;
  folderId: string | null;
  title: string;
  count: number;
  settings: Settings;
}): Promise<FlashcardDeck> {
  const { text } = await callEdge({
    history: [{ role: "user", content: buildDeckPrompt(sourceText, count) }],
    mode: "flashcards",
    settings,
  });

  /* `extractFlashcardJSON` validates the array and its first element, not
     every card, so a reply that trails off into `{"front": "…"}` with no back
     can still get this far. Both columns are NOT NULL, so one such card would
     reject the whole batch insert and lose the good cards with it. */
  const cards = extractFlashcardJSON(text).filter(
    (c) =>
      typeof c.front === "string" &&
      !!c.front.trim() &&
      typeof c.back === "string" &&
      !!c.back.trim(),
  );
  if (cards.length === 0) throw new DeckShapeError();

  // Created only once there are cards to put in it — an empty deck row is
  // worse than no deck, since the library lists it and the review screen
  // serves nothing.
  const deck = await decksApi.add(folderId, title);
  await flashcardsApi.addBatch(deck.id, cards);
  return deck;
}

/** Generate and save a deck on a bare topic — no material, no folder. Same
 *  shape as `generateQuizFromTopic` below it in aiQuiz.ts: the chat's
 *  `<ADD_DECK>Topic</ADD_DECK>` tag is the only caller, and a topic-only
 *  source has no notes document, so the topic line stands in for one. */
export async function generateDeckFromTopic(
  topic: string,
  settings: Settings,
  count: number = CREATE_DEFAULTS.cardCount,
): Promise<FlashcardDeck> {
  const trimmed = topic.trim();
  if (!trimmed) throw new Error("Please enter a topic.");

  /* Reachable from a model reply, so not app-authored text — fenced before
     it goes back into a prompt, matching generateQuizFromTopic. */
  const safeTopic = fenceUntrusted(trimmed);

  return generateDeck({
    sourceText: `Topic: ${safeTopic}`,
    folderId: null,
    title: `${trimmed} Flashcards`,
    count,
    settings,
  });
}

/* =========================================================================
   THE ONE ENTRY POINT.
   ========================================================================= */

export type StudyStage = "notes" | "flashcards" | "quiz";

export interface StageFailure {
  stage: StudyStage;
  /** Safe to show the student as-is. */
  message: string;
  /** A content refusal: the message explains *why* and replaces, rather than
   *  supplements, the generic "couldn't generate" wording. */
  refused: boolean;
}

export type StudySource =
  | { kind: "file"; file: File | null }
  | { kind: "text"; text: string }
  | { kind: "link"; url: string }
  | { kind: "material"; materialId: string }
  | { kind: "topic"; topic: string };

export interface CreateOptions {
  cardCount?: number;
  questionCount?: number;
  difficulty?: QuizDifficulty;
  personality?: string;
}

export interface StudyPackageRequest {
  source: StudySource;
  /** Ignored for a topic source, which files nothing. */
  folderId?: string | null;
  /** Optional custom title; otherwise derived from the material or topic. */
  title?: string;
  outputs?: { flashcards?: boolean; quiz?: boolean };
  options?: CreateOptions;
  settings: Settings;
  /** Reports the stage actually in flight, so a loader can caption itself with
   *  the truth rather than cycling a fixed script. */
  onProgress?: (message: string) => void;
}

export interface StudyPackageResult {
  material: Material | null;
  /** Only set when notes were written *in this run* — building a deck from an
   *  existing material leaves this null even though notes exist. */
  notes: string | null;
  deck: FlashcardDeck | null;
  quiz: Quiz | null;
  /** Partial success is normal and is reported rather than thrown: a deck that
   *  generated plus a quiz that failed must not lose the deck. */
  failures: StageFailure[];
}

const STAGE_FALLBACK: Record<StudyStage, string> = {
  notes: "Couldn't write notes from that material this time. Please try again.",
  flashcards: "Couldn't generate flashcards this time. Please try again.",
  quiz: "Couldn't generate a quiz this time. Please try again.",
};

/* Only errors this layer raised on purpose carry text fit to show a student.
   A raw Postgres or storage message is swapped for the stage's wording. */
function failureMessage(stage: StudyStage, err: unknown): string {
  const isOurs =
    err instanceof AiError ||
    err instanceof NotesShapeError ||
    err instanceof DeckShapeError ||
    err instanceof QuizShapeError;
  return isOurs ? (err as Error).message : STAGE_FALLBACK[stage];
}

/** Turn a source into a material plus whichever outputs were asked for.
 *
 *  Throws only when the *source* can't be resolved (no file, oversized file,
 *  a rejected upload, a missing material, a material with no notes to build
 *  on) — at that point nothing usable has been produced and there is no
 *  partial result to protect. From the notes stage onwards, every failure
 *  lands in `result.failures` instead, so the caller keeps whatever did get
 *  made. */
export async function createStudyPackage(
  request: StudyPackageRequest,
): Promise<StudyPackageResult> {
  const { source, settings } = request;
  const outputs = request.outputs ?? {};
  const options = { ...CREATE_DEFAULTS, ...(request.options ?? {}) };
  const result: StudyPackageResult = {
    material: null,
    notes: null,
    deck: null,
    quiz: null,
    failures: [],
  };

  /* Never let a reporting error take down a generation that is otherwise
     fine. */
  const step = (message: string) => {
    try {
      request.onProgress?.(message);
    } catch (err) {
      console.error("[studyPackage] onProgress", err);
    }
  };

  const fail = (stage: StudyStage, err: unknown) => {
    console.error(`[studyPackage] ${stage}`, err);
    result.failures.push({
      stage,
      message: failureMessage(stage, err),
      refused: err instanceof AiError && err.refused,
    });
  };

  let folderId = request.folderId || null;
  let baseTitle = (request.title ?? "").trim();
  let topic: string;
  let sourceText: string;

  /* ---- Step 1: resolve the source into a material + its notes ------------ */
  if (
    source.kind === "file" ||
    source.kind === "text" ||
    source.kind === "link"
  ) {
    let notesSource: NotesSource;

    if (source.kind === "file") {
      const file = source.file;
      if (!file) throw new Error("Please choose a file first.");
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error("File too large. Maximum size is 10MB.");
      }
      step(`Uploading ${file.name}…`);
      result.material = await materialsApi.uploadFile(
        file,
        folderId,
        AUDIO_FILE.test(file.name) ? "audio" : "pdf",
        baseTitle || undefined,
      );
      setMaterialProcessing({
        materialId: result.material.id,
        status: "processing",
        requestPayload: request,
      });
      notesSource = { file };
    } else {
      const raw = (source.kind === "link" ? source.url : source.text).trim();
      if (!raw) {
        throw new Error(
          source.kind === "link"
            ? "Please provide a link."
            : "Please paste some text first.",
        );
      }
      result.material = await materialsApi.addLink(
        raw,
        folderId,
        baseTitle || undefined,
      );
      setMaterialProcessing({
        materialId: result.material.id,
        status: "processing",
        requestPayload: request,
      });
      /* Straight through as text. The vanilla base64-encoded it into a
         `text/plain` payload here and decoded it again inside `_generateNotes`
         (js/ai.js:723-727, :529-537) — a round trip with no observable effect,
         since a text/plain payload is never sent as an attachment anyway. */
      notesSource = { inlineText: raw };
    }

    baseTitle = result.material.title;
    topic = baseTitle;

    // Always generated for new material — see the primitive's header.
    step("Reading your material and writing notes…");
    try {
      result.notes = await generateNotes({
        material: result.material,
        source: notesSource,
        settings,
      });
    } catch (err) {
      /* Without notes there is nothing for a deck or quiz to read, so stop
         here rather than firing two more calls that are certain to fail. */
      fail("notes", err);
      return result;
    }
    sourceText = fenceUntrusted(result.notes.substring(0, MAX_SOURCE_CHARS));
  } else if (source.kind === "material") {
    const material = await materialsApi.fetchById(source.materialId);
    if (!material) throw new Error("That material could not be found.");
    result.material = material;
    folderId = folderId || material.folder_id || null;
    baseTitle = baseTitle || material.title;
    topic = material.title;
    setMaterialProcessing({
      materialId: material.id,
      status: "processing",
      requestPayload: request,
    });

    step("Loading your saved notes…");
    sourceText = await loadSourceText(material.id);
    if (!sourceText) {
      if (material.storage_path) {
        step(`Downloading ${material.title}…`);
        const { data: blob, error: downloadError } = await supabase.storage
          .from("materials")
          .download(material.storage_path);
        if (downloadError || !blob) {
          throw new Error(
            "Could not download original material file to write notes.",
          );
        }
        const file = new File([blob], material.title, { type: blob.type });
        step("Reading your material and writing notes…");
        try {
          result.notes = await generateNotes({
            material,
            source: { file },
            settings,
          });
        } catch (err) {
          fail("notes", err);
          return result;
        }
        sourceText = fenceUntrusted(
          result.notes.substring(0, MAX_SOURCE_CHARS),
        );
      } else if (material.raw_content) {
        step("Reading your material and writing notes…");
        try {
          result.notes = await generateNotes({
            material,
            source: { inlineText: material.raw_content },
            settings,
          });
        } catch (err) {
          fail("notes", err);
          return result;
        }
        sourceText = fenceUntrusted(
          result.notes.substring(0, MAX_SOURCE_CHARS),
        );
      } else {
        throw new Error(
          "No notes are available for this material yet — wait for AI processing to finish, then try again.",
        );
      }
    }
  } else {
    const trimmed = source.topic.trim();
    if (!trimmed) throw new Error("Please enter a topic.");
    baseTitle = baseTitle || trimmed;
    topic = trimmed;
    // A topic-only source has no notes document, so the topic line is itself
    // the material the deck and quiz are built from.
    sourceText = `Topic: ${fenceUntrusted(trimmed)}`;
  }

  /* ---- Step 2: derive the requested outputs ----------------------------- */
  if (outputs.flashcards) {
    try {
      step(`Building ${options.cardCount} flashcards…`);
      result.deck = await generateDeck({
        sourceText,
        folderId,
        title: `${baseTitle} Flashcards`,
        count: options.cardCount,
        settings,
      });
    } catch (err) {
      fail("flashcards", err);
    }
  }

  if (outputs.quiz) {
    try {
      step(`Writing ${options.questionCount} quiz questions…`);
      result.quiz = await generateQuizFrom({
        sourceText,
        // A filename or material title is not app-authored text either.
        topic: fenceUntrusted(topic),
        title: `${baseTitle} Quiz`,
        materialId: result.material?.id ?? null,
        folderId,
        settings,
        options,
      });
    } catch (err) {
      fail("quiz", err);
    }
  }

  /* No closing "Saving…" stage: each primitive persists its own output before
     resolving, so by here there is nothing left to do and the caption would be
     describing work that already finished. */
  return result;
}

/** Reads a File into the base64 shape the edge function expects
 *  (js/ai.js:815-826). */
export function fileToPayload(file: File): Promise<FilePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const comma = dataUrl.indexOf(",");
      resolve({
        name: file.name,
        // Browsers leave `type` empty for some extensions; a plain-text
        // fallback keeps such a file on the "fold it into the prompt" path
        // rather than sending an attachment with no declared type.
        mimeType:
          file.type || (/\.(txt|md)$/i.test(file.name) ? "text/plain" : ""),
        data: comma === -1 ? "" : dataUrl.slice(comma + 1),
      });
    };
    reader.onerror = () => reject(new Error("Failed to read that file."));
    reader.readAsDataURL(file);
  });
}

/* =========================================================================
   Reporting helpers — pure, so the rules the vanilla buried in its submit
   handler (js/main.js:380-410) are testable on their own.
   ========================================================================= */

/** The post-run toast. Null when nothing at all was produced — that case is a
 *  failure to report, not a success with caveats. */
export function summarizeStudyPackage(
  result: StudyPackageResult,
): string | null {
  const made: string[] = [];
  if (result.notes) made.push("notes");
  if (result.deck) made.push("flashcards");
  if (result.quiz) made.push("a quiz");
  if (made.length === 0) return null;

  /* A notes failure can't coexist with anything made, since the pipeline stops
     there — so this filter only ever drops a stage that is already implied. */
  const failed = result.failures
    .filter((f) => f.stage !== "notes")
    .map((f) => f.stage);

  return failed.length
    ? `Created ${made.join(", ")} — ${failed.join(" and ")} didn't generate.`
    : `Created ${made.join(", ")}.`;
}

/** Where to land the student: the most specific outcome wins. A quiz is the
 *  most specific, then notes written *in this run* (so building a deck from an
 *  existing material doesn't dump you back into notes you already had), then
 *  the new deck. Null when there is nothing to show. */
export function studyPackageDestination(
  result: StudyPackageResult,
): string | null {
  if (result.quiz) return `/quiz/${encodeURIComponent(result.quiz.id)}`;
  if (result.notes && result.material) {
    return `/notes/${encodeURIComponent(result.material.id)}`;
  }
  if (result.deck) return "/library/flashcards";
  if (result.material)
    return `/notes/${encodeURIComponent(result.material.id)}`;
  return null;
}
