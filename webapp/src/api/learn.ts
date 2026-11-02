/* One section of Learn (views/lesson/LearnPanel): a question to guess at,
 * every idea in the section taught from the lesson's own notes (with cards
 * where structure teaches better than prose), a check, and, for a student
 * who misses the check, that idea taught a different way with a second,
 * different check. One request per section carries all of it, so a miss
 * costs no extra call, and one more request frames the whole lesson. All of
 * it stays well inside one session's billing (learnora-ai counts every call
 * with the same session key once a day).
 *
 * The shape is the first lesson's (api/firstLesson.ts), with the same rule:
 * a reply missing any part is a failure the screen offers to retry, never
 * padded out. */
import { AiError, callEdge } from "./ai";
import { extractJSON } from "../lib/aiJson";
import { fenceUntrusted } from "../lib/actionTags";
import { levelRules, studentStandard } from "../lib/studentLevel";
import { readMarking, type Marking, type RawMarking, type SchemePoint } from "../lib/photoMarking";
import { isFlagOn } from "../lib/flags";
import { splitOpenUiBlocks } from "../lib/openui/fence";
import { shuffled, toQuestion } from "./firstLesson";
import type { QuizQuestion } from "../lib/aiJson";
import type { LearnSection } from "../lib/learnSections";

export interface LearnStep {
  /** What this section is about, in a few words. */
  concept: string;
  hook: QuizQuestion;
  /** Every idea in the section, taught: Markdown, with cards and a diagram
   *  where they help (lib/openui/blocks.ts learnCardSection). */
  explanation: string;
  check: QuizQuestion;
  /** The idea the check tests, from another angle, for a student who missed
   *  it. */
  reteach: string;
  recheck: QuizQuestion;
}

/** The cards Learn may teach with, or "" when the `openUi` flag is off.
 *  Loaded on demand, like every other caller of the card library. */
async function learnCards(): Promise<string> {
  return isFlagOn("openUi") ? (await import("../lib/openui/blocks")).learnCardSection() : "";
}

/* Free text inside a JSON reply: the provider's JSON mode escapes it, so a
   card's code arrives intact inside the string. */
const formatRules = (cards: string) =>
  cards
    ? `Text fields are Markdown and may carry the cards and diagrams described below; inside the JSON string a code block's newlines and quotes are escaped like any other text.\n\n${cards}`
    : "Text fields are plain Markdown and $...$ for maths: no code blocks.";

export function buildLearnStepPrompt({
  lesson,
  section,
  otherSections,
  level,
  specLine = "",
  cards = "",
}: {
  lesson: string;
  section: LearnSection;
  otherSections: string[];
  level: string;
  specLine?: string;
  cards?: string;
}): string {
  return `Teach one section of a student's lesson, all of it. Teach it so they understand what it is, how it works and why it matters, not just so they can repeat it.

LESSON: """${fenceUntrusted(lesson)}"""
THIS SECTION: """${fenceUntrusted(section.title)}"""
THE STUDENT'S NOTES FOR THIS SECTION (teach from these; do not contradict them, and do not teach anything they do not support):
"""
${fenceUntrusted(section.body)}
"""
${otherSections.length ? `Other sections of the lesson, taught separately (do not teach them here): ${otherSections.map((t) => fenceUntrusted(t)).join("; ")}.` : ""}
${levelRules(level, specLine)}

Write:
1. "concept": what this section is about, in a few words.
2. "hook": a multiple-choice question asking the student to predict or guess something about this section BEFORE it is taught. Someone new to it should be able to reason about it, not just recall a fact.
3. "explanation": EVERY idea in these notes, taught in an order that builds: what it is, then how it works, then why it matters or where it is used. Leave nothing in the notes untaught. Plain, everyday English and short sentences, starting from what a beginner already knows; bold each key term where it is first explained; a concrete example for each idea. Length follows the notes: about 120 words for a single idea, up to about 450 words of prose for a full section. Use $...$ for any maths. It must contain everything needed to answer the check.
4. "check": a multiple-choice question on the idea in this section students most often get wrong, answerable by a student who read the explanation. Make the wrong options the mistakes students really make about it.
5. "reteach": the idea the check tests, taught a DIFFERENT way for a student who got the check wrong: an analogy, or a worked example. At most 150 words of prose. Do not repeat the explanation's wording. Do not mention that they were wrong.
6. "recheck": a NEW multiple-choice question on the same idea as the check, different from it, that the reteach prepares them for.

Each question has exactly 4 options, exactly one correct, and "correctIndex" pointing at it. Solve each question yourself before writing its key. "feedback" explains why the right answer is right without praising or assuming what the student picked. Questions, choices and feedback are plain text.

${formatRules(cards)}

Reply with ONLY raw JSON:
{
  "concept": "...",
  "hook": { "question": "...", "choices": ["...", "...", "...", "..."], "correctIndex": 0, "feedback": "..." },
  "explanation": "...",
  "check": { "question": "...", "choices": ["...", "...", "...", "..."], "correctIndex": 0, "feedback": "..." },
  "reteach": "...",
  "recheck": { "question": "...", "choices": ["...", "...", "...", "..."], "correctIndex": 0, "feedback": "..." }
}`;
}

const same = (a: QuizQuestion, b: QuizQuestion) =>
  a.question.trim().toLowerCase() === b.question.trim().toLowerCase();

export function parseLearnStep(
  text: string,
  topic: string,
  random: () => number = Math.random,
): LearnStep | null {
  const parsed = extractJSON<Record<string, unknown>>(text);
  if (!parsed) return null;
  const hook = toQuestion(parsed.hook, topic);
  const check = toQuestion(parsed.check, topic);
  const recheck = toQuestion(parsed.recheck, topic);
  const explanation = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
  const reteach = typeof parsed.reteach === "string" ? parsed.reteach.trim() : "";
  if (!hook || !check || !recheck || !explanation || !reteach) return null;
  /* A check that repeats an earlier question is a free pass: its answer is
     already on screen. */
  if (same(hook, check) || same(check, recheck) || same(hook, recheck)) return null;
  return {
    concept: typeof parsed.concept === "string" && parsed.concept.trim() ? parsed.concept.trim() : topic,
    hook: shuffled(hook, random),
    explanation,
    check: shuffled(check, random),
    reteach,
    recheck: shuffled(recheck, random),
  };
}

/** Every teaching call for one lesson shares this key, so a whole lesson
 *  counts once against the day's Learn allowance (and SESSION_CALL_CAP stops
 *  a runaway). The Plus extras each get their own key for the lesson: one
 *  more unit of the allowance each, and their own cap, so using them never
 *  stops the lesson itself partway through. */
export function learnSessionKey(materialId: string, extra?: "style" | "exam"): string {
  return `learn-${extra ? `${extra}-` : ""}${materialId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60)}`;
}

export async function generateLearnStep({
  materialId,
  lesson,
  section,
  otherSections,
}: {
  materialId: string;
  lesson: string;
  section: LearnSection;
  otherSections: string[];
}): Promise<LearnStep> {
  const { level, specLine } = await studentStandard(`${lesson} ${section.title}`).catch(() => ({
    level: "",
    specLine: "",
  }));
  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: buildLearnStepPrompt({
          lesson,
          section,
          otherSections,
          level: level || "the student's own course",
          specLine,
          cards: await learnCards(),
        }),
      },
    ],
    /* JSON container only, as the first lesson uses it. */
    mode: "solver",
    tool: "learn",
    sessionKey: learnSessionKey(materialId),
  });
  const step = parseLearnStep(text, section.title);
  if (!step) throw new Error("I couldn't write this part of the lesson just now.");
  return step;
}

/** A taught text with its cards and diagrams taken out: what a ledger entry
 *  or a follow-up prompt should quote, rather than card source. */
export function proseOnly(markdown: string): string {
  return splitOpenUiBlocks(markdown)
    .flatMap((s) => (s.kind === "text" ? [s.text.replace(/```svg[\s\S]*?(?:```|$)/gi, "")] : []))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* --- The lesson's frame ----------------------------------------------------
   What the student reads before part 1 (what the topic is, why it matters,
   what's coming and the words they'll meet) and after the last part (how
   the parts fit together). One call, billed to the lesson's own session. */

export interface LessonFrame {
  overview: string;
  recap: string;
}

/** Enough of each part for the frame to see what it covers; each part is
 *  taught from its full notes separately. */
const FRAME_BODY_CHARS = 1200;

export function buildLessonFramePrompt({
  lesson,
  sections,
  level,
  specLine = "",
  cards = "",
}: {
  lesson: string;
  sections: LearnSection[];
  level: string;
  specLine?: string;
  cards?: string;
}): string {
  const parts = sections
    .map((s, i) => `PART ${i + 1}: ${fenceUntrusted(s.title)}\n${fenceUntrusted(s.body.slice(0, FRAME_BODY_CHARS))}`)
    .join("\n\n");
  return `Frame a lesson for a student who is about to learn it, and write the summary they read when they finish. Each part is taught separately; this is the big picture around them.

LESSON: """${fenceUntrusted(lesson)}"""
THE PARTS, IN ORDER, WITH THE STUDENT'S NOTES FOR EACH (cut short where long):
"""
${parts}
"""
${levelRules(level, specLine)}

Write:
1. "overview": read before part 1. Open with what this topic is, in two or three plain sentences a beginner follows. Then why it matters: where it turns up, what it explains, why it is worth knowing. Then the parts in order as a numbered list, one line each on what the student will find out (not the answers). Then the new words they will meet, each with a plain-English meaning. At most 220 words of prose.
2. "recap": read after the last part. How the parts fit together as one picture (not the list of parts again), the few things most worth remembering, and the mistake most worth avoiding. At most 200 words of prose.
Teach only what the notes support. No greeting, no questions.

${formatRules(cards)}

Reply with ONLY raw JSON:
{"overview": "...", "recap": "..."}`;
}

/** Both halves, or nothing: an overview with no recap would leave the end
 *  of the lesson asking for a second call that may not come. */
export function parseLessonFrame(text: string): LessonFrame | null {
  const parsed = extractJSON<{ overview?: unknown; recap?: unknown }>(text);
  const overview = typeof parsed?.overview === "string" ? parsed.overview.trim() : "";
  const recap = typeof parsed?.recap === "string" ? parsed.recap.trim() : "";
  if (proseOnly(overview).length < 60 || proseOnly(recap).length < 60) return null;
  return { overview, recap };
}

export async function writeLessonFrame({
  materialId,
  lesson,
  sections,
}: {
  materialId: string;
  lesson: string;
  sections: LearnSection[];
}): Promise<LessonFrame> {
  const { level, specLine } = await studentStandard(lesson).catch(() => ({ level: "", specLine: "" }));
  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: buildLessonFramePrompt({
          lesson,
          sections,
          level: level || "the student's own course",
          specLine,
          cards: await learnCards(),
        }),
      },
    ],
    mode: "solver",
    tool: "learn",
    sessionKey: learnSessionKey(materialId),
  });
  const frame = parseLessonFrame(text);
  if (!frame) throw new Error("I couldn't write the overview just now.");
  return frame;
}

/* --- Explain it your way (Plus) -------------------------------------------
   The same idea re-taught in a style the student picks. Free text, not JSON:
   it is read, not marked. Billed to the lesson's Learn session like every
   other call here. */

export const LEARN_STYLES = ["analogy", "steps", "simpler", "example"] as const;
export type LearnStyle = (typeof LEARN_STYLES)[number];

export const LEARN_STYLE_LABELS: Record<LearnStyle, string> = {
  analogy: "An analogy",
  steps: "Step by step",
  simpler: "Simpler",
  example: "A real example",
};

const STYLE_RULES: Record<LearnStyle, string> = {
  analogy:
    "Teach it through ONE analogy from everyday life. Say where the analogy holds and, in one sentence, where it breaks down.",
  steps:
    "Teach it as a short numbered list of steps (at most 6), each one building on the last, ending with the idea itself. Use a worked example if the idea has a method.",
  simpler:
    "Teach it to someone two years younger: shorter sentences, no jargon without an immediate plain-English meaning, one tiny example.",
  example:
    "Teach it through one concrete, real-world situation where this idea is what decides what happens. Walk through the situation, then name the idea.",
};

export function buildStylePrompt({
  lesson,
  section,
  concept,
  explanation,
  style,
  level,
  cards = "",
}: {
  lesson: string;
  section: LearnSection;
  concept: string;
  explanation: string;
  style: LearnStyle;
  level: string;
  cards?: string;
}): string {
  return `Re-explain one idea from a student's lesson in a different way. The first explanation didn't fully click.

LESSON: """${fenceUntrusted(lesson)}"""
IDEA: """${fenceUntrusted(concept)}"""
THE STUDENT'S NOTES FOR THIS PART (stay consistent with these; teach nothing they do not support):
"""
${fenceUntrusted(section.body)}
"""
THE EXPLANATION THEY ALREADY READ (do not repeat its wording or its example):
"""
${fenceUntrusted(explanation)}
"""
STUDENT LEVEL: ${level}.

HOW TO TEACH IT: ${STYLE_RULES[style]}
At most 160 words of prose. Markdown (bold for the key term) and $...$ for any maths. No heading, no greeting, no question at the end, no emoji.${
    cards
      ? `\nYou may add ONE card where it suits this way of teaching (Steps or WorkedExample for steps, WorkedExample or Timeline for a real example, CompareTable for an analogy set beside the real thing). Never a card for its own sake.\n\n${cards}`
      : ""
  }`;
}

export async function explainAnotherWay({
  materialId,
  lesson,
  section,
  concept,
  explanation,
  style,
}: {
  materialId: string;
  lesson: string;
  section: LearnSection;
  concept: string;
  explanation: string;
  style: LearnStyle;
}): Promise<string> {
  const { level } = await studentStandard(`${lesson} ${section.title}`).catch(() => ({ level: "" }));
  const { text, refused } = await callEdge({
    history: [
      {
        role: "user",
        content: buildStylePrompt({
          lesson,
          section,
          concept,
          explanation: proseOnly(explanation),
          style,
          level: level || "the student's own course",
          cards: await learnCards(),
        }),
      },
    ],
    tool: "learn",
    sessionKey: learnSessionKey(materialId, "style"),
  });
  const answer = text.trim();
  if (refused || answer.length < 40) throw new Error("I couldn't explain it that way just now.");
  return answer;
}

/* --- Exam questions (Plus) -------------------------------------------------
   One exam-style question on a part the student has just learned, then
   their typed answer marked against its scheme. The marking rules are the
   photo marker's (lib/photoMarking.ts): the app numbers the points and
   counts the score, and a point counts only with the student's own words as
   evidence. A typed answer lets the app check that rule itself: evidence or
   a quoted belief that isn't in what the student wrote is thrown away. */

export interface ExamQuestion {
  question: string;
  scheme: SchemePoint[];
  total: number;
}

/** Exam questions on one idea are short: more points than this is an essay. */
const MAX_EXAM_POINTS = 6;
const MAX_EXAM_MARKS = 6;

export function buildExamQuestionPrompt({
  lesson,
  section,
  concept,
  level,
  specLine = "",
}: {
  lesson: string;
  section: LearnSection;
  concept: string;
  level: string;
  specLine?: string;
}): string {
  return `Write ONE exam question on an idea a student has just learned, with its mark scheme.

LESSON: """${fenceUntrusted(lesson)}"""
IDEA: """${fenceUntrusted(concept)}"""
THE STUDENT'S NOTES FOR THIS PART (the question must be answerable from these):
"""
${fenceUntrusted(section.body)}
"""
${levelRules(level, specLine)}

The question:
- Worth 2 to 4 marks, written the way a real paper at this level words it, with a command word (Explain, Describe, Suggest, Calculate, Compare).
- Answerable in two to five sentences (or a short working) by a student who understands this idea. Not a recall of one word.
- Do not write the marks into the question; the app adds them.

The mark scheme:
- One point per mark a marker would credit, worded as a marker's scheme is ("water moves by osmosis", "from dilute to concentrated solution").
- Usually 1 mark each. Only the points this question asks for.

Reply with ONLY raw JSON:
{"question": "...", "scheme": [{"point": "...", "marks": 1}]}`;
}

export function parseExamQuestion(text: string): ExamQuestion | null {
  const parsed = extractJSON<{ question?: unknown; scheme?: unknown }>(text);
  if (!parsed) return null;
  const question =
    typeof parsed.question === "string"
      ? parsed.question.trim().replace(/\s*[([]\s*\d{1,2}\s*marks?\s*[)\]]\s*$/i, "")
      : "";
  const scheme: SchemePoint[] = (Array.isArray(parsed.scheme) ? parsed.scheme : [])
    .map((p) => {
      const r = (p ?? {}) as { point?: unknown; marks?: unknown };
      const marks = Number(r.marks ?? 1);
      return {
        text: typeof r.point === "string" ? r.point.trim() : "",
        marks: Number.isInteger(marks) && marks >= 1 && marks <= 3 ? marks : 1,
      };
    })
    .filter((p) => p.text.length >= 4)
    .slice(0, MAX_EXAM_POINTS);
  const total = scheme.reduce((n, p) => n + p.marks, 0);
  if (question.length < 12 || scheme.length === 0 || total > MAX_EXAM_MARKS) return null;
  return { question, scheme, total };
}

export async function writeExamQuestion({
  materialId,
  lesson,
  section,
  concept,
}: {
  materialId: string;
  lesson: string;
  section: LearnSection;
  concept: string;
}): Promise<ExamQuestion> {
  const { level, specLine } = await studentStandard(`${lesson} ${section.title}`).catch(() => ({
    level: "",
    specLine: "",
  }));
  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: buildExamQuestionPrompt({ lesson, section, concept, level: level || "the student's own course", specLine }),
      },
    ],
    mode: "solver",
    tool: "learn",
    sessionKey: learnSessionKey(materialId, "exam"),
  });
  const exam = parseExamQuestion(text);
  if (!exam) throw new Error("I couldn't write an exam question for this part just now.");
  return exam;
}

export function buildTypedMarkingPrompt(exam: ExamQuestion, answer: string, subject: string, level: string): string {
  return `You are an exam marker. Mark the student's typed answer against the mark scheme.

SUBJECT: ${fenceUntrusted(subject)}
QUESTION: """${fenceUntrusted(exam.question)}""" [${exam.total} mark${exam.total === 1 ? "" : "s"}]
MARK SCHEME (each point numbered by the app):
${exam.scheme.map((p, i) => `  [${i}] """${fenceUntrusted(p.text)}""" (${p.marks} mark${p.marks === 1 ? "" : "s"})`).join("\n")}
THE STUDENT'S ANSWER:
"""
${fenceUntrusted(answer)}
"""
${levelRules(level)}

HOW TO MARK:
- Mark every numbered point, by its number, against what is actually written. Award a point only if the answer says it, or says something a marker following this scheme would accept as the same. Do not award for things implied or that you would have liked to see.
- For an awarded point, copy into "evidence" the exact words from the answer that earn it, character for character. If you can't point to the words, don't award it.
- For a missed point, say in "note", in under 12 words, what was missing. Do not write the answer out for them.
- Do not add up marks. Do not invent points that are not in the scheme.
- "beliefs": only where the student's own words state something wrong (not where they left something out), give the concept, the wrong idea in a short sentence, and the exact words that state it. Usually there are none; then give an empty list.

Reply with ONLY raw JSON:
{"legible": true, "unreadable": "", "points": [{"index": 0, "awarded": true, "evidence": "exact words", "note": ""}], "beliefs": [{"concept": "short name", "belief": "the wrong idea", "quote": "exact words"}]}`;
}

const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Evidence the model "quoted" that isn't in the answer earns nothing, and
 *  a belief it "quoted" that the student never wrote is dropped. */
export function holdToAnswer(marking: Marking, answer: string): Marking {
  if (marking.kind !== "marked") return marking;
  const said = ` ${plain(answer)} `;
  const inAnswer = (quote: string) => {
    const q = plain(quote);
    return q.length >= 3 && said.includes(` ${q} `);
  };
  const points = marking.points.map((p) =>
    p.verdict === "awarded" && !inAnswer(p.evidence)
      ? { ...p, verdict: "missed" as const, evidence: "", note: "Nothing in your answer earns this one." }
      : p,
  );
  return {
    ...marking,
    points,
    awarded: points.filter((p) => p.verdict === "awarded").reduce((n, p) => n + p.point.marks, 0),
    beliefs: marking.beliefs.filter((b) => inAnswer(b.quote)),
  };
}

export async function markTypedAnswer({
  materialId,
  lesson,
  exam,
  answer,
  subject,
}: {
  materialId: string;
  lesson: string;
  exam: ExamQuestion;
  answer: string;
  subject: string;
}): Promise<Marking> {
  const { level } = await studentStandard(`${subject} ${lesson}`).catch(() => ({ level: "" }));
  const { text } = await callEdge({
    history: [{ role: "user", content: buildTypedMarkingPrompt(exam, answer, subject, level || "the student's own course") }],
    mode: "solver",
    tool: "learn",
    sessionKey: learnSessionKey(materialId, "exam"),
  });
  const marking = readMarking(extractJSON<RawMarking>(text), exam.scheme);
  if (!marking || marking.kind !== "marked") {
    throw new AiError("The marker answered, but not in a way I could read.", { retryable: true });
  }
  return holdToAnswer(marking, answer);
}
