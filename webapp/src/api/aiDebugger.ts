import { callEdge } from "./ai";

export type LayerStatus = "healthy" | "shaky" | "severed";

export interface CognitiveLayer {
  level: number;
  concept: string;
  status: LayerStatus;
  explanation: string;
  prerequisiteOf?: string;
}

export interface CognitiveStackTrace {
  id: string;
  failedQuestionOrTopic: string;
  subject: string;
  layers: CognitiveLayer[];
  rootCauseSummary: string;
  timestamp: string;
}

export interface InteractiveExercise {
  prompt: string;
  options: string[];
  correctIndex: number;
  firstPrinciplesExplanation: string;
}

export interface MicroRepairChallenge {
  id: string;
  rootConcept: string;
  intuitionSummary: string;
  interactiveExercise: InteractiveExercise;
  verified: boolean;
}

export const STORAGE_KEY_TRACES = "learnora_cognitive_traces_v1";
export const STORAGE_KEY_REPAIRS = "learnora_micro_repairs_v1";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "tr_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 9);
}

function sanitizeJSON(str: string): string {
  return str.replace(/,(\s*[\]}])/g, "$1");
}

function stripFences(text: string): string {
  return text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

/** Retrieve all cached cognitive stack traces from local/session storage */
export function getSavedTraces(): CognitiveStackTrace[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TRACES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Retrieve a specific cognitive trace by ID */
export function getSavedTraceById(id: string): CognitiveStackTrace | null {
  const traces = getSavedTraces();
  return traces.find((t) => t.id === id) || null;
}

/** Save or update a cognitive trace in local storage */
export function saveTrace(trace: CognitiveStackTrace): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const traces = getSavedTraces();
    const existingIndex = traces.findIndex((t) => t.id === trace.id);
    let updated: CognitiveStackTrace[];
    if (existingIndex >= 0) {
      updated = [...traces];
      updated[existingIndex] = trace;
    } else {
      updated = [trace, ...traces];
    }
    // Cap at 50 historical traces
    window.localStorage.setItem(STORAGE_KEY_TRACES, JSON.stringify(updated.slice(0, 50)));
  } catch (err) {
    console.warn("Failed to persist the saved mistake to localStorage:", err);
  }
}

/** Delete a cognitive trace by ID */
export function deleteTrace(id: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const traces = getSavedTraces();
    const filtered = traces.filter((t) => t.id !== id);
    window.localStorage.setItem(STORAGE_KEY_TRACES, JSON.stringify(filtered));
  } catch (err) {
    console.warn("Failed to delete trace from localStorage:", err);
  }
}

/** Clear all trace history */
export function clearTraceHistory(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY_TRACES);
  } catch (err) {
    console.warn("Failed to clear trace history:", err);
  }
}

/** Retrieve all cached micro-repair challenges */
export function getSavedRepairs(): Record<string, MicroRepairChallenge> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_REPAIRS);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Save a micro-repair challenge */
export function saveRepair(repair: MicroRepairChallenge): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const repairs = getSavedRepairs();
    repairs[repair.id] = repair;
    window.localStorage.setItem(STORAGE_KEY_REPAIRS, JSON.stringify(repairs));
  } catch (err) {
    console.warn("Failed to persist repair to localStorage:", err);
  }
}

/** Build the prompt for diagnosing cognitive root-cause gaps */
export function buildDiagnosticPrompt(
  subject: string,
  mistakeDescription: string,
  context?: string,
): string {
  return `You are the Learnora Cognitive Root-Cause Debugger. Your job is to perform a deep cognitive stack trace on a student's mistake or confusion, peeling back the layers from the surface error down to the broken foundational prerequisite.

Subject: ${subject}
Mistake/Problem: ${mistakeDescription}
${context ? `Additional Context/Attempt: ${context}` : ""}

Analyze the exact misconception by building a 3-layer Mental Stack Trace:
- Level 3 (Surface Problem): The immediate problem or formula where the student failed. Status is typically "severed".
- Level 2 (Intermediate Bridge): The connective theorem, algebraic/logical step, or intermediate model bridging the root foundation to the surface. Status is "shaky" or "severed".
- Level 1 (Root Foundation): The absolute core first-principles prerequisite concept that broke down or was misunderstood. Status is "severed".

Write every "concept", "explanation" and summary in plain, everyday British English, as if you were talking to a 16-year-old. Short sentences. No jargon like "cognitive", "prerequisite gap", "propagation" or "invariant" — say what you mean. Be warm and matter-of-fact, never alarming.

You MUST reply with ONLY valid raw JSON conforming to this exact schema (no prose outside JSON):
{
  "rootCauseSummary": "One or two plain sentences saying what the student never quite got, and why that made this go wrong.",
  "layers": [
    {
      "level": 3,
      "concept": "Name of Surface Concept / Rule",
      "status": "severed",
      "explanation": "What went wrong in the question itself, in plain words.",
      "prerequisiteOf": "The current problem"
    },
    {
      "level": 2,
      "concept": "Name of Intermediate Bridge Concept",
      "status": "shaky",
      "explanation": "Which step in the middle got used wrongly, in plain words.",
      "prerequisiteOf": "Name of Surface Concept"
    },
    {
      "level": 1,
      "concept": "Name of Root Foundational Prerequisite",
      "status": "severed",
      "explanation": "The basic idea underneath that never quite landed.",
      "prerequisiteOf": "Name of Intermediate Concept"
    }
  ]
}`;
}

/** Build the prompt for generating a 60-second micro-repair */
export function buildMicroRepairPrompt(rootConcept: string): string {
  return `You are the Learnora Micro-Repair Engine. Generate a rapid 60-second first-principles interactive mental repair for the following broken foundational concept: "${rootConcept}".

Strip out the jargon. Explain it the way you would to a friend who has never seen it before, in plain British English, so it clicks in under a minute.

You MUST reply with ONLY valid raw JSON conforming to this exact schema (no prose outside JSON):
{
  "rootConcept": "${rootConcept}",
  "intuitionSummary": "Two or three plain sentences that explain the idea, ideally with a everyday comparison the student can picture.",
  "interactiveExercise": {
    "prompt": "A single targeted conceptual question with 4 options testing this fundamental intuition directly.",
    "options": [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    "correctIndex": 0,
    "firstPrinciplesExplanation": "A plain explanation of why this answer is right, so the idea sticks."
  }
}`;
}

/** Fallback generator for diagnostic stack traces when offline or in test environments */
function createFallbackDiagnosis(
  subject: string,
  mistakeDescription: string,
): { rootCauseSummary: string; layers: CognitiveLayer[] } {
  const cleanSubject = subject.trim() || "General Science & Logic";
  const desc = mistakeDescription.trim() || "Conceptual misunderstanding";

  return {
    rootCauseSummary: `The trouble with ${desc} comes from a basic idea in ${cleanSubject} that never quite landed.`,
    layers: [
      {
        level: 3,
        concept: `Using ${desc.slice(0, 40)}`,
        status: "severed",
        explanation: `The formula went in before the conditions behind it were checked.`,
        prerequisiteOf: "The question you were doing",
      },
      {
        level: 2,
        concept: `Linking the quantities to how they change`,
        status: "shaky",
        explanation: `The jump from the simple version to the combined one was done by rote, not by thinking it through.`,
        prerequisiteOf: `Using ${desc.slice(0, 40)}`,
      },
      {
        level: 1,
        concept: `What stays the same, and why`,
        status: "severed",
        explanation: `The rules about what has to stay the same were never checked before the working started.`,
        prerequisiteOf: `Linking the quantities to how they change`,
      },
    ],
  };
}

/** Fallback generator for micro repair when offline or in test environments */
function createFallbackMicroRepair(rootConcept: string): MicroRepairChallenge {
  return {
    id: generateId(),
    rootConcept,
    intuitionSummary: `${rootConcept} isn\u2019t a random rule to memorise. It\u2019s a promise that something stays the same. Every step you take has to keep that promise.`,
    interactiveExercise: {
      prompt: `When you use "${rootConcept}", what is the one thing that has to stay true at every step?`,
      options: [
        "The units and the logic have to balance the whole way through.",
        "Only the final number matters, however you got there.",
        "You can flip a sign whenever the outside terms look right.",
        "You can skip the basics as long as you remember the shortcut.",
      ],
      correctIndex: 0,
      firstPrinciplesExplanation: `If the thing that has to stay the same really does stay the same at every step, the mistake never gets a chance to creep in.`,
    },
    verified: false,
  };
}

/** Diagnose cognitive root cause and generate a 3-layer Mental Stack Trace */
export async function diagnoseCognitiveGap(
  subject: string,
  mistakeDescription: string,
  context?: string,
): Promise<CognitiveStackTrace> {
  const prompt = buildDiagnosticPrompt(subject, mistakeDescription, context);

  let diagnosisData: { rootCauseSummary: string; layers: CognitiveLayer[] };

  try {
    const result = await callEdge({
      history: [{ role: "user", content: prompt }],
      mode: "rewrite",
    });

    const text = stripFences(result.text || "");
    const sanitized = sanitizeJSON(text);

    let parsed: any;
    try {
      parsed = JSON.parse(sanitized);
    } catch {
      // If direct parse fails, try extracting first JSON object
      const match = sanitized.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(sanitizeJSON(match[0]));
      } else {
        throw new Error("Could not read the AI's answer");
      }
    }

    if (parsed && Array.isArray(parsed.layers) && parsed.layers.length > 0) {
      const layers: CognitiveLayer[] = parsed.layers.map((l: any, idx: number) => ({
        level: typeof l.level === "number" ? l.level : 3 - idx,
        concept: String(l.concept || `Step ${3 - idx}`),
        status: (l.status === "healthy" || l.status === "shaky" || l.status === "severed"
          ? l.status
          : "severed") as LayerStatus,
        explanation: String(l.explanation || "No details for this step."),
        prerequisiteOf: l.prerequisiteOf ? String(l.prerequisiteOf) : undefined,
      }));

      // Ensure sorted 3 down to 1
      layers.sort((a, b) => b.level - a.level);

      diagnosisData = {
        rootCauseSummary:
          typeof parsed.rootCauseSummary === "string" && parsed.rootCauseSummary.trim()
            ? parsed.rootCauseSummary.trim()
            : `Something basic in ${subject} needs another look.`,
        layers,
      };
    } else {
      diagnosisData = createFallbackDiagnosis(subject, mistakeDescription);
    }
  } catch (err) {
    console.warn("Mistake analysis fallback activated:", err);
    diagnosisData = createFallbackDiagnosis(subject, mistakeDescription);
  }

  const trace: CognitiveStackTrace = {
    id: generateId(),
    failedQuestionOrTopic: mistakeDescription,
    subject: subject.trim() || "General",
    layers: diagnosisData.layers,
    rootCauseSummary: diagnosisData.rootCauseSummary,
    timestamp: new Date().toISOString(),
  };

  saveTrace(trace);
  return trace;
}

/** Generate a 60-second first-principles interactive micro-repair */
export async function generateMicroRepair(rootConcept: string): Promise<MicroRepairChallenge> {
  const prompt = buildMicroRepairPrompt(rootConcept);

  try {
    const result = await callEdge({
      history: [{ role: "user", content: prompt }],
      mode: "rewrite",
    });

    const text = stripFences(result.text || "");
    const sanitized = sanitizeJSON(text);

    let parsed: any;
    try {
      parsed = JSON.parse(sanitized);
    } catch {
      const match = sanitized.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(sanitizeJSON(match[0]));
      } else {
        throw new Error("Could not read the AI's answer");
      }
    }

    if (
      parsed &&
      typeof parsed.intuitionSummary === "string" &&
      parsed.interactiveExercise &&
      Array.isArray(parsed.interactiveExercise.options)
    ) {
      const challenge: MicroRepairChallenge = {
        id: generateId(),
        rootConcept: parsed.rootConcept || rootConcept,
        intuitionSummary: parsed.intuitionSummary,
        interactiveExercise: {
          prompt: parsed.interactiveExercise.prompt || `What does ${rootConcept} actually mean?`,
          options: parsed.interactiveExercise.options,
          correctIndex:
            typeof parsed.interactiveExercise.correctIndex === "number" &&
            parsed.interactiveExercise.correctIndex >= 0 &&
            parsed.interactiveExercise.correctIndex < parsed.interactiveExercise.options.length
              ? parsed.interactiveExercise.correctIndex
              : 0,
          firstPrinciplesExplanation:
            parsed.interactiveExercise.firstPrinciplesExplanation ||
            "Nice — that's the idea.",
        },
        verified: false,
      };
      saveRepair(challenge);
      return challenge;
    }
  } catch (err) {
    console.warn("Micro-repair generation fallback activated:", err);
  }

  const fallback = createFallbackMicroRepair(rootConcept);
  saveRepair(fallback);
  return fallback;
}

/** Record that a repair challenge was successfully completed and restore the broken circuit */
export async function recordRepairSuccess(traceId: string, repairId: string): Promise<void> {
  // 1. Mark repair verified
  const repairs = getSavedRepairs();
  if (repairs[repairId]) {
    repairs[repairId] = {
      ...repairs[repairId],
      verified: true,
    };
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_REPAIRS, JSON.stringify(repairs));
    }
  }

  // 2. Restore cognitive stack trace layer statuses
  const trace = getSavedTraceById(traceId);
  if (trace) {
    const updatedLayers = trace.layers.map((layer) => {
      // Level 1 (root) becomes healthy
      if (layer.level === 1) {
        return { ...layer, status: "healthy" as LayerStatus };
      }
      // Level 2 & 3 upgraded to healthy if repaired
      if (layer.status === "severed" || layer.status === "shaky") {
        return { ...layer, status: "healthy" as LayerStatus };
      }
      return layer;
    });

    const updatedTrace: CognitiveStackTrace = {
      ...trace,
      layers: updatedLayers,
    };
    saveTrace(updatedTrace);
  }
}
