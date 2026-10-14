import { callEdge } from "./ai";
import { extractJSON } from "../lib/aiJson";
import { collection } from "../lib/storage";
import type { Settings } from "../lib/settings";
import { fenceUntrusted } from "../lib/actionTags";
import { getKnownMisconception, type KnownMisconception } from "../lib/misconceptionCatalogue";
import type { BankQuestion } from "../lib/questionBank";
import { bankTopicTitle, fetchMisconceptionMappedQuestions } from "./questionBank";

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
  /** Where it came from. Built-in and bank questions were written and
   *  checked by people; an AI one was not, and its bait is weaker evidence. */
  source?: "builtin" | "bank" | "ai";
  /** The catalogue misconception the bait option is mapped to (bank
   *  questions), so the ledger files it under the app's shared concept. */
  misconceptionId?: string;
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
    name: "Edge cases",
    category: "edge_cases",
    description:
      "Examiners pick awkward values — zero, negatives, the very end of a range — where the usual method quietly stops working.",
    examplePattern:
      "Dividing both sides by (x − 1) without checking whether x could be 1.",
    frequency: "Pervasive",
    disarmRule:
      "Before you commit, try 0, 1 and a negative number in your answer.",
  },
  {
    id: "negative-wording-maze",
    name: "NOT and EXCEPT questions",
    category: "negative_wording",
    description:
      "Words like NOT, EXCEPT or LEAST are slipped into the question, so the first true-sounding answer is the wrong one.",
    examplePattern:
      "Three true statements and one false one, when the question asks 'Which of these is NOT correct?'",
    frequency: "High",
    disarmRule:
      "Circle the NOT or EXCEPT straight away, then look for the one false statement.",
  },
  {
    id: "hidden-assumptions",
    name: "Hidden assumptions",
    category: "hidden_assumptions",
    description:
      "The question relies on something it never says — no friction, constant temperature, a fair coin — and your answer changes if it isn't true.",
    examplePattern:
      "Treating two events as independent when the question hints that one affects the other.",
    frequency: "Frequent",
    disarmRule:
      "Ask what your method needs to be true, and check the question actually says so.",
  },
  {
    id: "lookalike-terms",
    name: "Lookalike words",
    category: "lookalike_terms",
    description:
      "Two words sound alike but mean different things, and the question tests whether you know the difference.",
    examplePattern:
      "Mixing up mass and weight, accuracy and precision, or mitosis and meiosis.",
    frequency: "Common",
    disarmRule:
      "Say the one thing that makes each word different before you answer.",
  },
  {
    id: "units-and-scale-drift",
    name: "Unit mix-ups",
    category: "units_scale",
    description:
      "Numbers come in different units — grams and kilograms, minutes and seconds — so the right method gives the wrong number.",
    examplePattern:
      "Working out kinetic energy with the mass in grams, giving an answer 1,000 times too big.",
    frequency: "High",
    disarmRule:
      "Convert everything to standard units in the margin before you use a formula.",
  },
  {
    id: "premature-shortcut-traps",
    name: "Too-easy shortcuts",
    category: "shortcuts",
    description:
      "A quick shortcut that works on easy questions but breaks on harder ones.",
    examplePattern:
      "Assuming the steepest part of a graph must be its highest point.",
    frequency: "Frequent",
    disarmRule:
      "If an answer came too easily, spend ten seconds checking it against an example.",
  },
  {
    id: "common-misconceptions",
    name: "Common misconceptions",
    category: "misconceptions",
    description:
      "A wrong option written to match a belief many students hold, so it feels right before you think it through.",
    examplePattern:
      "Offering \"higher pH means more acidic\" next to the right answer.",
    frequency: "Pervasive",
    disarmRule:
      "Before you choose, ask whether the option is what is true or what most people think is true.",
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
      trapName: "Edge cases",
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
      trapName: "NOT and EXCEPT questions",
      baitOptionIndex: 0,
      baitExplanation:
        "The Extreme Value Theorem guarantees a maximum and minimum on a closed interval, so that familiar statement jumps out and gets picked before the NOT is read.",
      trapExplanation:
        "The question asked which is NOT necessarily true. Continuity does not give a derivative anywhere: the Weierstrass function is continuous everywhere and differentiable nowhere. (|x| only shows a single corner; it is differentiable everywhere else.) The other three are the Extreme Value Theorem, the Intermediate Value Theorem and boundedness, all guaranteed.",
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
      trapName: "Lookalike words",
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
      trapName: "Hidden assumptions",
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
      trapName: "Edge cases",
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
      trapName: "NOT and EXCEPT questions",
      baitOptionIndex: 0,
      baitExplanation:
        "\"Finds shortest paths with non-negative weights\" is the textbook description of Dijkstra, so it gets an eager click, but it is true, and the question asks for the false one.",
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
      trapName: "Unit mix-ups",
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
      trapName: "Too-easy shortcuts",
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
    trapName: "Edge cases",
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
    trapName: "NOT and EXCEPT questions",
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
    trapName: "Hidden assumptions",
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
    trapName: "Lookalike words",
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

const TRAP_FOR_CATEGORY: Record<string, string> = {
  edge_cases: "edge-case-hazards",
  negative_wording: "negative-wording-maze",
  hidden_assumptions: "hidden-assumptions",
  lookalike_terms: "lookalike-terms",
  units_scale: "units-and-scale-drift",
  shortcuts: "premature-shortcut-traps",
};

const STORAGE_KEY_RADAR_HISTORY = "learnora_trap_immunity_radar_v1";
const STORAGE_KEY_DISARMED_TRAPS = "learnora_disarmed_traps_v1";

/**
 * Deconstruct exam paper or syllabus excerpt into professor trap archetypes.
 *
 * `fromMaterial` is false when the standard patterns came back instead (too
 * little text to read, or the AI call failed). The hub must say so: a stock
 * list is not a finding about the student's paper.
 */
export async function deconstructExamPaper(
  textPayload?: string,
  subject?: string,
  settings?: Settings,
): Promise<{ archetypes: TrapArchetype[]; fromMaterial: boolean }> {
  const safeSubject = subject?.trim() || "General Science & Engineering";
  const cleanPayload = textPayload?.trim() || "";

  if (settings && cleanPayload.length > 20) {
    try {
      const prompt = `You are an expert exam detective analyzing this exam/syllabus text for the subject ${fenceUntrusted(safeSubject)}:
${fenceUntrusted(cleanPayload.slice(0, 3000))}
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
        tool: "examDeconstructor",
        settings,
      });

      if (response.text) {
        const parsed = extractJSON<any[]>(response.text);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name) {
          /* Each card takes its category's trap id (suffixed when two share
             one), so "See how to spot it" opens that category's walkthrough
             and sprint progress shows on the card. A free-form id matched
             nothing and showed the edge-case walkthrough under its name. */
          const used = new Set<string>();
          const archetypes = parsed.map((item, idx) => ({
            id: (() => {
              const base = TRAP_FOR_CATEGORY[String(item.category)] ?? "edge-case-hazards";
              const id = used.has(base) ? `${base}-${idx + 1}` : base;
              used.add(id);
              return id;
            })(),
            name: String(item.name || `Trap ${idx + 1}`),
            category: String(item.category || "edge_cases"),
            description: String(item.description || ""),
            examplePattern: String(item.examplePattern || ""),
            frequency: (item.frequency ||
              "High") as TrapArchetype["frequency"],
            disarmRule: String(
              item.disarmRule || "Check boundary conditions carefully.",
            ),
          }));
          return { archetypes, fromMaterial: true };
        }
      }
    } catch (err) {
      console.warn(
        "[aiExamDeconstructor] Edge call failed, using offline heuristics",
        err,
      );
    }
  }

  // The standard patterns, labelled as such by the caller.
  return {
    archetypes: CANONICAL_TRAP_ARCHETYPES.map((arch) => ({
      ...arch,
      description: arch.description.replace(
        /principles/g,
        `${safeSubject} principles`,
      ),
    })),
    fromMaterial: false,
  };
}

/** The built-in pool for a subject, or null when it has none. Only the
 *  subject's own questions: a History or Maths sprint padded with CS and
 *  physics questions tests the wrong thing, and every bait answer in it was
 *  filed in the ledger under the student's subject. */
function builtinPoolFor(subject: string): SprintQuestion[] | null {
  const s = subject.toLowerCase();
  if (/\bcs\b/.test(s) || /comput|coding|algorithm|program|software/.test(s)) return QUESTION_BANK.cs;
  if (/bio|chem|phys|science/.test(s)) return QUESTION_BANK.science;
  if (/math|algebra|calcul|geometr|statistic|probab|trig|arithmetic|combinator/.test(s)) return QUESTION_BANK.math;
  return null;
}

/** Which catalogue subjects a student's subject covers. */
function catalogueSubjectsFor(subject: string): Set<KnownMisconception["subject"]> {
  const s = subject.toLowerCase();
  const out = new Set<KnownMisconception["subject"]>();
  if (/bio/.test(s)) out.add("Biology");
  if (/chem/.test(s)) out.add("Chemistry");
  if (/phys/.test(s)) out.add("Physics");
  if (/math|algebra|calcul|geometr|statistic|probab|trig|arithmetic/.test(s)) out.add("Mathematics");
  if (/science/.test(s) && out.size === 0) {
    out.add("Biology");
    out.add("Chemistry");
    out.add("Physics");
  }
  return out;
}

/** Bank questions as sprint questions: the option mapped to a catalogue
 *  misconception is the bait, and the catalogue says why it looks right and
 *  why it is wrong. Only misconceptions in the student's subject. Pure. */
export function sprintFromBank(rows: readonly BankQuestion[], subject: string): SprintQuestion[] {
  const subjects = catalogueSubjectsFor(subject);
  if (subjects.size === 0) return [];
  const out: SprintQuestion[] = [];
  for (const row of rows) {
    if (row.answer_type === "numeric" || row.choices.length < 3) continue;
    const mapped = row.distractor_misconceptions ?? [];
    const bait = mapped.findIndex((id, i) => !!id && i !== row.correct_index);
    if (bait < 0) continue;
    const entry = getKnownMisconception(mapped[bait]!);
    if (!entry || !subjects.has(entry.subject)) continue;
    out.push({
      id: `bank-${row.id}`,
      question: row.question,
      options: [...row.choices],
      correctAnswerIndex: row.correct_index,
      trapArchetypeId: "common-misconceptions",
      trapName: entry.concept,
      baitOptionIndex: bait,
      baitExplanation: `It matches a belief many students hold: ${entry.belief}`,
      trapExplanation: [entry.whyWrong, row.explanation].filter(Boolean).join(" "),
      hint: "One option says what a lot of people think. Check it against what you know is true.",
      topic: bankTopicTitle(row.spec_key, row.topic_ref) ?? entry.concept,
      source: "bank",
      misconceptionId: entry.id,
    });
  }
  return out;
}

const KNOWN_TRAPS = new Set(CANONICAL_TRAP_ARCHETYPES.map((t) => t.id));

/** An AI-written sprint question, or null when it can't be marked: options
 *  missing or repeated, an index out of range, a bait that is the answer, or
 *  a trap type the playbook doesn't know. */
function validSprintQuestion(raw: unknown, i: number): SprintQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const question = str(r.question);
  const options = Array.isArray(r.options) ? r.options.map(str) : [];
  const correct = Number(r.correctAnswerIndex);
  const bait = Number(r.baitOptionIndex);
  const trapId = str(r.trapArchetypeId);
  if (!question || options.length < 3 || options.some((o) => !o)) return null;
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null;
  const inRange = (n: number) => Number.isInteger(n) && n >= 0 && n < options.length;
  if (!inRange(correct) || !inRange(bait) || correct === bait) return null;
  if (!KNOWN_TRAPS.has(trapId) || trapId === "common-misconceptions") return null;
  return {
    id: str(r.id) || `ai-sprint-${i + 1}`,
    question,
    options,
    correctAnswerIndex: correct,
    trapArchetypeId: trapId,
    trapName: str(r.trapName) || CANONICAL_TRAP_ARCHETYPES.find((t) => t.id === trapId)!.name,
    baitOptionIndex: bait,
    baitExplanation: str(r.baitExplanation),
    trapExplanation: str(r.trapExplanation),
    hint: str(r.hint),
    ...(str(r.topic) ? { topic: str(r.topic) } : {}),
    source: "ai",
  };
}

/** The options in a random order, with both indices following them. Every
 *  built-in question was written with the bait first, so unshuffled the trap
 *  was always option A. */
function shuffleOptions(q: SprintQuestion, random: () => number): SprintQuestion {
  const order = shuffled(
    q.options.map((_, i) => i),
    random,
  );
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correctAnswerIndex: order.indexOf(q.correctAnswerIndex),
    baitOptionIndex: order.indexOf(q.baitOptionIndex),
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A challenge sprint: tricky questions whose wrong options are built around
 * named traps, each with the belief that makes the bait look right.
 *
 * Sources, best first, never mixing in another subject:
 *   1. the practice bank's questions with a wrong option mapped to a
 *      catalogue misconception (written and checked by people);
 *   2. the built-in pool for the subject;
 *   3. AI-written questions, checked for shape before use, when 1 and 2 are
 *      short.
 * Never the same question twice (a repeat would file one bait answer as a
 * recurring misconception). A shorter sprint beats padding; none at all
 * throws, and the hub says so.
 */
export async function generateChallengeSprint(
  subject?: string,
  _trapArchetypes?: TrapArchetype[],
  count = 4,
  settings?: Settings,
  random: () => number = Math.random,
): Promise<SprintQuestion[]> {
  const label = subject?.trim() ?? "";
  const picked: SprintQuestion[] = [];
  const add = (q: SprintQuestion) => {
    if (picked.length < count && !picked.some((p) => p.question === q.question)) picked.push(q);
  };

  let bank: SprintQuestion[] = [];
  try {
    bank = sprintFromBank(await fetchMisconceptionMappedQuestions(), label);
  } catch (err) {
    console.warn("[detective] practice bank unavailable:", err);
  }
  shuffled(bank, random).forEach(add);
  (builtinPoolFor(label) ?? []).forEach((q) => add({ ...q, source: "builtin" }));

  if (settings && picked.length < count) {
    try {
      const wanted = count - picked.length;
      const trapIds = CANONICAL_TRAP_ARCHETYPES.filter((t) => t.id !== "common-misconceptions")
        .map((t) => `"${t.id}"`)
        .join(", ");
      const prompt = `Generate ${wanted} tricky multiple choice exam questions for the subject below, each built around one professor trap.
Subject: ${fenceUntrusted(label || "STEM")}
For each question, provide:
- "id": string
- "question": string
- "options": array of 4 different string options
- "correctAnswerIndex": number (0-3)
- "trapArchetypeId": one of ${trapIds}
- "trapName": string
- "baitOptionIndex": number (0-3), the option the trap makes look right; never the correct one
- "baitExplanation": string, why the bait looks right (never refer to option letters or positions)
- "trapExplanation": string, why the right answer is right
- "hint": string that does not give the answer away
- "topic": string
Return JSON array only.`;

      const response = await callEdge({
        history: [{ role: "user", content: prompt }],
        mode: "quiz",
        tool: "examDeconstructor",
        settings,
      });
      const parsed = response.text ? extractJSON<unknown[]>(response.text) : null;
      if (Array.isArray(parsed)) {
        parsed.forEach((raw, i) => {
          const q = validSprintQuestion(raw, i);
          if (q) add(q);
        });
      }
    } catch (err) {
      console.warn("[detective] AI sprint unavailable:", err);
    }
  }

  if (picked.length === 0) {
    throw new Error(`Couldn't put together a sprint for ${label || "that subject"} just now. Try again in a minute.`);
  }
  return picked.map((q, i) => shuffleOptions({ ...q, id: `${q.id}-${i + 1}` }, random));
}

/**
 * Get the 4-step Aha! Disarm Walkthrough for a given trap archetype.
 */
export async function getAhaDisarmWalkthrough(
  trapId: string,
  _subject?: string,
  _settings?: Settings,
): Promise<AhaDisarmWalkthrough> {
  /* A playbook card from a paper analysis carries its category's trap id,
     with a suffix when two cards share a category. */
  const existing = AHA_WALKTHROUGHS[trapId] ?? AHA_WALKTHROUGHS[trapId.replace(/-\d+$/, "")];
  if (existing) {
    return existing;
  }

  /* A bank question's bait is a catalogue misconception: the catalogue has
     the belief, why it is wrong, the re-teach and a check question. */
  const entry = getKnownMisconception(trapId);
  if (entry) return walkthroughFromCatalogue(entry);
  if (trapId === "common-misconceptions") {
    const example = getKnownMisconception("chem-higher-ph-more-acidic");
    if (example) return { ...walkthroughFromCatalogue(example), trapId, trapName: "Common misconceptions" };
  }

  // Find canonical or fallback
  const fallbackKey = Object.keys(AHA_WALKTHROUGHS)[0];
  const template = AHA_WALKTHROUGHS[fallbackKey];

  return {
    ...template,
    trapId,
    trapName: trapId
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

function walkthroughFromCatalogue(entry: KnownMisconception): AhaDisarmWalkthrough {
  return {
    trapId: entry.id,
    trapName: entry.concept,
    step1Bait: {
      title: "The bait",
      description: "One option is written to match what many students already believe.",
      baitExample: entry.belief,
      whyItTricksStudents: "It feels familiar, because it is how a lot of people first picture the idea.",
    },
    step2SneakyTrick: {
      title: "Why it's wrong",
      mechanism: entry.whyWrong,
      distractorDesign: `Examiners offer this belief as an option because it is so common (${entry.category.toLowerCase()}).`,
    },
    step3DetectiveRule: {
      title: "The right idea",
      ruleStatement: entry.remediation,
      checklist: [
        "Name the idea the question is really testing.",
        "Ask whether the tempting option is what is true, or what people think is true.",
        "Check it against one fact you are sure of.",
      ],
      motto: "Familiar isn't the same as right.",
    },
    step4DisarmChallenge: {
      title: "Check yourself",
      scenario: entry.check.question,
      options: [...entry.check.choices],
      correctAnswerIndex: entry.check.correctIndex,
      explanation: entry.check.explanation,
      celebrationNote: "That's the right idea, not just the familiar one.",
    },
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

/** A trap the student fell for again is not disarmed any more. */
export function markTrapArmed(trapId: string): string[] {
  try {
    const updated = getStoredDisarmedTraps().filter((id) => id !== trapId);
    localStorage.setItem(STORAGE_KEY_DISARMED_TRAPS, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

const radarStore = collection<ImmunityRadarRecord>(
  STORAGE_KEY_RADAR_HISTORY,
  (record) => record.id,
  { limit: 20 },
);

export function getStoredRadarHistory(): ImmunityRadarRecord[] {
  return radarStore.list();
}

export function saveRadarRecord(record: ImmunityRadarRecord): void {
  radarStore.save(record);
}
