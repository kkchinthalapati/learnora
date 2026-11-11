/* A lesson as a short two-voice podcast: an AI-written script of a host and
 * a curious student talking it through, read aloud by the device's own
 * speech voices (views/lesson/PodcastPlayer.tsx).
 *
 * One request per lesson, billed to the lesson's Learn allowance under its
 * own session key (one more unit, its own cap), the same way the Plus extras
 * are. The script is taught from the lesson's notes only and shaped by the
 * student's learner style. A reply that isn't a usable dialogue is a failure
 * the player offers to retry, never padded out. */

import { callEdge } from "./ai";
import { learnSessionKey } from "./learn";
import { loadLearnerProfileRule } from "./learnerStyle";
import { learnerSettings, loadLearnerContext } from "./learnerContext";
import { extractJSON } from "../lib/aiJson";
import { fenceUntrusted } from "../lib/actionTags";
import { studentStandard } from "../lib/studentLevel";
import { proseOnly } from "./learn";
import {
  DEFAULT_PODCAST_STYLE,
  LENGTHS,
  podcastStyleRules,
  type PodcastStyle,
} from "../lib/podcastStyle";

/** "check" is a recall break: `text` is a question to the listener and
 *  `answer` is given after a pause (lib/podcastStyle.ts). */
export type PodcastSpeaker = "host" | "student" | "check";

export interface PodcastLine {
  speaker: PodcastSpeaker;
  text: string;
  answer?: string;
}

export interface PodcastScript {
  title: string;
  lines: PodcastLine[];
}

/** Enough notes for a ten-minute conversation; the rest is cut. */
const NOTES_CHARS = 9000;
const MIN_LINES = 8;
const MAX_LINES = 70;
const MAX_LINE_CHARS = 600;

export function buildPodcastPrompt({
  lesson,
  notes,
  level,
  styleLine = "",
  studentContext = "",
  style = DEFAULT_PODCAST_STYLE,
  missed = [],
}: {
  lesson: string;
  notes: string;
  level: string;
  styleLine?: string;
  /** How the student asked for it (lib/podcastStyle.ts). */
  style?: PodcastStyle;
  /** Titles of the parts the student got wrong in Learn. */
  missed?: readonly string[];
  /** api/learnerContext: their recurring mistakes and what they know. The
   *  student voice's slip is then one this student really makes. */
  studentContext?: string;
}): string {
  return `Write a short educational podcast episode that teaches a student's lesson, in the format described below.

LESSON: """${fenceUntrusted(lesson)}"""
THE STUDENT'S NOTES (teach from these only; do not contradict them, and do not add facts they do not support):
"""
${fenceUntrusted(notes.slice(0, NOTES_CHARS))}
"""
Pitch it at: ${level}.
${styleLine}
${studentContext ? `\n${studentContext}\n` : ""}
${podcastStyleRules(style, missed.map((t) => fenceUntrusted(t)))}

Rules:
- Written to be heard, not read: short sentences, no lists, no headings, no symbols that only make sense on a page. Say maths in words ("x squared", "two thirds"). Never describe a diagram.
- One concrete example per main idea. Open with a one-line hook about why this matters; close with the three things to remember.
- No sound effects, no stage directions, no names, no greetings to "listeners".

Reply with ONLY raw JSON:
{"title": "a short episode title", "lines": [{"speaker": "host", "text": "..."}, {"speaker": "student", "text": "..."}${style.recallBreaks ? `, {"speaker": "check", "text": "a question", "answer": "its answer"}` : ""}]}`;
}

export function parsePodcastScript(
  text: string,
  fallbackTitle: string,
  style: PodcastStyle = DEFAULT_PODCAST_STYLE,
): PodcastScript | null {
  const parsed = extractJSON<{ title?: unknown; lines?: unknown }>(text);
  if (!parsed || !Array.isArray(parsed.lines)) return null;
  const lines: PodcastLine[] = [];
  for (const raw of parsed.lines.slice(0, MAX_LINES)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { speaker?: unknown; text?: unknown; answer?: unknown };
    const said =
      typeof r.text === "string"
        ? proseOnly(r.text).replace(/\s+/g, " ").trim()
        : "";
    if (!said) continue;
    if (r.speaker === "check") {
      /* A recall break needs its answer, and only when they were asked for. */
      const answer = typeof r.answer === "string" ? proseOnly(r.answer).replace(/\s+/g, " ").trim() : "";
      if (style.recallBreaks && answer) {
        lines.push({ speaker: "check", text: said.slice(0, MAX_LINE_CHARS), answer: answer.slice(0, MAX_LINE_CHARS) });
      }
      continue;
    }
    /* A solo episode has one voice, whatever the reply labelled it. */
    const speaker: PodcastSpeaker =
      style.format !== "solo" && r.speaker === "student" ? "student" : "host";
    lines.push({ speaker, text: said.slice(0, MAX_LINE_CHARS) });
  }
  const spoken = lines.filter((l) => l.speaker !== "check");
  if (spoken.length < Math.min(MIN_LINES, LENGTHS[style.length].lines[0])) return null;
  /* A conversation or a debate needs both voices. */
  if (!spoken.some((l) => l.speaker === "host")) return null;
  if (style.format !== "solo" && !spoken.some((l) => l.speaker === "student")) return null;
  const title =
    typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim().slice(0, 120)
      : fallbackTitle;
  return { title, lines };
}

export async function writePodcastScript({
  materialId,
  lesson,
  notes,
  subject = null,
  style = DEFAULT_PODCAST_STYLE,
  missed = [],
}: {
  materialId: string;
  lesson: string;
  notes: string;
  subject?: string | null;
  style?: PodcastStyle;
  missed?: readonly string[];
}): Promise<PodcastScript> {
  const [{ level }, styleLine, studentContext] = await Promise.all([
    studentStandard(lesson).catch(() => ({ level: "", specLine: "" })),
    loadLearnerProfileRule(),
    loadLearnerContext(subject),
  ]);
  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: buildPodcastPrompt({
          lesson,
          notes,
          level: level || "the student's own course",
          styleLine,
          studentContext,
          style,
          missed,
        }),
      },
    ],
    mode: "solver",
    tool: "learn",
    sessionKey: learnSessionKey(materialId, "podcast"),
    /* Their language and tutor persona. */
    settings: learnerSettings(),
  });
  const script = parsePodcastScript(text, lesson, style);
  if (!script) throw new Error("I couldn't write the podcast just now.");
  return script;
}
