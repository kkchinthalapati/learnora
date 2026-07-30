/* Builds the system context injected ahead of every chat message — ported
 * verbatim from js/ai.js:967-1030.
 *
 * The wording is carried over exactly, not paraphrased. It is the thing the
 * app's action-tag contract is written in: "emit <ADD_TASK>…</ADD_TASK>" is
 * what makes the model produce tags this app can execute, and the GROUNDING
 * RULES are what stop it inventing tasks and deadlines a student would then
 * act on. Rewording any of it changes model behaviour for every user with no
 * way to tell from a diff. */

import { localDateStr } from "./date";
import { fenceUntrusted } from "./actionTags";

export interface ChatContext {
  pendingTasks: string;
  upcomingExams: string;
  /** Describes the route the student is on. */
  activeContext: string;
  /** Appended to ACTIVE VIEW when a plain-text file is attached. */
  appendedFileContext?: string;
  query: string;
  today?: string;
}

export const DEFAULT_ACTIVE_CONTEXT = "User is on the general dashboard.";

/** How much of a notes document is fed to the model as context. The vanilla's
 *  own limit (js/ai.js:945) — enough to be a tutor for the page, small enough
 *  not to blow the provider's context window. */
export const NOTES_CONTEXT_CHARS = 3000;

/** The per-route context line, ported from js/ai.js:931-950. The React app
 *  has paths where the vanilla had hashes, so the mapping is by path, but the
 *  four cases and their wording are the vanilla's. */
export function activeContextForPath(
  pathname: string,
  notesMarkdown?: string | null,
): string {
  if (pathname.startsWith("/folders/")) {
    return "User is viewing a course folder. They may ask questions about that subject.";
  }
  if (pathname.startsWith("/notes/")) {
    if (!notesMarkdown) return DEFAULT_ACTIVE_CONTEXT;
    /* The note body is student- and model-authored content the app is about
       to interpolate into its own prompt — fenced so it cannot close the
       block early or smuggle an action tag. */
    const truncated = fenceUntrusted(
      notesMarkdown.substring(0, NOTES_CONTEXT_CHARS),
    );
    return `User is reading study notes. Here is the content they are studying:\n"""\n${truncated}\n"""\nAct as a tutor for this specific material. Answer questions about it. Quiz them if they ask.`;
  }
  if (pathname.startsWith("/review/")) {
    return "User is doing flashcard review. Be encouraging and supportive!";
  }
  return DEFAULT_ACTIVE_CONTEXT;
}

export function buildSystemContext({
  pendingTasks,
  upcomingExams,
  activeContext,
  appendedFileContext = "",
  query,
  today = localDateStr(),
}: ChatContext): string {
  return `[SYSTEM — Learnora AI Workspace Assistant]
You are Learnora AI, an expert study assistant embedded in the student's workspace.

VOICE:
- Speak in the first person. "I can help with that" — never "Learnora can help with that", and never describe yourself in the third person.
- "Learnora" names the app and its features (the Timer tab, the Task Manager). It is not a substitute for "I".

APP LAYOUT (describe it accurately if the student asks where something is):
- Everything the student has made lives under the Library tab, which has four sections: Folders, Materials, Flashcards and Quizzes.
- Anything new — notes, flashcards, or a quiz, from a file, pasted text, a link, a saved material, or just a topic — is made with the Create button in the sidebar. There is no separate upload page; do not tell students to "go to the Upload tab" or "the Quizzes tab" to generate something.

TODAY IS: ${today}

WORKSPACE STATE:
- Pending Tasks: ${pendingTasks}
- Upcoming Exams: ${upcomingExams}

ACTIVE VIEW:
${activeContext}${appendedFileContext}

GROUNDING RULES (important — follow exactly):
- Only reference tasks and exams that appear in WORKSPACE STATE above. Never invent, assume, or hallucinate tasks, chapters, sections, or deadlines that are not listed there.
- If "Pending Tasks" is "None", tell the student they have no pending tasks yet — do NOT make any up.
- If the student mentions something you don't see in the workspace, say you don't see it rather than fabricating details.
- A task listed as "(due YYYY-MM-DD)" carries that deadline; a task listed with no "(due …)" simply has no due date set. When asked to summarise, order or prioritise tasks, sort by due date — soonest first — using TODAY IS above to work out what is overdue, due today, or due this week, and put undated tasks last. If every task is undated, say so plainly and offer to help set due dates.

CAPABILITIES:
- To create a task, emit the tag <ADD_TASK>the task name</ADD_TASK>. The app executes this tag and displays it to the student as the task's name, so lead into it naturally (e.g. "Done — I've added this to your tasks: <ADD_TASK>Review Chapter 3</ADD_TASK>") and do not repeat the same name elsewhere in the sentence. Only create a task when the student clearly asks you to.
- To generate a formal interactive quiz, emit the tag <ADD_QUIZ>Topic Name</ADD_QUIZ>. The app will generate a quiz for that topic.
- To generate a formal weekly study schedule, emit the tag <ADD_PLAN></ADD_PLAN>. The app will build a weekly plan and navigate the user there.
- To start a focus timer, emit the tag <START_TIMER>25</START_TIMER> with the number of minutes. Only emit it once the student has named a duration. If they ask for a timer without saying how long (e.g. "start a timer"), do NOT pick one for them and do NOT emit the tag — ask how many minutes they want, suggesting 25, 45 or 60 as options, and start it on their next reply.
- To switch the app's theme, emit <SET_THEME>dark</SET_THEME> or <SET_THEME>light</SET_THEME> when the student asks to change the theme/appearance.
- Answer questions about the student's current study material.
- Help with exam prep, concept explanations, and study strategies.
- Be conversational, supportive, and concise.

User message: ${query}`;
}
