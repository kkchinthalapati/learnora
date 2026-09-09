/* Socratic Audio Sparring API
 *
 * Grounded AI sparring partner engine featuring two opposing personas:
 * - Alex 🌱: Curious beginner who probes foundational concepts and asks "why?"
 * - Jordan ⚡: Sharp, overconfident peer who challenges edge cases and subtleties.
 *
 * Calls `callEdge` with structured JSON output and falls back to a realistic
 * offline Socratic engine when offline or network fails.
 */

import { callEdge } from "./ai";
import { extractJSON } from "../lib/aiJson";
import type { GroundedCitation } from "../types/notebooks";

export type { GroundedCitation };

export type SparringPersona = "alex" | "jordan";

export interface SparringPersonaProfile {
  id: SparringPersona;
  name: string;
  avatar: string;
  title: string;
  description: string;
  voicePitch: number;
  voiceRate: number;
}

export const SPARRING_PERSONAS: Record<
  SparringPersona,
  SparringPersonaProfile
> = {
  alex: {
    id: "alex",
    name: "Alex",
    avatar: "🌱",
    title: "Curious Beginner",
    description:
      "Asks 'but why?' and tests whether you truly understand the foundational intuition.",
    voicePitch: 1.15,
    voiceRate: 1.0,
  },
  jordan: {
    id: "jordan",
    name: "Jordan",
    avatar: "⚡",
    title: "Sharp Peer",
    description:
      "Throws counter-examples and tricky edge cases to test your argument rigour.",
    voicePitch: 0.92,
    voiceRate: 1.08,
  },
};

export interface VivaRolePreset {
  id: string;
  title: string;
  icon: string;
  description: string;
  promptInstruction: string;
  defaultSpeaker: SparringPersona;
}

export const VIVA_ROLES: VivaRolePreset[] = [
  {
    id: "examiner",
    title: "Tough CBSE Board Examiner",
    icon: "📋",
    description:
      "Strict & formal. Demands exact NCERT terms, formulas, and rigorous step-by-step logic.",
    promptInstruction:
      "Act as a tough CBSE Board viva examiner. Demand exact terminology, definitions, formulas, and precise scientific boundaries. Do not accept hand-waving or casual approximations.",
    defaultSpeaker: "jordan",
  },
  {
    id: "buddy",
    title: "Chill Study Buddy",
    icon: "☕",
    description:
      "Relaxed & supportive. Explains with intuitive real-world analogies and friendly banter.",
    promptInstruction:
      "Act as a relaxed, friendly peer study buddy. Use simple analogies, encouraging words, and conversational casual English to help test understanding without intimidation.",
    defaultSpeaker: "alex",
  },
  {
    id: "socratic",
    title: "Socratic Challenger",
    icon: "🏛️",
    description:
      "Questions every premise. Probes deeper into first principles and foundational causes.",
    promptInstruction:
      "Act as a deep Socratic challenger. Question basic assumptions, ask 'why does that hold?', and push the student to derive truths from first principles.",
    defaultSpeaker: "jordan",
  },
  {
    id: "quizzer",
    title: "Rapid-Fire Viva Quizzer",
    icon: "⚡",
    description:
      "Punchy, fast-paced questions testing instant recall, unit formulas, and speed.",
    promptInstruction:
      "Act as a rapid-fire viva quizzer. Ask concise, rapid-fire questions testing immediate recall, key formulas, units, and quick deductions.",
    defaultSpeaker: "alex",
  },
];

export interface VivaFocusGoalPreset {
  id: string;
  title: string;
  icon: string;
  description: string;
}

export const VIVA_FOCUS_GOALS: VivaFocusGoalPreset[] = [
  {
    id: "intuition",
    title: "Check my conceptual intuition",
    icon: "💡",
    description: "Core mechanisms, 'why' it works, and real-world analogies",
  },
  {
    id: "derivations",
    title: "Test my derivations & formulas",
    icon: "📐",
    description: "Mathematical proofs, equations, conditions, and variables",
  },
  {
    id: "edge-cases",
    title: "Grill me on edge cases & exceptions",
    icon: "🔍",
    description: "Boundary conditions, counter-examples, and tricky scenarios",
  },
  {
    id: "comprehensive",
    title: "Comprehensive viva practice",
    icon: "🎯",
    description:
      "Balanced mix of fundamentals, formulas, and critical thinking",
  },
];

export interface StudentFeedback {
  clarityScore: number; // 0 - 100
  rigourScore: number; // 0 - 100
  accuracyScore: number; // 0 - 100
  overallScore: number; // 0 - 100
  reactionTone: "enthusiastic" | "intrigued" | "challenging" | "skeptical";
  shortCritique: string;
  keyConceptsMastered: string[];
  missingPoints: string[];
}

export interface SparringRound {
  id: string;
  roundNumber: number;
  speaker: SparringPersona;
  personaName: string;
  personaAvatar: string;
  speechText: string;
  conceptAnchor: string;
  citations?: GroundedCitation[];
  suggestedHints?: string[];
}

export interface SparringDialogueEntry {
  id: string;
  speaker: SparringPersona | "student";
  name: string;
  avatar: string;
  content: string;
  timestamp: string;
  citations?: GroundedCitation[];
  feedback?: StudentFeedback;
}

export interface SparringSession {
  id: string;
  topic: string;
  notebookId?: string;
  notesContext?: string;
  vibe?: string;
  focusGoal?: string;
  /** The student's measured quiz performance, pre-rendered by
   *  `lib/studentEvidence.ts`. Carried on the session so every round after the
   *  first is aimed with the same evidence the opening was, without the view
   *  having to pass it again. */
  performanceEvidence?: string;
  status: "active" | "completed";
  currentRound: number;
  dialogue: SparringDialogueEntry[];
  currentChallenge: SparringRound;
  cumulativeScores: {
    clarity: number;
    rigour: number;
    accuracy: number;
    roundsCount: number;
  };
  createdAt: string;
}

export interface SparringContext {
  notesContext?: string;
  notebookId?: string;
  performanceEvidence?: string;
  session?: SparringSession;
}

// In-memory active session cache
const activeSessions = new Map<string, SparringSession>();

export function getSparringSession(
  sessionId: string,
): SparringSession | undefined {
  return activeSessions.get(sessionId);
}

export function saveSparringSession(session: SparringSession): void {
  activeSessions.set(session.id, session);
}

function extractCitationsFromNotes(
  notes: string | undefined,
  topic: string,
): GroundedCitation[] {
  if (!notes || !notes.trim()) return [];
  const lines = notes
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 15 && !l.startsWith("#"));

  if (lines.length === 0) {
    return [
      {
        sourceId: "src-1",
        sourceTitle: `Study Notes: ${topic}`,
        snippet: notes.slice(0, 140).trim(),
      },
    ];
  }

  return lines.slice(0, 2).map((snippet, idx) => ({
    sourceId: `note-cit-${idx + 1}`,
    sourceTitle: `Notebook Notes: ${topic}`,
    snippet,
  }));
}

function generateOfflineOpening(
  topic: string,
  notesContext?: string,
  vibe?: string,
  focusGoal?: string,
): SparringRound {
  const t = topic.toLowerCase();
  const v = (vibe || "").toLowerCase();
  const isExaminer = v.includes("examiner");
  const isQuizzer = v.includes("quizzer") || v.includes("rapid");
  const isChill = v.includes("chill") || v.includes("study buddy");
  let speaker: SparringPersona =
    isExaminer || v.includes("socratic") ? "jordan" : "alex";
  let speechText = "";
  let conceptAnchor = "";
  let suggestedHints = [
    "Explain the core mechanism in plain English",
    "Give an everyday real-world example",
    "Highlight the difference between cause and effect",
  ];

  if (focusGoal) {
    suggestedHints.unshift(`Align with goal: ${focusGoal}`);
  }

  if (
    t.includes("newton") ||
    t.includes("motion") ||
    t.includes("momentum") ||
    t.includes("physics")
  ) {
    conceptAnchor = "Action-Reaction & System Boundaries";
    speechText =
      "I've been thinking about this: if Newton's Third Law says every action has an equal and opposite reaction, why doesn't every single force just cancel out? How does anything ever accelerate?";
    suggestedHints = [
      "Forces act on different bodies, not the same one",
      "Draw a free-body diagram for a single object",
      "Think about pushing against the ground to walk",
    ];
  } else if (
    t.includes("photo") ||
    t.includes("respir") ||
    t.includes("cell") ||
    t.includes("bio")
  ) {
    conceptAnchor = "Cellular Bioenergetics";
    speechText =
      "Everyone says plants produce oxygen for animals through photosynthesis, but aren't plants running aerobic cellular respiration 24/7 anyway? Doesn't that make their net oxygen contribution basically wash out?";
    suggestedHints = [
      "Rate of photosynthesis in sunlight far exceeds respiration",
      "Chloroplast light reactions vs mitochondria",
      "Carbon fixation stores net biomass",
    ];
  } else if (
    t.includes("econ") ||
    t.includes("market") ||
    t.includes("inflation") ||
    t.includes("money")
  ) {
    conceptAnchor = "Monetary & Supply Dynamics";
    speechText =
      "If lowering interest rates encourages investment and creates jobs, why wouldn't central banks simply keep rates near zero permanently? What is the breaking point?";
    suggestedHints = [
      "Demand-pull inflation and purchasing power erosion",
      "Asset price bubbles and misallocation of capital",
      "Central bank credibility and expectations",
    ];
  } else if (v.includes("examiner")) {
    speaker = "jordan";
    conceptAnchor = `Formal Examination: ${topic}`;
    speechText = `Let us begin your oral viva on ${topic}. State the fundamental definitions, the key governing principles, and any core mathematical or physical conditions that apply.`;
  } else if (v.includes("quizzer")) {
    speaker = "alex";
    conceptAnchor = `Rapid-Fire Viva: ${topic}`;
    speechText = `Rapid-fire question 1 on ${topic}! What is the primary concept or formula at play here, and what is the single most common mistake students make with it?`;
  } else {
    speaker = "alex";
    conceptAnchor = `Core Foundations of ${topic}`;
    speechText = `I'm trying to wrap my head around ${topic}. If you had to explain the single most crucial mechanism behind it without using any technical jargon, how would you convince me it actually works?`;
  }

  // Keep the subject-specific challenge, but deliver it in the selected role
  // instead of silently reverting to the old fixed persona when offline.
  if (isExaminer) {
    speechText = `Formal viva question: ${speechText} Define your terms precisely and justify each step.`;
  } else if (isQuizzer) {
    speaker = "alex";
    speechText = `Rapid-fire question 1! ${speechText} Keep your answer concise.`;
  } else if (isChill) {
    speaker = "alex";
    speechText = `Let's work through this together. ${speechText}`;
  }

  const citations = extractCitationsFromNotes(notesContext, topic);

  return {
    id: `round-open-${Date.now()}`,
    roundNumber: 1,
    speaker,
    personaName: SPARRING_PERSONAS[speaker].name,
    personaAvatar: SPARRING_PERSONAS[speaker].avatar,
    speechText,
    conceptAnchor,
    citations,
    suggestedHints,
  };
}

function evaluateStudentSpeechLocally(
  topic: string,
  speech: string,
  round: SparringRound,
  notesContext?: string,
): { feedback: StudentFeedback; nextRound: SparringRound } {
  const wordCount = speech.trim().split(/\s+/).length;
  const lower = speech.toLowerCase();

  // Keyword check
  const reasoningTerms = [
    "because",
    "therefore",
    "since",
    "so",
    "means",
    "causes",
    "acts on",
    "different",
  ];
  const matches = reasoningTerms.filter((term) => lower.includes(term));

  let clarityScore = 65;
  let rigourScore = 60;
  let accuracyScore = 70;

  if (wordCount >= 10) clarityScore += 10;
  if (wordCount >= 25) clarityScore += 15;
  if (matches.length >= 1) rigourScore += 15;
  if (matches.length >= 2) rigourScore += 15;

  clarityScore = Math.min(98, clarityScore);
  rigourScore = Math.min(95, rigourScore);
  accuracyScore = Math.min(96, Math.round((clarityScore + rigourScore) / 2));
  const overallScore = Math.round(
    clarityScore * 0.4 + rigourScore * 0.4 + accuracyScore * 0.2,
  );

  let reactionTone: StudentFeedback["reactionTone"] = "intrigued";
  let shortCritique = "";
  const keyConceptsMastered: string[] = [];
  const missingPoints: string[] = [];

  if (overallScore >= 80) {
    reactionTone = "enthusiastic";
    shortCritique = `Excellent intuition! You clearly distinguished the core conditions and justified your reasoning directly.`;
    keyConceptsMastered.push(
      "Core conceptual causality",
      "Boundary conditions identification",
    );
  } else if (overallScore >= 65) {
    reactionTone = "challenging";
    shortCritique = `Good direction, but your argument glosses over the exact mechanism that prevents ambiguity.`;
    keyConceptsMastered.push("General conceptual foundation");
    missingPoints.push(
      "Formal specification of interacting entities",
      "Rigorous step-by-step causality",
    );
  } else {
    reactionTone = "skeptical";
    shortCritique = `A bit brief or ambiguous. Try unpacking why this occurs rather than just stating that it does.`;
    missingPoints.push("Explicit definitions", "Concrete reasoning chain");
  }

  // Next speaker alternates
  const nextSpeaker: SparringPersona =
    round.speaker === "alex" ? "jordan" : "alex";
  const nextRoundNumber = round.roundNumber + 1;

  let nextSpeech = "";
  let nextAnchor = "";

  if (nextSpeaker === "jordan") {
    nextAnchor = `Counter-Challenge & Edge Cases`;
    nextSpeech = `Right, but hold on. That sounds fine on paper, but what happens if the external boundary changes? Does your reasoning still hold if we push this to the extreme?`;
  } else {
    nextAnchor = `Synthesising Intuition`;
    nextSpeech = `Oh, that makes sense now! But to be completely sure I get it: how would you test this in the real world to prove you're right?`;
  }

  const citations = extractCitationsFromNotes(notesContext, topic);

  const feedback: StudentFeedback = {
    clarityScore,
    rigourScore,
    accuracyScore,
    overallScore,
    reactionTone,
    shortCritique,
    keyConceptsMastered,
    missingPoints,
  };

  const nextRound: SparringRound = {
    id: `round-${nextRoundNumber}-${Date.now()}`,
    roundNumber: nextRoundNumber,
    speaker: nextSpeaker,
    personaName: SPARRING_PERSONAS[nextSpeaker].name,
    personaAvatar: SPARRING_PERSONAS[nextSpeaker].avatar,
    speechText: nextSpeech,
    conceptAnchor: nextAnchor,
    citations,
    suggestedHints: [
      "Address the edge case directly",
      "Use an intuitive analogy to solidify your claim",
    ],
  };

  return { feedback, nextRound };
}

/**
 * Starts a new Socratic Audio Sparring session.
 */
export async function startSparringSession(
  topic: string,
  notesContext?: string,
  notebookId?: string,
  performanceEvidence?: string,
  misconceptionLedger?: string,
  options?: {
    vibe?: string;
    focusGoal?: string;
  },
): Promise<SparringSession> {
  const sessionId = `sparring-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cleanTopic = topic.trim() || "General Study Topic";
  const vibe = options?.vibe?.trim();
  const focusGoal = options?.focusGoal?.trim();

  let initialRound: SparringRound;

  try {
    const prompt = `You are designing a Voice Viva / Socratic Audio Sparring opening round for a student on "${cleanTopic}".
You have two personas:
- Alex (🌱): Curious beginner, asks "why?", intuitive explanations.
- Jordan (⚡): Overconfident peer, sharp, challenges assumptions, tests edge cases.
${vibe ? `\nROLE / VIBE INSTRUCTION:\nAct in character: "${vibe}". Tailor speech style, questioning sharpness, and attitude accordingly.` : ""}
${focusGoal ? `\nSTUDENT'S FOCUS GOAL:\nCenter the viva question specifically on: "${focusGoal}".` : ""}

${notesContext ? `STUDENT REVISION NOTES:\n${notesContext.slice(0, 1500)}\n` : ""}
${performanceEvidence ? `${performanceEvidence}\n\nAim the opening challenge at a topic the evidence shows is genuinely weak, when one of them is relevant to "${cleanTopic}". Do not tell the student their scores and do not quote a percentage back at them — this is a sparring partner, not a report card. Use the evidence only to choose where to push. Never imply you have measured a topic listed as NEVER TESTED.\n` : ""}
${misconceptionLedger ? `${misconceptionLedger}\n\nWhen a listed misconception is relevant to "${cleanTopic}", open on it — but attack the position, never the student. Jordan should assert the wrong belief confidently as his own view and make the student argue against it; that forces them to articulate the correction rather than merely recognise it. Do not say it came from a record of their mistakes, do not mention how many times it has been seen, and never open by telling them they are wrong about something.\n` : ""}
Respond ONLY with valid JSON in this exact schema:
{
  "speaker": "alex" | "jordan",
  "speechText": "Spoken dialogue opening a punchy Socratic puzzle (2-3 sentences, natural conversational British English)",
  "conceptAnchor": "Core concept being tested",
  "suggestedHints": ["Hint 1", "Hint 2"]
}`;

    const res = await callEdge({
      history: [{ role: "user", content: prompt }],
      tool: "sparring",
    });

    const parsed =
      extractJSON<{
        speaker?: "alex" | "jordan";
        speechText?: string;
        conceptAnchor?: string;
        suggestedHints?: string[];
      }>(res.text) ?? {};

    const speaker: SparringPersona =
      parsed.speaker === "jordan" ? "jordan" : "alex";
    const citations = extractCitationsFromNotes(notesContext, cleanTopic);

    initialRound = {
      id: `round-1-${Date.now()}`,
      roundNumber: 1,
      speaker,
      personaName: SPARRING_PERSONAS[speaker].name,
      personaAvatar: SPARRING_PERSONAS[speaker].avatar,
      speechText:
        parsed.speechText ||
        `Let's dig into ${cleanTopic}. What is the fundamental principle that makes it work?`,
      conceptAnchor: parsed.conceptAnchor || cleanTopic,
      citations,
      suggestedHints: parsed.suggestedHints || [
        "Start with the basics",
        "Give a concrete example",
      ],
    };
  } catch {
    // Graceful offline fallback
    initialRound = generateOfflineOpening(
      cleanTopic,
      notesContext,
      vibe,
      focusGoal,
    );
  }

  const initialEntry: SparringDialogueEntry = {
    id: `entry-${Date.now()}-open`,
    speaker: initialRound.speaker,
    name: initialRound.personaName,
    avatar: initialRound.personaAvatar,
    content: initialRound.speechText,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    citations: initialRound.citations,
  };

  const session: SparringSession = {
    id: sessionId,
    topic: cleanTopic,
    notebookId,
    notesContext,
    vibe,
    focusGoal,
    performanceEvidence,
    status: "active",
    currentRound: 1,
    dialogue: [initialEntry],
    currentChallenge: initialRound,
    cumulativeScores: {
      clarity: 0,
      rigour: 0,
      accuracy: 0,
      roundsCount: 0,
    },
    createdAt: new Date().toISOString(),
  };

  saveSparringSession(session);
  return session;
}

/**
 * Submits the student's spoken or typed answer to the current sparring challenge.
 */
export async function submitStudentAnswer(
  sessionIdOrSession: string | SparringSession,
  studentSpeech: string,
  context?: SparringContext | string,
): Promise<{
  session: SparringSession;
  feedback: StudentFeedback;
  nextRound: SparringRound;
}> {
  let session: SparringSession;
  if (typeof sessionIdOrSession === "string") {
    const found = getSparringSession(sessionIdOrSession);
    if (!found) {
      // Create ad-hoc session if not in memory
      session = await startSparringSession(
        "Study Sparring",
        typeof context === "string" ? context : context?.notesContext,
      );
    } else {
      session = found;
    }
  } else {
    session = sessionIdOrSession;
  }

  const notesContext =
    typeof context === "string"
      ? context
      : context?.notesContext || session.notesContext;

  /* The session's own copy is the fallback, so a caller that passes only notes
     (the string form of `context`) still gets evidence-aware evaluation. */
  const performanceEvidence =
    typeof context === "string"
      ? session.performanceEvidence
      : context?.performanceEvidence || session.performanceEvidence;

  const currentRound = session.currentChallenge;
  const studentText = studentSpeech.trim() || "(Student passed)";

  // Append student turn to dialogue
  const studentEntryId = `entry-${Date.now()}-student`;
  const timestamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  let feedback: StudentFeedback;
  let nextRound: SparringRound;

  try {
    const prompt = `You are evaluating a student's answer in a Voice Viva / Socratic dialogue on "${session.topic}".
CURRENT SPARRING CHALLENGE (from ${currentRound.personaName}):
"${currentRound.speechText}"

STUDENT ANSWER:
"${studentText}"
${session.vibe ? `\nROLE / VIBE INSTRUCTION:\nMaintain character: "${session.vibe}". Align tone and standard with this persona.` : ""}
${session.focusGoal ? `\nSTUDENT'S FOCUS GOAL:\nEvaluate understanding with emphasis on: "${session.focusGoal}".` : ""}

${notesContext ? `GROUNDING REVISION NOTES:\n${notesContext.slice(0, 1200)}\n` : ""}
${performanceEvidence ? `${performanceEvidence}\n\nScore this answer on its own merits — the evidence above is background for choosing what to probe next, never a reason to mark an answer up or down. Do not quote the student's past percentages back at them.\n` : ""}

Respond ONLY with valid JSON in this exact schema:
{
  "clarityScore": number (0-100),
  "rigourScore": number (0-100),
  "accuracyScore": number (0-100),
  "reactionTone": "enthusiastic" | "intrigued" | "challenging" | "skeptical",
  "shortCritique": "1-2 sentence assessment highlighting strengths and logical gaps",
  "keyConceptsMastered": ["concept 1", "concept 2"],
  "missingPoints": ["missing point 1"],
  "nextSpeaker": "alex" | "jordan",
  "nextSpeechText": "Spoken follow-up from the other persona taking the debate to the next level (2-3 sentences)",
  "nextConceptAnchor": "Follow-up concept",
  "suggestedHints": ["Hint A", "Hint B"]
}`;

    const res = await callEdge({
      history: [{ role: "user", content: prompt }],
      tool: "sparring",
    });

    /* Every field below is read with a fallback, so a reply missing any of
       them degrades rather than throwing. Spelled out as a type because the
       old `JSON.parse` returned `any` and type-checked none of this. */
    const parsed =
      extractJSON<{
        clarityScore?: unknown;
        rigourScore?: unknown;
        accuracyScore?: unknown;
        reactionTone?: StudentFeedback["reactionTone"];
        shortCritique?: string;
        keyConceptsMastered?: string[];
        missingPoints?: string[];
        nextSpeaker?: string;
        nextSpeechText?: string;
        nextConceptAnchor?: string;
        suggestedHints?: string[];
      }>(res.text) ?? {};

    const clarityScore = Math.max(
      0,
      Math.min(100, Number(parsed.clarityScore) || 75),
    );
    const rigourScore = Math.max(
      0,
      Math.min(100, Number(parsed.rigourScore) || 70),
    );
    const accuracyScore = Math.max(
      0,
      Math.min(100, Number(parsed.accuracyScore) || 75),
    );
    const overallScore = Math.round(
      clarityScore * 0.4 + rigourScore * 0.4 + accuracyScore * 0.2,
    );

    feedback = {
      clarityScore,
      rigourScore,
      accuracyScore,
      overallScore,
      reactionTone: parsed.reactionTone || "intrigued",
      shortCritique:
        parsed.shortCritique ||
        "Thoughtful explanation addressing the core question.",
      keyConceptsMastered: Array.isArray(parsed.keyConceptsMastered)
        ? parsed.keyConceptsMastered
        : [],
      missingPoints: Array.isArray(parsed.missingPoints)
        ? parsed.missingPoints
        : [],
    };

    const nextSpeaker: SparringPersona =
      parsed.nextSpeaker === "jordan" ? "jordan" : "alex";
    const nextRoundNumber = currentRound.roundNumber + 1;
    const citations = extractCitationsFromNotes(notesContext, session.topic);

    nextRound = {
      id: `round-${nextRoundNumber}-${Date.now()}`,
      roundNumber: nextRoundNumber,
      speaker: nextSpeaker,
      personaName: SPARRING_PERSONAS[nextSpeaker].name,
      personaAvatar: SPARRING_PERSONAS[nextSpeaker].avatar,
      speechText:
        parsed.nextSpeechText ||
        `That is a solid point. But how would you apply that in practice?`,
      conceptAnchor: parsed.nextConceptAnchor || `Advancing ${session.topic}`,
      citations,
      suggestedHints: parsed.suggestedHints || [
        "Consider edge cases",
        "Relate back to the notebook notes",
      ],
    };
  } catch {
    const local = evaluateStudentSpeechLocally(
      session.topic,
      studentText,
      currentRound,
      notesContext,
    );
    feedback = local.feedback;
    nextRound = local.nextRound;
  }

  const studentEntry: SparringDialogueEntry = {
    id: studentEntryId,
    speaker: "student",
    name: "You",
    avatar: "🎓",
    content: studentText,
    timestamp,
    feedback,
  };

  const nextAiEntry: SparringDialogueEntry = {
    id: `entry-${Date.now()}-ai`,
    speaker: nextRound.speaker,
    name: nextRound.personaName,
    avatar: nextRound.personaAvatar,
    content: nextRound.speechText,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    citations: nextRound.citations,
  };

  const roundsCount = session.cumulativeScores.roundsCount + 1;
  const newClarity = Math.round(
    (session.cumulativeScores.clarity * session.cumulativeScores.roundsCount +
      feedback.clarityScore) /
      roundsCount,
  );
  const newRigour = Math.round(
    (session.cumulativeScores.rigour * session.cumulativeScores.roundsCount +
      feedback.rigourScore) /
      roundsCount,
  );
  const newAccuracy = Math.round(
    (session.cumulativeScores.accuracy * session.cumulativeScores.roundsCount +
      feedback.accuracyScore) /
      roundsCount,
  );

  const updatedSession: SparringSession = {
    ...session,
    currentRound: nextRound.roundNumber,
    dialogue: [...session.dialogue, studentEntry, nextAiEntry],
    currentChallenge: nextRound,
    cumulativeScores: {
      clarity: newClarity,
      rigour: newRigour,
      accuracy: newAccuracy,
      roundsCount,
    },
  };

  saveSparringSession(updatedSession);

  return {
    session: updatedSession,
    feedback,
    nextRound,
  };
}

/**
 * Generates the next round when skipping or manually requesting a new angle.
 */
export async function generateNextSparringRound(
  session: SparringSession,
  notesContext?: string,
): Promise<SparringRound> {
  const current = session.currentChallenge;
  const nextSpeaker: SparringPersona =
    current.speaker === "alex" ? "jordan" : "alex";
  const citations = extractCitationsFromNotes(
    notesContext || session.notesContext,
    session.topic,
  );

  try {
    const prompt = `Generate the next sparring challenge on "${session.topic}" from ${SPARRING_PERSONAS[nextSpeaker].name} (${SPARRING_PERSONAS[nextSpeaker].title}).
${session.vibe ? `\nMaintain character: "${session.vibe}".` : ""}
${session.focusGoal ? `\nTarget focus: "${session.focusGoal}".` : ""}
${session.performanceEvidence ? `${session.performanceEvidence}\n\nUse this only to choose where to push — aim at a measured weakness relevant to the topic. Do not quote percentages back at the student, and never imply you have measured a topic listed as NEVER TESTED.\n` : ""}
Respond ONLY with JSON:
{
  "speechText": "Spoken question or counter-argument (2 sentences)",
  "conceptAnchor": "Anchor",
  "suggestedHints": ["Hint 1", "Hint 2"]
}`;

    const res = await callEdge({
      history: [{ role: "user", content: prompt }],
      tool: "sparring",
    });
    const parsed =
      extractJSON<{
        speechText?: string;
        conceptAnchor?: string;
        suggestedHints?: string[];
      }>(res.text) ?? {};

    return {
      id: `round-manual-${Date.now()}`,
      roundNumber: current.roundNumber + 1,
      speaker: nextSpeaker,
      personaName: SPARRING_PERSONAS[nextSpeaker].name,
      personaAvatar: SPARRING_PERSONAS[nextSpeaker].avatar,
      speechText:
        parsed.speechText ||
        `Let's look at this from another perspective. What is the biggest objection someone might have?`,
      conceptAnchor: parsed.conceptAnchor || session.topic,
      citations,
      suggestedHints: parsed.suggestedHints || ["Reflect on limitations"],
    };
  } catch {
    return {
      id: `round-manual-${Date.now()}`,
      roundNumber: current.roundNumber + 1,
      speaker: nextSpeaker,
      personaName: SPARRING_PERSONAS[nextSpeaker].name,
      personaAvatar: SPARRING_PERSONAS[nextSpeaker].avatar,
      speechText:
        nextSpeaker === "jordan"
          ? `Wait, let's challenge this further. What assumption does this whole argument depend upon?`
          : `Can we tie this back to a simple real-life analogy so I can picture how it works?`,
      conceptAnchor: session.topic,
      citations,
      suggestedHints: ["Identify the underlying assumption"],
    };
  }
}
