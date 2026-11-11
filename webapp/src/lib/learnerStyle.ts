/* How a student learns best, and what that changes in what Learnora writes.
 *
 * One answer, asked once (before the first lesson is written, or from a
 * lesson's start screen), saved on the study profile's `learningStyle` so
 * every device sees it. Notes, Learn's teaching, the podcast script and the
 * tutor call all read the same rule from here, so "visual" means the same
 * thing everywhere.
 *
 * The study profile wizard asked the same question with free labels
 * ("Diagrams", "Worked examples"…) before this file existed; those stored
 * labels are read as the matching id so nobody has to answer twice. */

export const LEARNER_STYLES = [
  "visual",
  "application",
  "examples",
  "practice",
  "talk",
] as const;
export type LearnerStyle = (typeof LEARNER_STYLES)[number];

export interface LearnerStyleOption {
  id: LearnerStyle;
  label: string;
  /** One line a student can recognise themselves in. */
  description: string;
  icon: "image" | "target" | "list-checks" | "check-square" | "mic";
}

export const LEARNER_STYLE_OPTIONS: ReadonlyArray<LearnerStyleOption> = [
  {
    id: "visual",
    label: "Pictures and diagrams",
    description: "I get it when I can see it: drawings, flows, tables.",
    icon: "image",
  },
  {
    id: "application",
    label: "Real-world use",
    description: "Show me where it's used and why it matters first.",
    icon: "target",
  },
  {
    id: "examples",
    label: "Worked examples",
    description: "Walk me through one, step by step, then explain.",
    icon: "list-checks",
  },
  {
    id: "practice",
    label: "Practice first",
    description: "Let me try a question, then fill in the gaps.",
    icon: "check-square",
  },
  {
    id: "talk",
    label: "Talking it through",
    description: "Explain it like a conversation. I like to listen.",
    icon: "mic",
  },
];

const BY_ID = new Map(LEARNER_STYLE_OPTIONS.map((o) => [o.id, o]));

/** The wizard's older labels, as stored before the ids existed. */
const LEGACY_LABELS: Record<string, LearnerStyle> = {
  diagrams: "visual",
  "worked examples": "examples",
  "talking it through": "talk",
  "practice first": "practice",
};

/** A stored value (an id, or a legacy wizard label) as an id; null for
 *  anything unknown, including nothing saved. */
export function parseLearnerStyle(
  raw: string | null | undefined,
): LearnerStyle | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if ((LEARNER_STYLES as readonly string[]).includes(key))
    return key as LearnerStyle;
  return LEGACY_LABELS[key] ?? null;
}

export function learnerStyleOption(style: LearnerStyle): LearnerStyleOption {
  return BY_ID.get(style)!;
}

/* What each style changes. Written as instructions about structure and
   emphasis, never about accuracy: a style may reorder and reframe the
   material, it must not add facts the source doesn't support. */
const RULES: Record<LearnerStyle, string> = {
  visual:
    "Lean on visuals: where a process, comparison or structure is involved, show it as a diagram, a table or a labelled sequence, and describe what to look at. Prefer one clear picture over a paragraph that says the same thing.",
  application:
    "Lead with application: open each idea with where it is used in the real world or why it matters, then explain how it works. Tie every idea back to a concrete use.",
  examples:
    "Lead with worked examples: for each idea, work one concrete example step by step first, then state the general rule it shows.",
  practice:
    "Lead with practice: pose a short question or prediction before each idea, then explain it in a way that answers that question. Keep explanations tight.",
  talk: "Write conversationally, as if explaining out loud to the student: short sentences, natural transitions, questions the student might ask answered in turn. Avoid dense lists.",
};

/** The line a prompt adds for this style, or "" when none is chosen. */
export function learnerStyleRule(style: LearnerStyle | null): string {
  if (!style) return "";
  return `HOW THIS STUDENT LEARNS BEST (${learnerStyleOption(style).label}): ${RULES[style]} This changes how things are presented, never what is true: teach only what the material supports.`;
}
