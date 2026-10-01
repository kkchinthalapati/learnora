/* Explain mode's lesson plan.
 *
 * Explain used to run on the Solver's root-cause debugger: the student's
 * topic went in as "Mistake/Problem: photosynthesis", the prompt told the
 * model the surface and root layers were "severed", and every layer was
 * written to the misconception ledger. Typing a topic was enough to get three
 * "mistakes" on record, two of them BLOCKING, shown under Mistakes to Review
 * and fed to the tutor as things the student "previously got wrong". A run of
 * the real prompt produced "The student doesn't understand… that plants are
 * alive".
 *
 * This asks for a teaching sequence instead: foundations first, no verdict
 * on the student. A misconception is only assumed when the student's own
 * words describe one. Nothing here writes to the ledger; Explain records a
 * gap only when the student gets its check wrong.
 *
 * The result keeps the debugger's CognitiveStackTrace shape so the session
 * screen, its plan rail and its saved data need no migration. */
import { callEdge } from "./ai";
import type { CognitiveLayer, CognitiveStackTrace } from "./aiDebugger";
import { extractJSON } from "../lib/aiJson";
import { fenceUntrusted } from "../lib/actionTags";
import { levelRules, studentLevel } from "../lib/studentLevel";
import { isLimitOrRefusal } from "./aiLimit";

export function buildExplainPlanPrompt(
  subject: string,
  objective: string,
  level: string,
  watchingFor?: string,
): string {
  return `You are planning a short step-by-step explanation for a student who wants to understand something.

SUBJECT: ${fenceUntrusted(subject)}
WHAT THEY WANT TO UNDERSTAND (their own words): """${fenceUntrusted(objective)}"""
${watchingFor ? `A BELIEF THEY HAVE HELD BEFORE (from their own past work): """${fenceUntrusted(watchingFor)}"""\n` : ""}
${levelRules(level)}

Plan exactly 3 steps that build the idea from its foundation up: step 1 is the idea underneath everything else, step 3 is the thing they asked about. Each step is one idea a student can hold in their head.

Rules:
- Do NOT assume the student has a misconception or has misunderstood anything. They have only named what they want to learn.
- Only if their own words above describe a wrong belief or a mistake (for example "I thought…", "I got … wrong", "why isn't…"), name that belief in "trap" and make sure the steps correct it. Otherwise "trap" is an empty string. A belief they held before (if given) may be used as the trap only when it is relevant to this topic.
- Never describe the student. Write about the idea, not about what they do or don't understand.
- Each "explanation" is 2-3 short sentences in plain, everyday English for a 13-16 year old, with an everyday comparison where it helps. Correct for the level above.

Reply with ONLY raw JSON:
{
  "steps": [
    { "concept": "short name of the idea", "explanation": "2-3 sentences" },
    { "concept": "...", "explanation": "..." },
    { "concept": "...", "explanation": "..." }
  ],
  "trap": ""
}`;
}

export async function planExplanation(
  subject: string,
  objective: string,
  watchingFor?: string,
): Promise<CognitiveStackTrace> {
  const base = {
    id: `explain-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    failedQuestionOrTopic: objective,
    subject,
    timestamp: new Date().toISOString(),
  };
  try {
    const level = await studentLevel();
    const { text } = await callEdge({
      history: [
        { role: "user", content: buildExplainPlanPrompt(subject, objective, level, watchingFor) },
      ],
      mode: "solver",
      tool: "debugger",
    });
    const parsed = extractJSON<{
      steps?: { concept?: unknown; explanation?: unknown }[];
      trap?: unknown;
    }>(text);
    const steps = (parsed?.steps ?? []).filter(
      (s) => typeof s?.concept === "string" && typeof s?.explanation === "string" && s.concept.trim(),
    );
    if (steps.length === 0) {
      return {
        ...base,
        layers: [],
        rootCauseSummary: "",
        degraded: { reason: "unreadable", message: "The tutor replied, but not with a plan I could read." },
      };
    }
    /* Level 1 is the foundation, matching the debugger's numbering, so the
       session's "taught from the root up" ordering is unchanged. */
    const layers: CognitiveLayer[] = steps.slice(0, 4).map((s, i) => ({
      level: i + 1,
      concept: String(s.concept).trim(),
      status: "healthy",
      explanation: String(s.explanation).trim(),
      prerequisiteOf: i + 1 < steps.length ? String(steps[i + 1].concept).trim() : undefined,
    }));
    return {
      ...base,
      layers,
      rootCauseSummary: typeof parsed?.trap === "string" ? parsed.trap.trim() : "",
    };
  } catch (err) {
    if (isLimitOrRefusal(err)) throw err;
    return {
      ...base,
      layers: [],
      rootCauseSummary: "",
      degraded: {
        reason: "unavailable",
        message: "I couldn't reach the tutor just now. Your session is saved — try again in a moment.",
      },
    };
  }
}
