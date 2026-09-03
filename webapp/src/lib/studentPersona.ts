import { Storage } from "./storage";

export type DepthLevel = 1 | 2 | 3 | 4 | 5;

export type StudyStyle =
  | "visual_intuitive"
  | "rigorous_step_by_step"
  | "exam_trap_focused"
  | "concise_key_points";

export type SourceMode = "web" | "notebook" | "hybrid";

export interface StudentPersonaPreferences {
  depth: DepthLevel;
  style: StudyStyle;
  sourceMode: SourceMode;
  autoAdapt: boolean;
  customInstructions?: string;
}

export const DEFAULT_STUDENT_PERSONA: StudentPersonaPreferences = {
  depth: 3,
  style: "visual_intuitive",
  sourceMode: "hybrid",
  autoAdapt: true,
};

export const PERSONA_STORAGE_KEY = "learnora_student_persona_v1";

const VALID_STYLES: Set<StudyStyle> = new Set([
  "visual_intuitive",
  "rigorous_step_by_step",
  "exam_trap_focused",
  "concise_key_points",
]);

const VALID_SOURCE_MODES: Set<SourceMode> = new Set([
  "web",
  "notebook",
  "hybrid",
]);

/**
 * Validates and sanitizes a raw depth level to ensure it falls strictly between 1 and 5.
 */
function sanitizeDepth(val: unknown): DepthLevel {
  const num = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(num)) return DEFAULT_STUDENT_PERSONA.depth;
  const clamped = Math.max(1, Math.min(5, Math.round(num)));
  return clamped as DepthLevel;
}

/**
 * Validates and sanitizes a study style.
 */
function sanitizeStyle(val: unknown): StudyStyle {
  if (typeof val === "string" && VALID_STYLES.has(val as StudyStyle)) {
    return val as StudyStyle;
  }
  return DEFAULT_STUDENT_PERSONA.style;
}

/**
 * Validates and sanitizes a source mode.
 */
function sanitizeSourceMode(val: unknown): SourceMode {
  if (typeof val === "string" && VALID_SOURCE_MODES.has(val as SourceMode)) {
    return val as SourceMode;
  }
  return DEFAULT_STUDENT_PERSONA.sourceMode;
}

/**
 * Retrieves the current student persona preferences from storage.
 * Falls back to DEFAULT_STUDENT_PERSONA if missing or corrupt.
 */
export function getStudentPersona(): StudentPersonaPreferences {
  const stored = Storage.get<Partial<StudentPersonaPreferences>>(
    PERSONA_STORAGE_KEY,
    DEFAULT_STUDENT_PERSONA
  );

  if (!stored || typeof stored !== "object") {
    return { ...DEFAULT_STUDENT_PERSONA };
  }

  const depth = sanitizeDepth(stored.depth);
  const style = sanitizeStyle(stored.style);
  const sourceMode = sanitizeSourceMode(stored.sourceMode);
  const autoAdapt = typeof stored.autoAdapt === "boolean" ? stored.autoAdapt : DEFAULT_STUDENT_PERSONA.autoAdapt;
  const customInstructions =
    typeof stored.customInstructions === "string" && stored.customInstructions.trim()
      ? stored.customInstructions.trim()
      : undefined;

  return {
    depth,
    style,
    sourceMode,
    autoAdapt,
    ...(customInstructions ? { customInstructions } : {}),
  };
}

/**
 * Updates student persona preferences with partial manual offsets.
 * Preserves unspecified fields and persists the merged result to storage.
 */
export function saveStudentPersona(
  prefs: Partial<StudentPersonaPreferences>
): StudentPersonaPreferences {
  const current = getStudentPersona();

  const updated: StudentPersonaPreferences = {
    depth: prefs.depth !== undefined ? sanitizeDepth(prefs.depth) : current.depth,
    style: prefs.style !== undefined ? sanitizeStyle(prefs.style) : current.style,
    sourceMode:
      prefs.sourceMode !== undefined ? sanitizeSourceMode(prefs.sourceMode) : current.sourceMode,
    autoAdapt:
      prefs.autoAdapt !== undefined ? Boolean(prefs.autoAdapt) : current.autoAdapt,
  };

  if (prefs.customInstructions !== undefined) {
    const trimmed = prefs.customInstructions.trim();
    if (trimmed) {
      updated.customInstructions = trimmed;
    }
  } else if (current.customInstructions) {
    updated.customInstructions = current.customInstructions;
  }

  Storage.set(PERSONA_STORAGE_KEY, updated);
  return updated;
}

/**
 * Resets the student persona preferences back to system default.
 */
export function resetStudentPersona(): StudentPersonaPreferences {
  Storage.set(PERSONA_STORAGE_KEY, DEFAULT_STUDENT_PERSONA);
  return { ...DEFAULT_STUDENT_PERSONA };
}

const DEPTH_DESCRIPTIONS: Record<DepthLevel, { name: string; instruction: string }> = {
  1: {
    name: "ELI5 / Intuitive Simplicity",
    instruction:
      "Explain concepts with extreme intuitive simplicity as if explaining to a 5-year-old. Use familiar physical analogies, zero prerequisite assumptions, simple vocabulary, and avoid dense formulas or jargon unless immediately grounded in an everyday metaphor.",
  },
  2: {
    name: "Foundational Clarity",
    instruction:
      "Provide foundational clarity. Define all technical terms simply, walk through concrete introductory examples, and build conceptual confidence before introducing mathematical formulations.",
  },
  3: {
    name: "Standard Academic Revision",
    instruction:
      "Provide balanced academic rigor suitable for standard curriculum revision and exams. Use standard terminology, key equations, clear conceptual explanations, and structured exam-ready breakdowns.",
  },
  4: {
    name: "Advanced Mastery",
    instruction:
      "Deliver advanced technical depth. Dive into derivation nuances, boundary condition behaviors, edge cases, and interdisciplinary connections with analytical rigor.",
  },
  5: {
    name: "Deep Academic & Theoretical",
    instruction:
      "Deliver rigorous research-grade academic depth. Present axiomatic foundations, full mathematical or formal derivations, theoretical limits, critical literature debates, and comprehensive proofs.",
  },
};

const STYLE_DESCRIPTIONS: Record<StudyStyle, { name: string; instruction: string }> = {
  visual_intuitive: {
    name: "Visual & Intuitive",
    instruction:
      "Emphasize mental models, spatial visualizations, geometric interpretations, concrete real-world metaphors, and structured ASCII flowcharts or diagrams.",
  },
  rigorous_step_by_step: {
    name: "Rigorous Step-by-Step",
    instruction:
      "Deconstruct arguments and calculations into numbered sequential steps. Explicitly justify every transition, axiom, and intermediate transformation.",
  },
  exam_trap_focused: {
    name: "Exam Trap & Distractor Focused",
    instruction:
      "Actively highlight common student traps, deceptive distractor patterns, examiner trick points, subtle boundary pitfalls, and scoring rubric keys.",
  },
  concise_key_points: {
    name: "Concise Key Points",
    instruction:
      "Focus on high signal-to-noise ratio. Deliver crisp bullet points, key takeaways, formula cheat-sheets, and concise summary tables without conversational fluff.",
  },
};

const SOURCE_MODE_DESCRIPTIONS: Record<SourceMode, { name: string; instruction: string }> = {
  web: {
    name: "Web Intelligence",
    instruction:
      "Prioritize verified external web knowledge, authoritative literature, and broad current domain references.",
  },
  notebook: {
    name: "Student Notebook Only",
    instruction:
      "Ground all responses strictly in the student's notebook materials and course notes. Cite and refer directly to the student's personal notes.",
  },
  hybrid: {
    name: "Hybrid (Notebook + Web Intelligence)",
    instruction:
      "Synthesize the student's notebook materials with live web intelligence. Corroborate student notes against verified web sources and reconcile any knowledge gaps.",
  },
};

/**
 * Builds a pedagogical system prompt tailored to the student's current persona preferences and subject.
 */
export function buildPersonaSystemPrompt(
  persona: StudentPersonaPreferences,
  subject?: string
): string {
  const depthConfig = DEPTH_DESCRIPTIONS[persona.depth];
  const styleConfig = STYLE_DESCRIPTIONS[persona.style];
  const sourceConfig = SOURCE_MODE_DESCRIPTIONS[persona.sourceMode];

  const sections: string[] = [
    `# STUDENT PERSONA & PEDAGOGICAL INSTRUCTIONS`,
    `You are tutoring a student with the following explicit cognitive persona configuration:`,
    `- Depth Level: Level ${persona.depth} (${depthConfig.name})`,
    `- Pedagogical Style: ${styleConfig.name}`,
    `- Knowledge Source Grounding: ${sourceConfig.name}`,
    `- Auto-Adaptive Calibration: ${persona.autoAdapt ? "Enabled (dynamically adapt to student responses)" : "Disabled (fixed depth)"}`,
    ``,
    `## Depth Directives (Level ${persona.depth}):`,
    depthConfig.instruction,
    ``,
    `## Style Directives:`,
    styleConfig.instruction,
    ``,
    `## Source Grounding Directives:`,
    sourceConfig.instruction,
  ];

  if (persona.autoAdapt) {
    sections.push(
      ``,
      `## Adaptive Calibration:`,
      `Monitor the student's replies. If they demonstrate confusion or ask repeated questions, temporarily simplify and introduce a concrete bridge analogy. If they answer effortlessly, deepen the challenge.`
    );
  }

  if (subject && subject.trim()) {
    sections.push(
      ``,
      `## Subject Context (${subject.trim()}):`,
      `Tailor your vocabulary, conventions, and problem-solving standards to ${subject.trim()}. Follow standard academic nomenclature and formatting appropriate for this discipline.`
    );
  }

  if (persona.customInstructions && persona.customInstructions.trim()) {
    sections.push(
      ``,
      `## Student Custom Directives:`,
      `The student provided these custom instructions (honor these while maintaining accuracy):`,
      `"""`,
      persona.customInstructions.trim(),
      `"""`
    );
  }

  return sections.join("\n");
}
