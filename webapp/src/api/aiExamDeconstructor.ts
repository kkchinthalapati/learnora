import { callEdge } from "./ai";
import type { Settings } from "../lib/settings";

export interface TrapArchetype {
  id: string;
  name: string;
  category:
    | "edge_cases"
    | "negative_wording"
    | "hidden_assumptions"
    | "lookalike_terms"
    | "units_scale"
    | "shortcuts"
    | string;
  description: string;
  examplePattern: string;
  frequency: "Pervasive" | "High" | "Frequent" | "Common";
  disarmRule: string;
  defaultImmunity?: number;
}

export interface SprintQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  trapArchetypeId: string;
  trapName: string;
  baitOptionIndex: number;
  baitExplanation: string;
  trapExplanation: string;
  hint: string;
  topic?: string;
  difficulty?: "standard" | "tricky" | "mastery";
}

export interface AhaDisarmWalkthrough {
  trapId: string;
  trapName: string;
  step1Bait: {
    title: string;
    description: string;
    baitExample: string;
    whyItTricksStudents: string;
  };
  step2SneakyTrick: {
    title: string;
    description?: string;
    mechanism: string;
    distractorDesign: string;
  };
  step3DetectiveRule: {
    title: string;
    ruleStatement: string;
    checklist: string[];
    motto: string;
  };
  step4DisarmChallenge: {
    title: string;
    scenario: string;
    options: string[];
    correctAnswerIndex: number;
    explanation: string;
    celebrationNote: string;
  };
}

export interface ImmunityRadarRecord {
  id: string;
  subject: string;
  timestamp: string;
  overallScore: number;
  disarmedTrapIds: string[];
  totalAttempted: number;
  correctCount: number;
  categoryScores: Record<string, number>;
}

export const CANONICAL_TRAP_ARCHETYPES: TrapArchetype[] = [
  {
    id: "edge-case-hazards",
    name: "Edge Case Hazards",
    category: "edge_cases",
    description:
      "Professors pick extreme or boundary values—zero, empty sets, limits at infinity, or interval endpoints—where standard general formulas silently collapse.",
    examplePattern:
      "Dividing both sides by (x - 1) without verifying whether x can equal 1, or assuming a function is defined at x = 0.",
    frequency: "Pervasive",
    disarmRule:
      "Always test boundary triggers: 0, 1, negatives, empty cases, and limits before committing to an answer.",
    defaultImmunity: 70,
  },
  {
    id: "negative-wording-maze",
    name: "Negative Wording Maze",
    category: "negative_wording",
    description:
      "Slips in qualifiers like 'EXCEPT', 'NOT true', 'LEAST likely', or 'CANNOT be inferred', baiting you to select the first statement that is factually true.",
    examplePattern:
      "Presenting three true statements and one subtle false statement, when the prompt asks: 'Which of the following is NOT valid?'",
    frequency: "High",
    disarmRule:
      "Circle the negative operator immediately. Rephrase the question as: 'Find the one false claim among the true ones.'",
    defaultImmunity: 80,
  },
  {
    id: "hidden-assumptions",
    name: "Hidden Assumptions",
    category: "hidden_assumptions",
    description:
      "Implicitly introduces an unverified premise—such as constant temperature, frictionless plane, independent events, or linearity—in the middle of a multi-step problem.",
    examplePattern:
      "Applying Bayes' Theorem or naive probabilities assuming events are independent when joint dependency is subtly implied in the paragraph.",
    frequency: "Frequent",
    disarmRule:
      "Audit prerequisites: Does the theorem require continuity? Independence? Conservation? Verify each prerequisite is stated, not assumed.",
    defaultImmunity: 65,
  },
  {
    id: "lookalike-terms",
    name: "Lookalike Terms & False Synonyms",
    category: "lookalike_terms",
    description:
      "Pairs terms that sound cognate or conceptually related but carry strictly distinct mathematical or scientific definitions.",
    examplePattern:
      "Conflating 'permutations' vs 'combinations', 'continuous' vs 'differentiable', or 'precision' vs 'accuracy'.",
    frequency: "Common",
    disarmRule:
      "Ask: Does order matter? Does repetition apply? Pinpoint the single defining criterion distinguishing the twin terms.",
    defaultImmunity: 75,
  },
  {
    id: "units-and-scale-drift",
    name: "Units & Scale Drift",
    category: "units_scale",
    description:
      "Mixes metric scales (seconds vs milliseconds, radians vs degrees, meters vs centimeters) so correct algebraic reasoning yields a numeric trap distractor.",
    examplePattern:
      "Computing kinetic energy with mass in grams rather than kilograms, resulting in an answer exactly 1,000x off.",
    frequency: "High",
    disarmRule:
      "Standardize all numbers into base SI units right in the margin before writing down the primary formula.",
    defaultImmunity: 72,
  },
  {
    id: "premature-shortcut-traps",
    name: "Premature Shortcut Traps",
    category: "shortcuts",
    description:
      "Offers an intuitive, greedy heuristic that works on beginner problems but fails to account for asymmetric costs or edge cases in advanced problems.",
    examplePattern:
      "Assuming the highest rate of change at a given point must correspond to the global maximum of the function.",
    frequency: "Frequent",
    disarmRule:
      "Treat fast 'too-easy' answers as warning signals. Perform a 10-second sanity check against counterexamples.",
    defaultImmunity: 68,
  },
];

const QUESTION_BANK: Record<string, SprintQuestion[]> = {
  math: [
    {
      id: "math-sprint-1",
      question:
        "For what values of x does the equation (x² - 4) / (x - 2) = 4 hold true?",
      options: [
        "x = 2 only",
        "No real solution",
        "All real numbers except x = 2",
        "x = 0 and x = 2",
      ],
      correctAnswerIndex: 1,
      trapArchetypeId: "edge-case-hazards",
      trapName: "Edge Case Hazards",
      baitOptionIndex: 0,
      baitExplanation:
        "Simplifying (x² - 4)/(x - 2) gives x + 2. Setting x + 2 = 4 yields x = 2. It feels like an instant win!",
      trapExplanation:
        "The original expression is undefined at x = 2 due to division by zero (0/0). Therefore, x = 2 cannot be in the domain, leaving no valid real solutions.",
      hint: "Check the domain of the expression before canceling terms in rational functions.",
      topic: "Calculus & Algebra",
      difficulty: "tricky",
    },
    {
      id: "math-sprint-2",
      question:
        "Which of the following statements is NOT necessarily true for a continuous function f(x) on [a, b]?",
      options: [
        "f(x) attains an absolute maximum and minimum on [a, b]",
        "f(x) takes on every value between f(a) and f(b)",
        "f'(x) exists for at least one point in (a, b)",
        "f(x) is bounded on [a, b]",
      ],
      correctAnswerIndex: 2,
      trapArchetypeId: "negative-wording-maze",
      trapName: "Negative Wording Maze",
      baitOptionIndex: 0,
      baitExplanation:
        "Extreme Value Theorem guarantees max and min on closed intervals, so option 1 looks familiar and tempting to select immediately.",
      trapExplanation:
        "The question asked which is NOT necessarily true. Differentiability (f'(x) exists) requires smoothness, which is not guaranteed by continuity alone (e.g. absolute value function at a corner).",
      hint: "Notice 'NOT necessarily true'. Look for an assumption requiring differentiability rather than mere continuity.",
      topic: "Real Analysis & Calculus",
      difficulty: "standard",
    },
    {
      id: "math-sprint-3",
      question:
        "A committee of 3 people is chosen from 5 candidates. How many distinct committees can be formed?",
      options: ["60", "10", "15", "125"],
      correctAnswerIndex: 1,
      trapArchetypeId: "lookalike-terms",
      trapName: "Lookalike Terms & False Synonyms",
      baitOptionIndex: 0,
      baitExplanation:
        "5 × 4 × 3 = 60 computes permutations (ordered roles), which is the first calculation that springs to mind.",
      trapExplanation:
        "A committee has no internal order or ranking. Thus, we use combinations: 5C3 = (5 × 4 × 3)/(3 × 2 × 1) = 10.",
      hint: "Does the order of selection create a different committee, or are they identical?",
      topic: "Combinatorics",
      difficulty: "standard",
    },
    {
      id: "math-sprint-4",
      question:
        "If events A and B have P(A) = 0.6 and P(B) = 0.5, what is P(A ∩ B) assuming nothing else is specified?",
      options: [
        "Exactly 0.30",
        "At least 0.10 and at most 0.50",
        "Exactly 0.10",
        "0.00",
      ],
      correctAnswerIndex: 1,
      trapArchetypeId: "hidden-assumptions",
      trapName: "Hidden Assumptions",
      baitOptionIndex: 0,
      baitExplanation:
        "P(A) × P(B) = 0.6 × 0.5 = 0.30 is calculated by reflex under the unverified assumption of independence.",
      trapExplanation:
        "The problem did NOT state that A and B are independent! Since P(A ∪ B) ≤ 1, P(A ∩ B) = P(A) + P(B) - P(A ∪ B) ≥ 0.6 + 0.5 - 1 = 0.10, and cannot exceed min(P(A), P(B)) = 0.50.",
      hint: "Were you told the events are independent, or did you automatically multiply them?",
      topic: "Probability",
      difficulty: "mastery",
    },
  ],
  cs: [
    {
      id: "cs-sprint-1",
      question:
        "In binary search on an array of length N, what is the value of `mid = (low + high) / 2` in standard 32-bit signed integers when low and high are near INT_MAX?",
      options: [
        "The exact arithmetic mean",
        "Causes integer overflow resulting in a negative index",
        "Automatically promoted to 64-bit integer",
        "Rounds up safely",
      ],
      correctAnswerIndex: 1,
      trapArchetypeId: "edge-case-hazards",
      trapName: "Edge Case Hazards",
      baitOptionIndex: 0,
      baitExplanation:
        "In pure math, (low + high)/2 is always the midpoint. It is easy to overlook fixed-width register limits.",
      trapExplanation:
        "Adding two large positive integers near 2^31 - 1 wraps around to a negative number in two's complement, causing an index out of bounds error. The disarmed idiom is `low + (high - low) / 2`.",
      hint: "Think about binary representation and integer overflow limits.",
      topic: "Algorithms & Data Structures",
      difficulty: "tricky",
    },
    {
      id: "cs-sprint-2",
      question:
        "Which of the following is NOT true regarding Dijkstra's shortest path algorithm?",
      options: [
        "It finds the shortest path in graphs with non-negative edge weights",
        "It runs in O((V + E) log V) with a binary min-heap",
        "It correctly detects negative cycles by returning a boolean",
        "It greedily expands the frontier node with minimum tentative distance",
      ],
      correctAnswerIndex: 2,
      trapArchetypeId: "negative-wording-maze",
      trapName: "Negative Wording Maze",
      baitOptionIndex: 0,
      baitExplanation:
        "Option 1 is the canonical textbook property of Dijkstra, prompting an eager click.",
      trapExplanation:
        "Dijkstra's algorithm does NOT handle or detect negative cycles; it can enter infinite loops or produce wrong paths on negative weights. Bellman-Ford is needed for negative cycle detection.",
      hint: "Spot the negative prompt 'NOT true'. What happens when edge weights are negative?",
      topic: "Graph Algorithms",
      difficulty: "standard",
    },
  ],
  science: [
    {
      id: "science-sprint-1",
      question:
        "A car accelerates from rest at 2 m/s² for 500 milliseconds. What is its final velocity?",
      options: ["1000 m/s", "1 m/s", "10 m/s", "0.5 m/s"],
      correctAnswerIndex: 1,
      trapArchetypeId: "units-and-scale-drift",
      trapName: "Units & Scale Drift",
      baitOptionIndex: 0,
      baitExplanation:
        "Multiplying 2 × 500 gives 1,000 m/s if you forget to convert milliseconds to seconds.",
      trapExplanation:
        "500 milliseconds is 0.50 seconds. v = u + at = 0 + (2 m/s²)(0.5 s) = 1 m/s.",
      hint: "Double check the time unit before applying kinematic formulas.",
      topic: "Physics & Mechanics",
      difficulty: "standard",
    },
    {
      id: "science-sprint-2",
      question:
        "Enzyme reaction rate is measured as substrate concentration increases. What happens when substrate is in massive excess?",
      options: [
        "Reaction rate increases exponentially",
        "Rate plateaus at Vmax due to active site saturation",
        "Enzyme completely denatures",
        "Reaction stops entirely",
      ],
      correctAnswerIndex: 1,
      trapArchetypeId: "premature-shortcut-traps",
      trapName: "Premature Shortcut Traps",
      baitOptionIndex: 0,
      baitExplanation:
        "Assuming 'more reactant always means faster reaction' is the intuitive shortcut.",
      trapExplanation:
        "At high substrate concentration, all enzyme active sites are occupied (saturation), so the rate asymptotically approaches Vmax.",
      hint: "Remember Michaelis-Menten kinetics and active site occupancy.",
      topic: "Biochemistry",
      difficulty: "standard",
    },
  ],
};

const AHA_WALKTHROUGHS: Record<string, AhaDisarmWalkthrough> = {
  "edge-case-hazards": {
    trapId: "edge-case-hazards",
    trapName: "Edge Case Hazards",
    step1Bait: {
      title: "The Tempting Illusion",
      description:
        "The problem feels clean and familiar. An algebraic simplification or straightforward iteration appears to resolve the whole question in 10 seconds.",
      baitExample:
        "Canceling (x - 2) on both sides of an equation or assuming an array has at least one element.",
      whyItTricksStudents:
        "Our brain matches patterns to standard cases and skips checking whether the boundary value breaks the initial premise.",
    },
    step2SneakyTrick: {
      title: "The Professor's Sleight of Hand",
      description:
        "Professors purposely include the 'simplification result' as distractor option A. They know 60% of students will stop calculation right there.",
      mechanism:
        "Exploiting undefined operations (0/0, division by zero, empty collections, null pointers) tucked into innocent-looking variables.",
      distractorDesign:
        "Option A is the answer you get if you ignore the restriction; Option B is the real boundary-aware solution.",
    },
    step3DetectiveRule: {
      title: "The Spot-and-Disarm Protocol",
      ruleStatement:
        "Before applying any algebraic cancellation or algorithm step, ask: 'What value would break this step?'",
      checklist: [
        "Could the denominator equal zero?",
        "Could the variable be negative or zero under a radical?",
        "What happens at the boundaries of the interval [a, b]?",
        "Is the collection or input string empty?",
      ],
      motto: "Inspect the edges before you trust the middle.",
    },
    step4DisarmChallenge: {
      title: "Disarm Challenge",
      scenario:
        "Solve for x: x² - x = 0 divided by x. A student claims x = 1 is the ONLY solution. What is the complete truth?",
      options: [
        "The student is correct, x = 1 is the sole solution",
        "Dividing by x assumes x ≠ 0; factoring gives x(x - 1) = 0, so x = 0 is a valid solution of the original equation",
        "x = -1 is the missing solution",
        "There are no solutions",
      ],
      correctAnswerIndex: 1,
      explanation:
        "Factoring x(x - 1) = 0 reveals x = 0 and x = 1. Dividing by x silently destroys the x = 0 root! You disarmed the edge case trap!",
      celebrationNote: "Spotting boundary conditions is now second nature!",
    },
  },
  "negative-wording-maze": {
    trapId: "negative-wording-maze",
    trapName: "Negative Wording Maze",
    step1Bait: {
      title: "The Familiar Fact Trap",
      description:
        "Option A is an indisputable, famous scientific fact that you memorized yesterday. You see it, smile, and bubble it in instantly.",
      baitExample:
        "'Which of the following is NOT true?' Option A: 'Mitochondria are the powerhouse of the cell.'",
      whyItTricksStudents:
        "Under exam stress, students unconsciously optimize for recognition rather than verifying the prompt's logical inversion.",
    },
    step2SneakyTrick: {
      title: "Inversion Engineering",
      description:
        "Professors place 3 perfectly true statements and 1 subtle untruth. They place the most obvious true statement at the very top.",
      mechanism:
        "Capitalized or lowercase 'NOT', 'EXCEPT', 'LEAST' buried in a long sentence.",
      distractorDesign:
        "The true statements are written with high authority to compel quick confirmation bias.",
    },
    step3DetectiveRule: {
      title: "The Spot-and-Disarm Protocol",
      ruleStatement:
        "Translate every negative prompt into a binary True/False checklist on the scratchpad.",
      checklist: [
        "Underline the negative word (NOT, EXCEPT, LEAST).",
        "Tag each option with 'T' or 'F' as you read.",
        "Your target is the sole 'F'!",
      ],
      motto: "When they ask for NOT, hunt the lone falsehood.",
    },
    step4DisarmChallenge: {
      title: "Disarm Challenge",
      scenario:
        "Which of the following is NOT a property of an ideal gas according to kinetic molecular theory?",
      options: [
        "Gas particles are in continuous, random motion (True)",
        "Collisions between gas particles are perfectly elastic (True)",
        "Intermolecular attractive forces significantly pull particles together at high pressure (False for ideal)",
        "The volume of gas molecules is negligible relative to container volume (True)",
      ],
      correctAnswerIndex: 2,
      explanation:
        "Ideal gas theory assumes zero intermolecular attraction. Option 3 describes real gas deviation, making it the correct answer to 'NOT an ideal property'!",
      celebrationNote: "Negative wording bypassed with ease!",
    },
  },
  "hidden-assumptions": {
    trapId: "hidden-assumptions",
    trapName: "Hidden Assumptions",
    step1Bait: {
      title: "The Formula Reflex",
      description:
        "You see two numbers and immediately apply the famous formula connecting them, without verifying the physical conditions.",
      baitExample:
        "Using P(A and B) = P(A) * P(B) or using conservation of momentum in an open system.",
      whyItTricksStudents:
        "Formulas feel like silver bullets. Remembering the prerequisites takes deliberate effort.",
    },
    step2SneakyTrick: {
      title: "Missing Preamble",
      description:
        "The question stem leaves out the word 'independent' or 'frictionless', testing whether you will leap into a shortcut blindly.",
      mechanism:
        "Valid formulas applied outside their validity domain produce clean, round numbers that are programmed as wrong options.",
      distractorDesign:
        "The distractor matches the formula output down to the last decimal digit.",
    },
    step3DetectiveRule: {
      title: "The Spot-and-Disarm Protocol",
      ruleStatement:
        "Before writing any formula, list its three prerequisite tags: domain, linearity, independence.",
      checklist: [
        "Does this formula require constant acceleration?",
        "Does this probability rule require mutually exclusive or independent events?",
        "Does this economic model assume perfect competition?",
      ],
      motto: "A formula without its conditions is a trap waiting to spring.",
    },
    step4DisarmChallenge: {
      title: "Disarm Challenge",
      scenario:
        "A student calculates the period of a pendulum using T = 2π√(L/g) for an oscillation release angle of 80 degrees. What is wrong?",
      options: [
        "Nothing, the formula applies to all angles",
        "The small-angle approximation (sin θ ≈ θ) breaks down at 80 degrees, so the true period will be noticeably longer",
        "Length must be divided by mass",
        "The formula only works on the moon",
      ],
      correctAnswerIndex: 1,
      explanation:
        "The formula strictly relies on the small angle approximation (typically θ < 15°). At 80°, the nonlinear restoring force makes the true period longer! You spotted the hidden assumption!",
      celebrationNote: "You caught the hidden assumption like a pro detective!",
    },
  },
  "lookalike-terms": {
    trapId: "lookalike-terms",
    trapName: "Lookalike Terms & False Synonyms",
    step1Bait: {
      title: "The Linguistic Twin",
      description:
        "Two technical terms sound nearly identical or are used interchangeably in casual conversation.",
      baitExample:
        "Conflating 'speed' (scalar) and 'velocity' (vector), or 'mass' and 'weight'.",
      whyItTricksStudents:
        "Everyday language is imprecise; exam questions demand strict mathematical definitions.",
    },
    step2SneakyTrick: {
      title: "The Twin Swap",
      description:
        "The question asks for the vector quantity, but places the scalar magnitude as Option A.",
      mechanism:
        "Subtle distinction between magnitude vs direction, sequence vs set, or rate vs total.",
      distractorDesign:
        "Both answers share the same numerical quantity, differing only in direction, sign, or terminology.",
    },
    step3DetectiveRule: {
      title: "The Spot-and-Disarm Protocol",
      ruleStatement:
        "Identify the pair: Does this concept require direction (vector), order (sequence), or scale?",
      checklist: [
        "Is it asking for velocity or speed?",
        "Is it asking for permutations (order matters) or combinations (grouping only)?",
        "Is it precision (repeatability) or accuracy (closeness to truth)?",
      ],
      motto: "Twins in sound, strangers in math.",
    },
    step4DisarmChallenge: {
      title: "Disarm Challenge",
      scenario:
        "An archer shoots 5 arrows in a tight cluster 10 cm to the right of the bullseye. How should their shots be characterized?",
      options: [
        "High accuracy and high precision",
        "High precision (repeatable cluster) but low accuracy (far from target centre)",
        "High accuracy but low precision",
        "Low precision and low accuracy",
      ],
      correctAnswerIndex: 1,
      explanation:
        "The arrows are tightly clustered together (high precision) but off-center from the bullseye (low accuracy). You mastered the distinction!",
      celebrationNote: "Lookalike terms cannot fool you anymore!",
    },
  },
};

const STORAGE_KEY_RADAR_HISTORY = "learnora_trap_immunity_radar_v1";
const STORAGE_KEY_DISARMED_TRAPS = "learnora_disarmed_traps_v1";

/**
 * Deconstruct exam paper or syllabus excerpt into professor trap archetypes.
 */
export async function deconstructExamPaper(
  textPayload?: string,
  subject?: string,
  settings?: Settings
): Promise<TrapArchetype[]> {
  const safeSubject = subject?.trim() || "General Science & Engineering";
  const cleanPayload = textPayload?.trim() || "";

  if (settings && cleanPayload.length > 20) {
    try {
      const prompt = `You are an expert exam detective analyzing this exam/syllabus text for the subject "${safeSubject}":
"""
${cleanPayload.slice(0, 3000)}
"""
Extract 6 distinct Professor Trap Archetypes (such as edge cases, negative wording, hidden assumptions, lookalike terms, unit drift, premature shortcuts) that are most dangerous for students.
Return a valid JSON array of objects with:
- "id": string (kebab-case)
- "name": string (descriptive name)
- "category": "edge_cases" | "negative_wording" | "hidden_assumptions" | "lookalike_terms" | "units_scale" | "shortcuts"
- "description": string (how professors construct the trap)
- "examplePattern": string (concrete trap example)
- "frequency": "Pervasive" | "High" | "Frequent" | "Common"
- "disarmRule": string (clear rule for students to spot and disarm it)`;

      const response = await callEdge({
        history: [{ role: "user", content: prompt }],
        mode: "quiz",
        settings,
      });

      if (response.text) {
        const jsonMatch = response.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name) {
            return parsed.map((item, idx) => ({
              id: item.id || `trap-${idx + 1}`,
              name: String(item.name || `Trap ${idx + 1}`),
              category: String(item.category || "edge_cases"),
              description: String(item.description || ""),
              examplePattern: String(item.examplePattern || ""),
              frequency: (item.frequency || "High") as TrapArchetype["frequency"],
              disarmRule: String(item.disarmRule || "Check boundary conditions carefully."),
              defaultImmunity: 60 + ((idx * 7) % 35),
            }));
          }
        }
      }
    } catch (err) {
      console.warn("[aiExamDeconstructor] Edge call failed, using offline heuristics", err);
    }
  }

  // Offline heuristic customization
  return CANONICAL_TRAP_ARCHETYPES.map((arch) => ({
    ...arch,
    description: arch.description.replace(/principles/g, `${safeSubject} principles`),
  }));
}

/**
 * Generate a challenge sprint of tricky practice questions with bait explanations and detective hints.
 */
export async function generateChallengeSprint(
  subject?: string,
  _trapArchetypes?: TrapArchetype[],
  count = 4,
  settings?: Settings
): Promise<SprintQuestion[]> {
  const normSubject = (subject || "").toLowerCase();
  let pool: SprintQuestion[] = [];

  if (
    /\bcs\b/i.test(normSubject) ||
    normSubject.includes("computer") ||
    normSubject.includes("code") ||
    normSubject.includes("algo") ||
    normSubject.includes("program") ||
    normSubject.includes("software")
  ) {
    pool = [...QUESTION_BANK.cs, ...QUESTION_BANK.math];
  } else if (
    normSubject.includes("bio") ||
    normSubject.includes("chem") ||
    normSubject.includes("phys") ||
    normSubject.includes("science")
  ) {
    pool = [...QUESTION_BANK.science, ...QUESTION_BANK.math];
  } else {
    pool = [...QUESTION_BANK.math, ...QUESTION_BANK.cs, ...QUESTION_BANK.science];
  }

  // If settings provided and online, could enhance with AI
  if (settings && count > pool.length) {
    try {
      const prompt = `Generate ${count} tricky multiple choice exam questions for subject "${subject || "STEM"}" specifically designed around professor traps.
For each question, provide:
- "id": string
- "question": string
- "options": array of 4 string options
- "correctAnswerIndex": number (0-3)
- "trapArchetypeId": string
- "trapName": string
- "baitOptionIndex": number
- "baitExplanation": string
- "trapExplanation": string
- "hint": string
- "topic": string
Return JSON array only.`;

      const response = await callEdge({
        history: [{ role: "user", content: prompt }],
        mode: "quiz",
        settings,
      });

      if (response.text) {
        const match = response.text.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.slice(0, count);
          }
        }
      }
    } catch {
      // Fallback to pool
    }
  }

  // Ensure requested count
  const result: SprintQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const q = pool[i % pool.length];
    result.push({
      ...q,
      id: `${q.id}-${i + 1}`,
    });
  }
  return result;
}

/**
 * Get the 4-step Aha! Disarm Walkthrough for a given trap archetype.
 */
export async function getAhaDisarmWalkthrough(
  trapId: string,
  _subject?: string,
  _settings?: Settings
): Promise<AhaDisarmWalkthrough> {
  const existing = AHA_WALKTHROUGHS[trapId];
  if (existing) {
    return existing;
  }

  // Find canonical or fallback
  const fallbackKey = Object.keys(AHA_WALKTHROUGHS)[0];
  const template = AHA_WALKTHROUGHS[fallbackKey];

  return {
    ...template,
    trapId,
    trapName: trapId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

// Storage helpers
export function getStoredDisarmedTraps(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DISARMED_TRAPS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function markTrapDisarmed(trapId: string): string[] {
  try {
    const current = getStoredDisarmedTraps();
    if (!current.includes(trapId)) {
      const updated = [...current, trapId];
      localStorage.setItem(STORAGE_KEY_DISARMED_TRAPS, JSON.stringify(updated));
      return updated;
    }
    return current;
  } catch {
    return [trapId];
  }
}

export function getStoredRadarHistory(): ImmunityRadarRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RADAR_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRadarRecord(record: ImmunityRadarRecord): void {
  try {
    const history = getStoredRadarHistory();
    const updated = [record, ...history.filter((r) => r.id !== record.id)].slice(0, 20);
    localStorage.setItem(STORAGE_KEY_RADAR_HISTORY, JSON.stringify(updated));
  } catch (err) {
    console.warn("[aiExamDeconstructor] Failed to save radar record", err);
  }
}
