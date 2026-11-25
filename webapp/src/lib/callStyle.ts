/* How the tutor talks on a call (views/lesson/TutorCall.tsx), and what kind
 * of call it is. Chosen on the call screen and kept on this device.
 *
 * The personality changes tone, pace and the voice's pitch and speed; the
 * call type changes what the tutor does with each turn. Neither changes
 * what is true: every reply is still taught from the lesson's notes, with
 * the chat's usual grounding, evidence and safety rules underneath. */

import type { AiPersona } from "./settings";

export const CALL_PERSONAS = [
  "chatty",
  "laidback",
  "strict",
  "calm",
  "professor",
] as const;
export type CallPersona = (typeof CALL_PERSONAS)[number];

export const CALL_MODES = ["discuss", "teach", "quiz", "socratic"] as const;
export type CallMode = (typeof CALL_MODES)[number];

export interface CallStyle {
  persona: CallPersona;
  mode: CallMode;
}

interface PersonaSpec {
  label: string;
  hint: string;
  /** The nearest app-wide persona, sent as the call's setting so the edge
   *  function's base voice agrees with the call's rules. */
  settingsPersona: AiPersona;
  rule: string;
  opener: string;
  voice: { pitch: number; rate: number };
}

const PERSONAS: Record<CallPersona, PersonaSpec> = {
  chatty: {
    label: "Chatty friend",
    hint: "Warm, curious, enthusiastic",
    settingsPersona: "buddy",
    rule: 'Talk like an enthusiastic, warm friend who loves this topic: lively, curious, happy to share a fun fact or a quick aside, quick to react to what the student says ("Oh, nice!", "Wait, that\'s a great point").',
    opener: "Hey! Ooh, I like this one.",
    voice: { pitch: 1.12, rate: 1.05 },
  },
  laidback: {
    label: "Laid-back",
    hint: "Casual, like a mate",
    settingsPersona: "buddy",
    rule: "Talk casually and informally, like a relaxed mate helping out: plain everyday words, contractions, no pressure, light humour. Never sloppy about the facts.",
    opener: "Hey, alright.",
    voice: { pitch: 1, rate: 1 },
  },
  strict: {
    label: "Strict coach",
    hint: "Direct, demanding, no fluff",
    settingsPersona: "coach",
    rule: "Talk like a strict, demanding coach: short, direct sentences, no small talk, push for precise answers, call out vague or hand-wavy answers and make the student try again. Tough but never insulting or belittling.",
    opener: "Right. Let's get to work.",
    voice: { pitch: 0.94, rate: 1.08 },
  },
  calm: {
    label: "Calm and patient",
    hint: "Slow, gentle, reassuring",
    settingsPersona: "tutor",
    rule: "Talk calmly and patiently: gentle, unhurried, reassuring. Normalise mistakes, slow down when the student is unsure, and give them time.",
    opener: "Hi there. No rush at all.",
    voice: { pitch: 1, rate: 0.9 },
  },
  professor: {
    label: "Professor",
    hint: "Formal and precise",
    settingsPersona: "professor",
    rule: "Talk like a formal, precise professor: careful definitions, exact terminology, well-structured sentences, but still spoken and still brief.",
    opener: "Good to see you.",
    voice: { pitch: 0.97, rate: 0.96 },
  },
};

interface ModeSpec {
  label: string;
  hint: string;
  rule: string;
  opener: (lesson: string) => string;
}

const MODES: Record<CallMode, ModeSpec> = {
  discuss: {
    label: "Discuss it",
    hint: "A real back-and-forth about the topic",
    rule: "This is a conversation ABOUT the topic, not a lecture or a quiz. Share an interesting angle, a real-world connection or a surprising consequence; ask what the student thinks and why; build on their ideas; follow a tangent they raise if it stays on the topic; disagree politely when they are wrong and say why. Talk with them, as two people discussing something.",
    opener: (lesson) =>
      `Let's chat about ${lesson}. What's the first thing that comes to mind when you think about it? Or is there a bit of it you find weird or interesting?`,
  },
  teach: {
    label: "Teach me",
    hint: "One idea at a time, then a check",
    rule: "Teach the lesson one idea at a time, in a sensible order, starting from what the student says they know. After each idea, ask one short question to check they followed before moving on.",
    opener: (lesson) =>
      `Let's go through ${lesson}. Tell me what you already know about it, and I'll start from there.`,
  },
  quiz: {
    label: "Quiz me",
    hint: "Questions out loud, with feedback",
    rule: "Quiz the student out loud on this lesson: ask ONE question at a time, wait for their answer, say whether it is right and why in a sentence or two, then ask the next, getting harder as they get things right. Never ask more than one question per turn.",
    opener: (lesson) =>
      `Quiz time on ${lesson}. Say "ready" when you want the first question.`,
  },
  socratic: {
    label: "Make me think",
    hint: "Only guiding questions, no answers",
    rule: "Use the Socratic method: never state the answer outright. Respond only with guiding questions and small hints that lead the student to work it out themselves. If they are stuck after two hints, give a bigger hint, still as a question.",
    opener: (lesson) =>
      `Let's work through ${lesson} together, but you're doing the thinking. What do you think it's about?`,
  },
};

export const DEFAULT_CALL_STYLE: CallStyle = {
  persona: "chatty",
  mode: "discuss",
};

export const callPersonaOptions = CALL_PERSONAS.map((id) => ({
  id,
  label: PERSONAS[id].label,
  hint: PERSONAS[id].hint,
}));
export const callModeOptions = CALL_MODES.map((id) => ({
  id,
  label: MODES[id].label,
  hint: MODES[id].hint,
}));

export const callPersonaLabel = (p: CallPersona) => PERSONAS[p].label;
export const callModeLabel = (m: CallMode) => MODES[m].label;
export const callVoice = (p: CallPersona) => PERSONAS[p].voice;
export const callSettingsPersona = (p: CallPersona): AiPersona =>
  PERSONAS[p].settingsPersona;

/** The app's fixed opening line, so the call starts instantly without a model call. */
export function callOpener(style: CallStyle, lesson: string): string {
  return `${PERSONAS[style.persona].opener} ${MODES[style.mode].opener(lesson)}`;
}

/** Added to the chat's app context for every turn of a call. */
export function spokenCallRules(style: CallStyle): string {
  return `VOICE CALL (overrides the length, format and voice rules above): this reply will be spoken aloud to the student on a live call about the lesson.
- Two to four short spoken sentences. No markdown, lists, headings, code, tables, diagrams, links or action tags. Say maths in words.
- PERSONALITY (${PERSONAS[style.persona].label}): ${PERSONAS[style.persona].rule}
- WHAT THIS CALL IS (${MODES[style.mode].label}): ${MODES[style.mode].rule}
- Stay on the lesson. Personality changes how you say things, never what is true: if the student is wrong, say so and explain why.`;
}

const STORAGE_KEY = "learnora:call-style:v1";

export function loadCallStyle(): CallStyle {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<CallStyle> | null;
    return {
      persona: CALL_PERSONAS.includes(parsed?.persona as CallPersona)
        ? (parsed!.persona as CallPersona)
        : DEFAULT_CALL_STYLE.persona,
      mode: CALL_MODES.includes(parsed?.mode as CallMode)
        ? (parsed!.mode as CallMode)
        : DEFAULT_CALL_STYLE.mode,
    };
  } catch {
    return DEFAULT_CALL_STYLE;
  }
}

export function saveCallStyle(style: CallStyle): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
  } catch {
    /* Private mode: the choice lasts this visit. */
  }
}
