/* Feynman AI Apprentice ('Teach-to-Master Arena') API
 *
 * Edge function caller, simulation pipeline, and session persistence for
 * the Feynman technique learning system.
 */

import { callEdge } from "./ai";

export type ApprenticePersona =
  | "curious_beginner"
  | "overconfident_peer"
  | "struggling_student";

export type FeynmanDifficulty = "beginner" | "intermediate" | "advanced";

export type ApprenticeEmotion =
  | "confused"
  | "skeptical"
  | "lightbulb"
  | "convinced";

export interface PersonaProfile {
  id: ApprenticePersona;
  name: string;
  shortName: string;
  avatar: string;
  tagline: string;
  description: string;
  traits: string[];
  challengeStyle: string;
  badgeColor: string;
}

export const PERSONA_PROFILES: Record<ApprenticePersona, PersonaProfile> = {
  curious_beginner: {
    id: "curious_beginner",
    name: "Alex, the beginner",
    shortName: "Alex",
    avatar: "🌱",
    tagline: "Keen, takes things literally, and asks 'but why?' about everything.",
    description:
      "Alex is keen but mixes up a neat comparison with how something actually works. Plain words and a good comparison go a long way.",
    traits: ["Always asks why", "Mixes up cause and coincidence", "Loves a good comparison"],
    challengeStyle: "Everyday mix-ups",
    badgeColor: "#10b981",
  },
  overconfident_peer: {
    id: "overconfident_peer",
    name: "Jordan, who thinks they know it",
    shortName: "Jordan",
    avatar: "⚡",
    tagline: "Good with the words, skips the details, waves away anything awkward.",
    description:
      "Jordan sounds convincing but skips the conditions and the working. You'll need a proper reason or an example that breaks their argument.",
    traits: ["Uses big words", "Ignores the awkward cases", "Won't back down easily"],
    challengeStyle: "Convincing half-truths",
    badgeColor: "#f59e0b",
  },
  struggling_student: {
    id: "struggling_student",
    name: "Taylor, who's struggling",
    shortName: "Taylor",
    avatar: "🧩",
    tagline: "Thrown by formulas, muddles similar words, worried about the exam.",
    description:
      "Taylor finds heavy notation off-putting and gets lost when there are lots of steps. Take it slowly, one step at a time.",
    traits: ["Put off by symbols", "Muddles similar words", "Needs it step by step"],
    challengeStyle: "One step at a time",
    badgeColor: "#8b5cf6",
  },
};

export interface Misconception {
  id: string;
  snippet: string;
  concept: string;
  explanation: string;
  misconception: string;
  correctedSnippet: string;
  hint: string;
}

export interface ApprenticeDraft {
  id: string;
  subject: string;
  topic: string;
  persona: ApprenticePersona;
  difficulty: FeynmanDifficulty;
  draftText: string;
  hiddenMisconceptions: Misconception[];
  challengeQuestion: string;
  learningObjectives: string[];
}

export interface TeachingTurn {
  id: string;
  userExplanation: string;
  apprenticeReaction: string;
  understandingScore: number; // 0 to 100
  delta: number;
  confusionPoints: string[];
  solvedPoints: string[];
  emotion: ApprenticeEmotion;
  timestamp: string;
}

export interface FeynmanFlashcardCandidate {
  front: string;
  back: string;
  rationale: string;
  concept: string;
}

export interface FeynmanDebriefReport {
  overallMastery: number; // 0 to 100
  clarityScore: number; // 0 to 100
  precisionScore: number; // 0 to 100
  pedagogicalRating:
    | "Brilliant explainer"
    | "Good explainer"
    | "Getting there"
    | "Needs a bit more practice";
  summary: string;
  conceptsMastered: string[];
  remainingGaps: string[];
  strengths: string[];
  improvementAreas: string[];
  generatedFlashcards: FeynmanFlashcardCandidate[];
}

export interface FeynmanSessionState {
  id: string;
  subject: string;
  topic: string;
  persona: ApprenticePersona;
  difficulty: FeynmanDifficulty;
  draft: ApprenticeDraft;
  turns: TeachingTurn[];
  currentScore: number;
  status: "active" | "completed";
  createdAt: string;
  updatedAt: string;
  debriefReport?: FeynmanDebriefReport;
}

/* -------------------------------------------------------------------------- */
/* Local Storage & Session Persistence                                       */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY_SESSIONS = "learnora_feynman_sessions";
const STORAGE_KEY_ACTIVE_ID = "learnora_feynman_active_id";

export function listFeynmanSessions(): FeynmanSessionState[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to load Feynman sessions from localStorage", err);
    return [];
  }
}

export function loadFeynmanSession(sessionId: string): FeynmanSessionState | null {
  const sessions = listFeynmanSessions();
  return sessions.find((s) => s.id === sessionId) ?? null;
}

export function saveFeynmanSession(session: FeynmanSessionState): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const sessions = listFeynmanSessions();
    const existingIndex = sessions.findIndex((s) => s.id === session.id);
    const updated = {
      ...session,
      updatedAt: new Date().toISOString(),
    };
    if (existingIndex >= 0) {
      sessions[existingIndex] = updated;
    } else {
      sessions.unshift(updated);
    }
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  } catch (err) {
    console.warn("Failed to save Feynman session to localStorage", err);
  }
}

export function deleteFeynmanSession(sessionId: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const sessions = listFeynmanSessions().filter((s) => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    if (getActiveFeynmanSessionId() === sessionId) {
      setActiveFeynmanSessionId(null);
    }
  } catch (err) {
    console.warn("Failed to delete Feynman session from localStorage", err);
  }
}

export function clearFeynmanSessions(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.removeItem(STORAGE_KEY_SESSIONS);
    localStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
  } catch (err) {
    console.warn("Failed to clear Feynman sessions", err);
  }
}

export function getActiveFeynmanSessionId(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
  } catch {
    return null;
  }
}

export function setActiveFeynmanSessionId(id: string | null): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
    }
  } catch {
    // Ignore storage quota errors in test environments
  }
}

/* -------------------------------------------------------------------------- */
/* Built-in Knowledge Base for High-Fidelity Apprentice Simulation           */
/* -------------------------------------------------------------------------- */

interface TopicCuratedData {
  draftTemplates: Record<ApprenticePersona, {
    draftText: string;
    misconceptions: Misconception[];
    challengeQuestion: string;
    learningObjectives: string[];
  }>;
}

const TOPIC_KNOWLEDGE_BASE: Record<string, TopicCuratedData> = {
  photosynthesis: {
    draftTemplates: {
      curious_beginner: {
        draftText:
          "Photosynthesis is how plants feed themselves! During the day, plant leaves turn green because chlorophyll absorbs sunlight to make sugar. Since plants only do photosynthesis in the daylight to breathe out oxygen, they sleep at night and don't do any respiration until the sun comes back up. Soil provides all the physical mass and organic carbon as the roots drink it up with water.",
        misconceptions: [
          {
            id: "misc-1",
            snippet: "chlorophyll absorbs sunlight to make sugar",
            concept: "Light Absorption & Color Reflection",
            explanation: "Chlorophyll absorbs blue and red wavelengths of light and reflects green light, which is why leaves appear green.",
            misconception: "Believing green light is absorbed rather than reflected.",
            correctedSnippet: "chlorophyll absorbs blue and red light (reflecting green light) to power the light-dependent reactions",
            hint: "Think about what happens to the light that bounces off the leaf into our eyes!",
          },
          {
            id: "misc-2",
            snippet: "they sleep at night and don't do any respiration until the sun comes back up",
            concept: "Plant Cellular Respiration",
            explanation: "Plants perform cellular respiration continuously (24/7), both day and night, using mitochondria to break down stored glucose.",
            misconception: "Believing plants only respire or breathe during daylight or do not respire at all.",
            correctedSnippet: "they continuously undergo cellular respiration day and night to power cellular processes",
            hint: "Do plant cells need ATP energy to survive even when it is dark outside?",
          },
          {
            id: "misc-3",
            snippet: "Soil provides all the physical mass and organic carbon as the roots drink it up with water",
            concept: "Carbon Fixation Source",
            explanation: "The vast majority of a plant's dry biomass comes from carbon dioxide (CO2) in the air fixed during the Calvin Cycle, not minerals in soil.",
            misconception: "Thinking a tree's physical mass comes from soil rather than atmospheric CO2.",
            correctedSnippet: "Carbon dioxide captured from the surrounding air provides the carbon backbone and bulk dry mass",
            hint: "Where does the carbon atom in C6H12O6 actually come from?",
          },
        ],
        challengeQuestion: "If plants make oxygen during the day, do they also need oxygen themselves to stay alive at night?",
        learningObjectives: [
          "Explain why leaves appear green (reflection vs absorption)",
          "Distinguish continuous cellular respiration from light-dependent photosynthesis",
          "Clarify atmospheric CO2 as the primary source of plant dry mass",
        ],
      },
      overconfident_peer: {
        draftText:
          "Photosynthesis is fundamentally straightforward: photons excite photosystem II, splitting H2O to generate an instantaneous proton gradient that directly synthesizes glucose without intermediate carriers. The light-independent Calvin cycle simply runs in reverse glycolysis without requiring ATP or NADPH since the photochemical reactions already did all the energetic heavy lifting.",
        misconceptions: [
          {
            id: "misc-1",
            snippet: "directly synthesizes glucose without intermediate carriers",
            concept: "Electron Transport Chain & Energy Intermediates",
            explanation: "Photons don't make glucose directly; they excite electrons transferred through an electron transport chain to produce ATP and NADPH intermediates first.",
            misconception: "Conflating light reactions directly with glucose synthesis.",
            correctedSnippet: "powers an electron transport chain to produce intermediate ATP and NADPH",
            hint: "What chemical energy carriers link the thylakoid membrane to the stroma?",
          },
          {
            id: "misc-2",
            snippet: "The light-independent Calvin cycle simply runs in reverse glycolysis without requiring ATP or NADPH",
            concept: "Calvin Cycle Energy Consumption",
            explanation: "The Calvin cycle heavily consumes ATP and NADPH to reduce 3-PGA to G3P and regenerate RuBP with the Rubisco enzyme.",
            misconception: "Assuming the Calvin Cycle is energetically passive or just reverse glycolysis.",
            correctedSnippet: "The Calvin cycle consumes substantial ATP and NADPH to fix CO2 via Rubisco and produce G3P",
            hint: "What role does the enzyme RuBisCO and ATP investment play in carbon fixation?",
          },
        ],
        challengeQuestion: "If the Calvin Cycle is called 'light-independent', why does it shut down quickly in prolonged darkness?",
        learningObjectives: [
          "Trace electron flow through PSII/PSI to NADPH and proton gradient formation",
          "Explain ATP/NADPH consumption in Calvin Cycle phase reduction and RuBP regeneration",
        ],
      },
      struggling_student: {
        draftText:
          "In photosynthesis, the plant takes in sunlight and turns it straight into energy. The formula is Sunlight + H2O = Oxygen + Food. I think the light reactions happen in the mitochondria and the dark reactions happen in the chloroplast nucleus. When there is no sunlight, the plant stops making any energy and waits.",
        misconceptions: [
          {
            id: "misc-1",
            snippet: "light reactions happen in the mitochondria and the dark reactions happen in the chloroplast nucleus",
            concept: "Organelle Locations & Anatomy",
            explanation: "All photosynthesis takes place inside chloroplasts: light reactions occur in thylakoid membranes, while dark reactions (Calvin cycle) happen in the stroma.",
            misconception: "Confusing mitochondria with chloroplasts and inventively attributing roles to chloroplast nuclei.",
            correctedSnippet: "light reactions take place in the thylakoid membranes and the Calvin cycle occurs in the stroma of chloroplasts",
            hint: "Where inside the chloroplast are the thylakoid stacks (grana) and the fluid fluid?",
          },
          {
            id: "misc-2",
            snippet: "When there is no sunlight, the plant stops making any energy and waits",
            concept: "Continuous Metabolism",
            explanation: "Plant mitochondria constantly break down stored sugars to produce ATP via cellular respiration 24 hours a day.",
            misconception: "Assuming plants only generate cellular energy when sunlight is shining.",
            correctedSnippet: "At night, the plant continues producing ATP through mitochondrial cellular respiration",
            hint: "How do living plant cells power their cellular functions in the dark?",
          },
        ],
        challengeQuestion: "Can you help me visualize step-by-step where the water and carbon dioxide enter and where the sugar actually comes out?",
        learningObjectives: [
          "Map the anatomical locations (thylakoids, stroma) within chloroplasts",
          "Clarify the balanced chemical equation for oxygen and glucose production",
        ],
      },
    },
  },
  "quantum entanglement": {
    draftTemplates: {
      curious_beginner: {
        draftText:
          "Quantum entanglement is when two particles become twins that mirror each other instantly across any distance. If you flip Particle A's spin to Up, Particle B instantly flips to Down faster than the speed of light. This means we can use entangled particles as a quantum telephone to send instant Morse code messages to astronauts on Mars without any lag!",
        misconceptions: [
          {
            id: "misc-1",
            snippet: "If you flip Particle A's spin to Up, Particle B instantly flips to Down",
            concept: "Measurement vs Active Manipulation",
            explanation: "Measuring Particle A reveals an existing correlated state; forcing or flipping Particle A breaks the entanglement rather than forcing Particle B to flip.",
            misconception: "Believing you can actively manipulate one entangled particle to remotely steer the other.",
            correctedSnippet: "Measuring Particle A collapes its probabilistic wave function, revealing a correlated outcome on Particle B upon measurement",
            hint: "What happens to the entangled quantum state if you forcefully manipulate one particle?",
          },
          {
            id: "misc-2",
            snippet: "send instant Morse code messages to astronauts on Mars without any lag",
            concept: "No-Communication Theorem",
            explanation: "Quantum entanglement cannot transmit faster-than-light information because each measurement outcome is fundamentally random without a classical key.",
            misconception: "Assuming quantum entanglement allows superluminal communication or FTL messaging.",
            correctedSnippet: "cannot transmit faster-than-light signals or classical data due to the No-Communication Theorem",
            hint: "If the outcome on Mars is completely random noise until you send them a classical decoding message, did any faster-than-light data travel?",
          },
        ],
        challengeQuestion: "Why can't Alice use her entangled photon to instantly signal a binary 1 or 0 to Bob on Alpha Centauri?",
        learningObjectives: [
          "Explain the difference between correlated measurement outcomes and active state steering",
          "Understand why the No-Communication Theorem prevents faster-than-light information transfer",
        ],
      },
      overconfident_peer: {
        draftText:
          "Entanglement is trivial: Einstein's hidden variable theory already explained it as deterministic local properties like two pairs of gloves in boxes. Bell's theorem is just a mathematical quirk about classical probability bounds that doesn't rule out local realism if you account for detector inefficiency.",
        misconceptions: [
          {
            id: "misc-1",
            snippet: "Einstein's hidden variable theory already explained it as deterministic local properties like two pairs of gloves in boxes",
            concept: "Bell's Theorem & Non-Locality",
            explanation: "Bell's Inequality tests have experimentally proven that no local hidden variable theory can account for quantum mechanical correlations.",
            misconception: "Equating quantum entanglement with simple classical hidden information (like gloves in boxes).",
            correctedSnippet: "experiments violating Bell inequalities rule out any local hidden variable explanations",
            hint: "Why do spin measurements at arbitrary non-orthogonal angles violate classical probability limits?",
          },
        ],
        challengeQuestion: "How do measurement angles in Bell test experiments prove quantum correlations exceed classical limits?",
        learningObjectives: [
          "Explain Bell's Theorem and how it experimentally disproves local hidden variables",
          "Differentiate classical correlation from quantum superposition collapse",
        ],
      },
      struggling_student: {
        draftText:
          "I think entanglement means particles have a physical invisible wire connecting them that sends radio waves between them. When one particle spins, it sends a wave to make the other spin in reverse. But I get confused why scientists say it's not physical contact.",
        misconceptions: [
          {
            id: "misc-1",
            snippet: "particles have a physical invisible wire connecting them that sends radio waves between them",
            concept: "Quantum Non-Separability",
            explanation: "Entangled particles are described by a single joint wave function, not physical signal waves or forces traveling through space between them.",
            misconception: "Imagining a physical transmission medium or radio force between entangled particles.",
            correctedSnippet: "particles are described by a unified joint quantum state without exchanging physical forces or signals",
            hint: "Is there any time delay or mediating particle between the measurements?",
          },
        ],
        challengeQuestion: "Can you explain with a simple coin or dice analogy how two particles can be connected without an invisible string?",
        learningObjectives: [
          "Demystify quantum state description without resorting to classical mechanical links",
        ],
      },
    },
  },
};

/* -------------------------------------------------------------------------- */
/* Dynamic Draft Generation Helper                                           */
/* -------------------------------------------------------------------------- */

export function generateDynamicDraft(
  subject: string,
  topic: string,
  persona: ApprenticePersona,
  difficulty: FeynmanDifficulty = "intermediate"
): ApprenticeDraft {
  const normalizedKey = topic.trim().toLowerCase();
  const match = Object.keys(TOPIC_KNOWLEDGE_BASE).find(
    (k) => normalizedKey.includes(k) || k.includes(normalizedKey)
  );

  if (match) {
    const curated = TOPIC_KNOWLEDGE_BASE[match].draftTemplates[persona];
    return {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      subject,
      topic,
      persona,
      difficulty,
      draftText: curated.draftText,
      hiddenMisconceptions: curated.misconceptions,
      challengeQuestion: curated.challengeQuestion,
      learningObjectives: curated.learningObjectives,
    };
  }

  // Procedural generator for custom arbitrary topics
  let draftText = "";
  let misconceptions: Misconception[] = [];
  let challengeQuestion = "";
  let learningObjectives: string[] = [];

  if (persona === "curious_beginner") {
    draftText = `I spent the morning studying ${topic} in ${subject}! From what I understand, ${topic} works because the primary mechanism automatically balances everything out on its own. For instance, when the main input increases, the output always multiplies proportionally without any resistance or limiting factors. Also, I assume this process only ever happens under ideal normal conditions and doesn't require any secondary regulation.`;
    misconceptions = [
      {
        id: "misc-gen-1",
        snippet: "the output always multiplies proportionally without any resistance or limiting factors",
        concept: "Rate Limiting & Boundary Conditions",
        explanation: `In ${topic}, real systems experience saturation, diminishing returns, or negative feedback limits rather than infinite proportional growth.`,
        misconception: "Assuming linear unconstrained scaling without saturation or constraints.",
        correctedSnippet: "the response is subject to saturation thresholds, equilibrium constraints, and limiting factors",
        hint: `What happens when you push the key variables of ${topic} to their maximum limit?`,
      },
      {
        id: "misc-gen-2",
        snippet: "doesn't require any secondary regulation",
        concept: "Feedback Mechanisms & Regulation",
        explanation: `${topic} relies on precise regulatory feedback loops to maintain equilibrium and prevent runaways.`,
        misconception: "Overlooking crucial regulatory controls and feedback pathways.",
        correctedSnippet: "is regulated by dynamic feedback loops and governing boundary conditions",
        hint: `How does the system know when to stop or adjust its behavior in ${topic}?`,
      },
    ];
    challengeQuestion = `If ${topic} is as simple as that, why don't real-world systems just maximize this endlessly? What holds it in check?`;
    learningObjectives = [
      `Say what actually makes ${topic} work`,
      `Explain what limits it, and what happens at the extremes`,
      `Give a real-world comparison, without the jargon`,
    ];
  } else if (persona === "overconfident_peer") {
    draftText = `${topic} in ${subject} is fundamentally an elementary concept that people overcomplicate. You just apply the foundational canonical formula and assume the standard steady-state holds unconditionally. Edge cases and transient dynamics don't meaningfully alter the outcome, so you can safely disregard microscopic fluctuations and boundary friction.`;
    misconceptions = [
      {
        id: "misc-gen-1",
        snippet: "assume the standard steady-state holds unconditionally",
        concept: "Preconditions & Steady-State Assumptions",
        explanation: `The standard formulas for ${topic} only hold when strict preconditions (e.g. equilibrium, closed system, linearity) are satisfied.`,
        misconception: "Applying idealized steady-state equations in non-equilibrium or transient regimes.",
        correctedSnippet: "the steady-state approximation is only valid under strict boundary conditions and steady influx",
        hint: `What specific assumptions must be true before the textbook equation for ${topic} applies?`,
      },
      {
        id: "misc-gen-2",
        snippet: "Edge cases and transient dynamics don't meaningfully alter the outcome",
        concept: "Transient Behaviors & Failure Modes",
        explanation: `In ${topic}, edge cases, initial transient states, and non-linearities often dominate real behavior and induce failure modes.`,
        misconception: "Dismissing non-linearities and transient phases as negligible.",
        correctedSnippet: "transient states and boundary conditions can fundamentally alter the system trajectory",
        hint: `Can you name a scenario where transient shock or an edge condition breaks the naive model of ${topic}?`,
      },
    ];
    challengeQuestion = `Prove to me why the naive textbook equation for ${topic} fails when conditions drift away from ideal equilibrium.`;
    learningObjectives = [
      `Push past the big words and explain how it really works`,
      `Spell out the conditions it relies on, and where it breaks down`,
    ];
  } else {
    // struggling_student
    draftText = `I am trying to wrap my head around ${topic} in ${subject}, but the definitions get so tangled. I know there is an input and a result, but I keep mixing up the cause and the effect. I thought the second stage happened first, and I don't understand how the core variables interact with each other without getting overwhelmed.`;
    misconceptions = [
      {
        id: "misc-gen-1",
        snippet: "I thought the second stage happened first",
        concept: "Sequential Causality & Stage Order",
        explanation: `The operational pipeline in ${topic} follows a strict logical or temporal order where earlier outputs serve as subsequent inputs.`,
        misconception: "Confusing chronological or logical ordering of core steps in the process.",
        correctedSnippet: "the initial activation step precedes and enables subsequent downstream stages",
        hint: `What is the very first event that triggers the whole chain of ${topic}?`,
      },
      {
        id: "misc-gen-2",
        snippet: "I keep mixing up the cause and the effect",
        concept: "Causal Directionality",
        explanation: `Distinguishing the driving force from the resulting consequence is essential in ${topic}.`,
        misconception: "Inverting dependent and independent variables or causal sequence.",
        correctedSnippet: "the independent driving variable causes the observed change in the system output",
        hint: `Which variable is the driver (cause) and which is the symptom (effect)?`,
      },
    ];
    challengeQuestion = `Could you walk me through ${topic} step-by-step from beginning to end, like I am 12 years old?`;
    learningObjectives = [
      `Turn the technical words into plain English`,
      `Lay out the steps in order, and why each one follows`,
    ];
  }

  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    subject,
    topic,
    persona,
    difficulty,
    draftText,
    hiddenMisconceptions: misconceptions,
    challengeQuestion,
    learningObjectives,
  };
}

/* -------------------------------------------------------------------------- */
/* AI Edge Function Simulator & Evaluator                                     */
/* -------------------------------------------------------------------------- */

export async function generateApprenticeDraft(
  subject: string,
  topic: string,
  persona: ApprenticePersona,
  difficulty: FeynmanDifficulty = "intermediate"
): Promise<ApprenticeDraft> {
  const safeSubject = subject.trim() || "Science";
  const safeTopic = topic.trim() || "Core Concepts";

  // Check if live edge call is available
  try {
    const prompt = `Generate an apprentice draft essay for the Feynman Technique teaching arena.
Subject: ${safeSubject}
Topic: ${safeTopic}
Persona: ${persona} (${PERSONA_PROFILES[persona].name})
Difficulty: ${difficulty}

Rules:
1. Write a 3-5 sentence draft representing the apprentice's flawed understanding of ${safeTopic}.
2. Include 2-3 subtle, plausible conceptual misconceptions typical of this persona.
3. Include an engaging challenge question the apprentice asks the user.
4. Write everything in plain, everyday British English aimed at a 14-18 year old. Short sentences, no academic jargon in the explanations and hints.
5. Output in valid JSON matching this schema:
{
  "draftText": "...",
  "hiddenMisconceptions": [
    {
      "id": "misc-1",
      "snippet": "exact substring in draftText",
      "concept": "concept name",
      "explanation": "why it is wrong",
      "misconception": "flawed belief",
      "correctedSnippet": "accurate version",
      "hint": "helpful clue"
    }
  ],
  "challengeQuestion": "...",
  "learningObjectives": ["..."]
}`;

    const res = await callEdge({
      history: [{ role: "user", content: prompt }],
      mode: "quiz", // JSON structured format
    });

    if (res.text && !res.refused) {
      const match = res.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.draftText && Array.isArray(parsed.hiddenMisconceptions)) {
          return {
            id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            subject: safeSubject,
            topic: safeTopic,
            persona,
            difficulty,
            draftText: parsed.draftText,
            hiddenMisconceptions: parsed.hiddenMisconceptions.map((m: any, idx: number) => ({
              id: m.id || `misc-${idx + 1}`,
              snippet: m.snippet || "",
              concept: m.concept || "Key Concept",
              explanation: m.explanation || "",
              misconception: m.misconception || "",
              correctedSnippet: m.correctedSnippet || "",
              hint: m.hint || "Think about the foundational mechanism.",
            })),
            challengeQuestion: parsed.challengeQuestion || "How does this actually work step-by-step?",
            learningObjectives: Array.isArray(parsed.learningObjectives) ? parsed.learningObjectives : [
              `Master core principles of ${safeTopic}`,
              `Clarify underlying mechanisms and misconceptions`,
            ],
          };
        }
      }
    }
  } catch {
    // Fall back to robust simulation knowledge base
  }

  return generateDynamicDraft(safeSubject, safeTopic, persona, difficulty);
}

export async function evaluateTeachingExplanation(
  draft: ApprenticeDraft,
  history: TeachingTurn[],
  explanation: string,
  persona: ApprenticePersona = draft.persona
): Promise<TeachingTurn> {
  const trimmed = explanation.trim();
  const lowerExp = trimmed.toLowerCase();

  // Prior score baseline
  const previousScore =
    history.length > 0 ? history[history.length - 1].understandingScore : 20;

  // Analysis of student's explanation
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const hasAnalogy =
    lowerExp.includes("like a") ||
    lowerExp.includes("imagine") ||
    lowerExp.includes("analogy") ||
    lowerExp.includes("similar to") ||
    lowerExp.includes("for example") ||
    lowerExp.includes("think of");
  const hasStepByStep =
    lowerExp.includes("first") ||
    lowerExp.includes("step") ||
    lowerExp.includes("second") ||
    lowerExp.includes("then") ||
    lowerExp.includes("finally") ||
    lowerExp.includes("because");
  const hasContrast =
    lowerExp.includes("instead of") ||
    lowerExp.includes("not") ||
    lowerExp.includes("difference") ||
    lowerExp.includes("rather than") ||
    lowerExp.includes("reflect") ||
    lowerExp.includes("absorb");

  // Determine which misconceptions in the draft were addressed
  const newlySolved: string[] = [];
  const remainingConfusion: string[] = [];

  draft.hiddenMisconceptions.forEach((misc) => {
    const conceptTerms = misc.concept.toLowerCase().split(/\s+/);
    const explTerms = misc.explanation.toLowerCase().split(/\s+/);
    const keywords = [...conceptTerms, ...explTerms].filter((w) => w.length > 4);

    const hitCount = keywords.filter((kw) => lowerExp.includes(kw)).length;
    const isSnippetMentioned =
      misc.snippet.length > 0 &&
      (lowerExp.includes(misc.snippet.toLowerCase()) ||
        misc.snippet
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 4)
          .some((w) => lowerExp.includes(w)));

    /* Was also `|| (wordCount > 35 && hasStepByStep)` — a long, sequenced-
       sounding answer ("...then...because...") tripped that for every
       misconception in this loop, independent of whether the answer said
       anything about THIS one. A student explaining just the general
       process at length got every listed misconception credited, including
       ones they never touched. Credit now requires actual topical overlap
       with this specific misconception's own terms or snippet. */
    if (hitCount >= 2 || (isSnippetMentioned && wordCount > 12)) {
      newlySolved.push(misc.concept);
    } else {
      remainingConfusion.push(misc.concept);
    }
  });

  // Calculate score delta
  let scoreDelta = 0;
  if (wordCount < 6) {
    scoreDelta = 3; // minimal effort
  } else {
    scoreDelta = 12;
    if (wordCount > 20) scoreDelta += 6;
    if (hasAnalogy) scoreDelta += 8;
    if (hasStepByStep) scoreDelta += 7;
    if (hasContrast) scoreDelta += 5;
    if (newlySolved.length > 0) scoreDelta += newlySolved.length * 10;
  }

  // Persona responsiveness adjustments
  if (persona === "overconfident_peer" && !hasContrast && !hasStepByStep) {
    scoreDelta = Math.max(5, scoreDelta - 8); // Jordan resists hand-wavy explanations
  } else if (persona === "struggling_student" && hasStepByStep) {
    scoreDelta += 6; // Taylor loves step-by-step breakdowns
  } else if (persona === "curious_beginner" && hasAnalogy) {
    scoreDelta += 6; // Alex loves analogies
  }

  const newScore = Math.min(100, Math.max(previousScore + 5, previousScore + scoreDelta));
  const effectiveDelta = newScore - previousScore;

  // Determine emotional state
  let emotion: ApprenticeEmotion = "confused";
  if (newScore >= 88) {
    emotion = "convinced";
  } else if (newScore >= 65) {
    emotion = "lightbulb";
  } else if (persona === "overconfident_peer" && newScore < 60) {
    emotion = "skeptical";
  } else if (newScore >= 45) {
    emotion = "skeptical";
  } else {
    emotion = "confused";
  }

  // Craft reactive apprentice reaction in persona voice
  let reaction = "";
  if (persona === "curious_beginner") {
    if (newScore >= 85) {
      reaction = `💡 "OHHH! It clicked! When you said '${trimmed.slice(0, 45)}...', that made total sense! So the real mechanism isn't what I originally drafted at all. I can see why ${draft.topic} works this way now!"`;
    } else if (newScore >= 60) {
      reaction = `🌱 "Wait, that's fascinating! So you're saying that ${newlySolved[0] ? newlySolved[0] : "the process"} happens because of that mechanism? But wait, what about when ${draft.challengeQuestion.toLowerCase().slice(0, 50)}?"`;
    } else {
      reaction = `🤔 "Hmm, I think I follow the general idea, but my brain is still a little fuzzy on why my original thought was wrong. Could you explain with a simple everyday metaphor or comparison?"`;
    }
  } else if (persona === "overconfident_peer") {
    if (newScore >= 85) {
      reaction = `🎓 "Alright, I'll concede that. Your breakdown of '${trimmed.slice(0, 45)}...' cleanly isolates the boundary conditions and edge cases I overlooked. That's a rigorous way to think about ${draft.topic}."`;
    } else if (newScore >= 60) {
      reaction = `🤨 "Fair point on the underlying principle, but aren't you glossing over the edge case? How do you mathematically or logically reconcile that with ${draft.challengeQuestion.slice(0, 45)}?"`;
    } else {
      reaction = `🤨 "I'm still not convinced. That feels too hand-wavy. In my draft, the standard definition accounts for that unless you can prove a specific counter-example."`;
    }
  } else {
    // struggling_student
    if (newScore >= 85) {
      reaction = `💡 "Thank you so much! Breaking it down like that made the whole puzzle fall into place. I'm not scared of getting tested on ${draft.topic} now!"`;
    } else if (newScore >= 60) {
      reaction = `🧩 "Oh! That step makes sense now. Let me repeat it to make sure I got it right: so the first part leads into the second part because of that principle? What should I watch out for next?"`;
    } else {
      reaction = `🤔 "I think I understand the words, but when I try to picture it, I get mixed up. Can you walk me through it step 1, step 2, step 3 without using too many complex terms?"`;
    }
  }

  return {
    id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userExplanation: trimmed,
    apprenticeReaction: reaction,
    understandingScore: newScore,
    delta: effectiveDelta,
    confusionPoints: remainingConfusion.length > 0 ? remainingConfusion : ["Subtle edge nuances"],
    solvedPoints: newlySolved.length > 0 ? newlySolved : ["Initial concept recognition"],
    emotion,
    timestamp: new Date().toISOString(),
  };
}

export async function generateFeynmanDebrief(
  draft: ApprenticeDraft,
  turns: TeachingTurn[],
  persona: ApprenticePersona = draft.persona
): Promise<FeynmanDebriefReport> {
  const finalScore = turns.length > 0 ? turns[turns.length - 1].understandingScore : 30;
  const totalTurns = turns.length;

  // Evaluate clarity & precision based on teaching turns
  let totalWords = 0;
  let analogyCount = 0;
  let stepByStepCount = 0;
  const allSolved = new Set<string>();

  turns.forEach((turn) => {
    const text = turn.userExplanation.toLowerCase();
    totalWords += text.split(/\s+/).length;
    if (text.includes("like") || text.includes("imagine") || text.includes("analogy") || text.includes("example")) {
      analogyCount++;
    }
    if (text.includes("step") || text.includes("first") || text.includes("because") || text.includes("therefore")) {
      stepByStepCount++;
    }
    turn.solvedPoints.forEach((p) => allSolved.add(p));
  });

  const avgWordsPerTurn = totalTurns > 0 ? totalWords / totalTurns : 0;
  const clarityScore = Math.min(
    100,
    Math.round(40 + analogyCount * 18 + (avgWordsPerTurn > 25 ? 20 : 10) + (finalScore * 0.2))
  );
  const precisionScore = Math.min(
    100,
    Math.round(35 + stepByStepCount * 16 + allSolved.size * 12 + (finalScore * 0.25))
  );

  const overallMastery = Math.min(100, Math.round((finalScore * 0.5) + (clarityScore * 0.25) + (precisionScore * 0.25)));

  let pedagogicalRating: FeynmanDebriefReport["pedagogicalRating"] = "Getting there";
  if (overallMastery >= 90) {
    pedagogicalRating = "Brilliant explainer";
  } else if (overallMastery >= 75) {
    pedagogicalRating = "Good explainer";
  } else if (overallMastery >= 55) {
    pedagogicalRating = "Getting there";
  } else {
    pedagogicalRating = "Needs a bit more practice";
  }

  // Mastered concepts vs remaining gaps
  const conceptsMastered: string[] = [];
  const remainingGaps: string[] = [];

  draft.hiddenMisconceptions.forEach((m) => {
    if (allSolved.has(m.concept) || overallMastery >= 80) {
      conceptsMastered.push(`${m.concept}: ${m.explanation}`);
    } else {
      remainingGaps.push(`${m.concept}: Watch out for misconception - "${m.misconception}"`);
    }
  });

  if (conceptsMastered.length === 0) {
    conceptsMastered.push(`Core structural definitions of ${draft.topic}`);
  }

  // Strengths & Improvement Areas
  const strengths: string[] = [];
  if (analogyCount > 0) strengths.push("You used comparisons that made the idea easy to picture");
  if (stepByStepCount > 0) strengths.push("You took it in order, so the cause and effect were clear");
  if (overallMastery >= 75) strengths.push(`You talked ${PERSONA_PROFILES[persona].shortName} round on things they were stuck on`);
  if (strengths.length === 0) strengths.push("You stuck with it and explained the key words properly");

  const improvementAreas: string[] = [];
  if (analogyCount === 0) improvementAreas.push("Try a real-world comparison to make the abstract bits land");
  if (stepByStepCount === 0) improvementAreas.push("Break the longer explanations into numbered steps");
  if (remainingGaps.length > 0) improvementAreas.push("Say more about the awkward cases where the rule stops working");
  if (improvementAreas.length === 0) improvementAreas.push("Try explaining to Jordan next — they push back harder");

  // Targeted Flashcards based on session discoveries
  const generatedFlashcards: FeynmanFlashcardCandidate[] = draft.hiddenMisconceptions.map((m) => ({
    front: `In ${draft.topic}, what is the common misconception regarding "${m.snippet}"?`,
    back: `${m.explanation}\n\nAccurate understanding: ${m.correctedSnippet}`,
    rationale: `From the session where you explained this to ${PERSONA_PROFILES[persona].name}.`,
    concept: m.concept,
  }));

  if (generatedFlashcards.length === 0) {
    generatedFlashcards.push({
      front: `What is the core principle of ${draft.topic}?`,
      back: `${draft.topic} governs key relationships in ${draft.subject} via systematic interactions and constraints.`,
      rationale: "Made from the session where you explained this out loud.",
      concept: draft.topic,
    });
  }

  const summary = `You explained "${draft.topic}" to ${PERSONA_PROFILES[persona].name}. Over ${totalTurns} message${totalTurns === 1 ? "" : "s"} you took them from 20% to ${finalScore}%. On this showing, you're a ${pedagogicalRating.toLowerCase()}.`;

  return {
    overallMastery,
    clarityScore,
    precisionScore,
    pedagogicalRating,
    summary,
    conceptsMastered,
    remainingGaps,
    strengths,
    improvementAreas,
    generatedFlashcards,
  };
}
