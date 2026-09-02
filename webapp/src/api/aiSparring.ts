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

export const SPARRING_PERSONAS: Record<SparringPersona, SparringPersonaProfile> = {
  alex: {
    id: "alex",
    name: "Alex",
    avatar: "🌱",
    title: "Curious Beginner",
    description: "Asks 'but why?' and tests whether you truly understand the foundational intuition.",
    voicePitch: 1.15,
    voiceRate: 1.0,
  },
  jordan: {
    id: "jordan",
    name: "Jordan",
    avatar: "⚡",
    title: "Sharp Peer",
    description: "Throws counter-examples and tricky edge cases to test your argument rigour.",
    voicePitch: 0.92,
    voiceRate: 1.08,
  },
};

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
  session?: SparringSession;
}

// In-memory active session cache
const activeSessions = new Map<string, SparringSession>();

export function getSparringSession(sessionId: string): SparringSession | undefined {
  return activeSessions.get(sessionId);
}

export function saveSparringSession(session: SparringSession): void {
  activeSessions.set(session.id, session);
}

function extractCitationsFromNotes(notes: string | undefined, topic: string): GroundedCitation[] {
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

function generateOfflineOpening(topic: string, notesContext?: string): SparringRound {
  const t = topic.toLowerCase();
  let speaker: SparringPersona = "alex";
  let speechText = "";
  let conceptAnchor = "";
  let suggestedHints = [
    "Explain the core mechanism in plain English",
    "Give an everyday real-world example",
    "Highlight the difference between cause and effect",
  ];

  if (t.includes("newton") || t.includes("motion") || t.includes("momentum") || t.includes("physics")) {
    speaker = "alex";
    conceptAnchor = "Action-Reaction & System Boundaries";
    speechText =
      "I've been thinking about this: if Newton's Third Law says every action has an equal and opposite reaction, why doesn't every single force just cancel out? How does anything ever accelerate?";
    suggestedHints = [
      "Forces act on different bodies, not the same one",
      "Draw a free-body diagram for a single object",
      "Think about pushing against the ground to walk",
    ];
  } else if (t.includes("photo") || t.includes("respir") || t.includes("cell") || t.includes("bio")) {
    speaker = "jordan";
    conceptAnchor = "Cellular Bioenergetics";
    speechText =
      "Everyone says plants produce oxygen for animals through photosynthesis, but aren't plants running aerobic cellular respiration 24/7 anyway? Doesn't that make their net oxygen contribution basically wash out?";
    suggestedHints = [
      "Rate of photosynthesis in sunlight far exceeds respiration",
      "Chloroplast light reactions vs mitochondria",
      "Carbon fixation stores net biomass",
    ];
  } else if (t.includes("econ") || t.includes("market") || t.includes("inflation") || t.includes("money")) {
    speaker = "jordan";
    conceptAnchor = "Monetary & Supply Dynamics";
    speechText =
      "If lowering interest rates encourages investment and creates jobs, why wouldn't central banks simply keep rates near zero permanently? What is the breaking point?";
    suggestedHints = [
      "Demand-pull inflation and purchasing power erosion",
      "Asset price bubbles and misallocation of capital",
      "Central bank credibility and expectations",
    ];
  } else {
    speaker = "alex";
    conceptAnchor = `Core Foundations of ${topic}`;
    speechText = `I'm trying to wrap my head around ${topic}. If you had to explain the single most crucial mechanism behind it without using any technical jargon, how would you convince me it actually works?`;
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
  const reasoningTerms = ["because", "therefore", "since", "so", "means", "causes", "acts on", "different"];
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
  const overallScore = Math.round((clarityScore * 0.4) + (rigourScore * 0.4) + (accuracyScore * 0.2));

  let reactionTone: StudentFeedback["reactionTone"] = "intrigued";
  let shortCritique = "";
  const keyConceptsMastered: string[] = [];
  const missingPoints: string[] = [];

  if (overallScore >= 80) {
    reactionTone = "enthusiastic";
    shortCritique = `Excellent intuition! You clearly distinguished the core conditions and justified your reasoning directly.`;
    keyConceptsMastered.push("Core conceptual causality", "Boundary conditions identification");
  } else if (overallScore >= 65) {
    reactionTone = "challenging";
    shortCritique = `Good direction, but your argument glosses over the exact mechanism that prevents ambiguity.`;
    keyConceptsMastered.push("General conceptual foundation");
    missingPoints.push("Formal specification of interacting entities", "Rigorous step-by-step causality");
  } else {
    reactionTone = "skeptical";
    shortCritique = `A bit brief or ambiguous. Try unpacking why this occurs rather than just stating that it does.`;
    missingPoints.push("Explicit definitions", "Concrete reasoning chain");
  }

  // Next speaker alternates
  const nextSpeaker: SparringPersona = round.speaker === "alex" ? "jordan" : "alex";
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
): Promise<SparringSession> {
  const sessionId = `sparring-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cleanTopic = topic.trim() || "General Study Topic";

  let initialRound: SparringRound;

  try {
    const prompt = `You are designing a Socratic Audio Sparring opening round for a student on "${cleanTopic}".
You have two personas:
- Alex (🌱): Curious beginner, asks "why?", intuitive explanations.
- Jordan (⚡): Overconfident peer, sharp, challenges assumptions, tests edge cases.

${notesContext ? `STUDENT REVISION NOTES:\n${notesContext.slice(0, 1500)}\n` : ""}

Respond ONLY with valid JSON in this exact schema:
{
  "speaker": "alex" | "jordan",
  "speechText": "Spoken dialogue opening a punchy Socratic puzzle (2-3 sentences, natural conversational British English)",
  "conceptAnchor": "Core concept being tested",
  "suggestedHints": ["Hint 1", "Hint 2"]
}`;

    const res = await callEdge({
      history: [{ role: "user", content: prompt }],
    });

    const parsed = JSON.parse(res.text) as {
      speaker?: "alex" | "jordan";
      speechText?: string;
      conceptAnchor?: string;
      suggestedHints?: string[];
    };

    const speaker: SparringPersona = parsed.speaker === "jordan" ? "jordan" : "alex";
    const citations = extractCitationsFromNotes(notesContext, cleanTopic);

    initialRound = {
      id: `round-1-${Date.now()}`,
      roundNumber: 1,
      speaker,
      personaName: SPARRING_PERSONAS[speaker].name,
      personaAvatar: SPARRING_PERSONAS[speaker].avatar,
      speechText: parsed.speechText || `Let's dig into ${cleanTopic}. What is the fundamental principle that makes it work?`,
      conceptAnchor: parsed.conceptAnchor || cleanTopic,
      citations,
      suggestedHints: parsed.suggestedHints || ["Start with the basics", "Give a concrete example"],
    };
  } catch {
    // Graceful offline fallback
    initialRound = generateOfflineOpening(cleanTopic, notesContext);
  }

  const initialEntry: SparringDialogueEntry = {
    id: `entry-${Date.now()}-open`,
    speaker: initialRound.speaker,
    name: initialRound.personaName,
    avatar: initialRound.personaAvatar,
    content: initialRound.speechText,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    citations: initialRound.citations,
  };

  const session: SparringSession = {
    id: sessionId,
    topic: cleanTopic,
    notebookId,
    notesContext,
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

  const currentRound = session.currentChallenge;
  const studentText = studentSpeech.trim() || "(Student passed)";

  // Append student turn to dialogue
  const studentEntryId = `entry-${Date.now()}-student`;
  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  let feedback: StudentFeedback;
  let nextRound: SparringRound;

  try {
    const prompt = `You are evaluating a student's answer in a Socratic Sparring dialogue on "${session.topic}".
CURRENT SPARRING CHALLENGE (from ${currentRound.personaName}):
"${currentRound.speechText}"

STUDENT ANSWER:
"${studentText}"

${notesContext ? `GROUNDING REVISION NOTES:\n${notesContext.slice(0, 1200)}\n` : ""}

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
    });

    const parsed = JSON.parse(res.text);

    const clarityScore = Math.max(0, Math.min(100, Number(parsed.clarityScore) || 75));
    const rigourScore = Math.max(0, Math.min(100, Number(parsed.rigourScore) || 70));
    const accuracyScore = Math.max(0, Math.min(100, Number(parsed.accuracyScore) || 75));
    const overallScore = Math.round((clarityScore * 0.4) + (rigourScore * 0.4) + (accuracyScore * 0.2));

    feedback = {
      clarityScore,
      rigourScore,
      accuracyScore,
      overallScore,
      reactionTone: parsed.reactionTone || "intrigued",
      shortCritique: parsed.shortCritique || "Thoughtful explanation addressing the core question.",
      keyConceptsMastered: Array.isArray(parsed.keyConceptsMastered) ? parsed.keyConceptsMastered : [],
      missingPoints: Array.isArray(parsed.missingPoints) ? parsed.missingPoints : [],
    };

    const nextSpeaker: SparringPersona = parsed.nextSpeaker === "jordan" ? "jordan" : "alex";
    const nextRoundNumber = currentRound.roundNumber + 1;
    const citations = extractCitationsFromNotes(notesContext, session.topic);

    nextRound = {
      id: `round-${nextRoundNumber}-${Date.now()}`,
      roundNumber: nextRoundNumber,
      speaker: nextSpeaker,
      personaName: SPARRING_PERSONAS[nextSpeaker].name,
      personaAvatar: SPARRING_PERSONAS[nextSpeaker].avatar,
      speechText: parsed.nextSpeechText || `That is a solid point. But how would you apply that in practice?`,
      conceptAnchor: parsed.nextConceptAnchor || `Advancing ${session.topic}`,
      citations,
      suggestedHints: parsed.suggestedHints || ["Consider edge cases", "Relate back to the notebook notes"],
    };
  } catch {
    const local = evaluateStudentSpeechLocally(session.topic, studentText, currentRound, notesContext);
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
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    citations: nextRound.citations,
  };

  const roundsCount = session.cumulativeScores.roundsCount + 1;
  const newClarity = Math.round(
    (session.cumulativeScores.clarity * session.cumulativeScores.roundsCount + feedback.clarityScore) / roundsCount,
  );
  const newRigour = Math.round(
    (session.cumulativeScores.rigour * session.cumulativeScores.roundsCount + feedback.rigourScore) / roundsCount,
  );
  const newAccuracy = Math.round(
    (session.cumulativeScores.accuracy * session.cumulativeScores.roundsCount + feedback.accuracyScore) / roundsCount,
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
  const nextSpeaker: SparringPersona = current.speaker === "alex" ? "jordan" : "alex";
  const citations = extractCitationsFromNotes(notesContext || session.notesContext, session.topic);

  try {
    const prompt = `Generate the next sparring challenge on "${session.topic}" from ${SPARRING_PERSONAS[nextSpeaker].name} (${SPARRING_PERSONAS[nextSpeaker].title}).
Respond ONLY with JSON:
{
  "speechText": "Spoken question or counter-argument (2 sentences)",
  "conceptAnchor": "Anchor",
  "suggestedHints": ["Hint 1", "Hint 2"]
}`;

    const res = await callEdge({
      history: [{ role: "user", content: prompt }],
    });
    const parsed = JSON.parse(res.text);

    return {
      id: `round-manual-${Date.now()}`,
      roundNumber: current.roundNumber + 1,
      speaker: nextSpeaker,
      personaName: SPARRING_PERSONAS[nextSpeaker].name,
      personaAvatar: SPARRING_PERSONAS[nextSpeaker].avatar,
      speechText: parsed.speechText || `Let's look at this from another perspective. What is the biggest objection someone might have?`,
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
