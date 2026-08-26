import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import {
  buildDiagnosticPrompt,
  buildMicroRepairPrompt,
  clearTraceHistory,
  deleteTrace,
  diagnoseCognitiveGap,
  generateMicroRepair,
  getSavedRepairs,
  getSavedTraceById,
  getSavedTraces,
  recordRepairSuccess,
  saveRepair,
  saveTrace,
  STORAGE_KEY_REPAIRS,
  STORAGE_KEY_TRACES,
  type CognitiveStackTrace,
  type MicroRepairChallenge,
} from "./aiDebugger";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;

describe("aiDebugger API", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Prompt builders", () => {
    it("builds a diagnostic prompt with subject, mistake and context", () => {
      const prompt = buildDiagnosticPrompt(
        "Calculus",
        "Failed derivative of sin(x^2)",
        "Attempted cos(x^2)",
      );
      expect(prompt).toContain("Calculus");
      expect(prompt).toContain("Failed derivative of sin(x^2)");
      expect(prompt).toContain("Attempted cos(x^2)");
      expect(prompt).toContain("Level 3 (Surface Problem)");
      expect(prompt).toContain("Level 1 (Root Foundation)");
    });

    it("builds a micro-repair prompt for a root concept", () => {
      const prompt = buildMicroRepairPrompt("Chain Rule Functional Composition");
      expect(prompt).toContain("Chain Rule Functional Composition");
      expect(prompt).toContain("60-second");
      expect(prompt).toContain("intuitionSummary");
    });
  });

  describe("diagnoseCognitiveGap", () => {
    it("parses valid AI JSON response and returns a 3-layer Mental Stack Trace", async () => {
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({
            text: JSON.stringify({
              rootCauseSummary:
                "Confusion between outer function differentiation and the inner derivative multiplier.",
              layers: [
                {
                  level: 3,
                  concept: "Chain Rule Application on sin(x^2)",
                  status: "severed",
                  explanation: "Missed multiplying by 2x derivative of inner term.",
                  prerequisiteOf: "Calculus Exam Problem",
                },
                {
                  level: 2,
                  concept: "Composite Function Rate Multiplication",
                  status: "shaky",
                  explanation: "Treated inner argument x^2 as a static variable.",
                  prerequisiteOf: "Chain Rule Application",
                },
                {
                  level: 1,
                  concept: "Functional Composition & Intermediate Change",
                  status: "severed",
                  explanation: "Lacking intuition that change in input ripples through the nested layer.",
                  prerequisiteOf: "Composite Function Rate Multiplication",
                },
              ],
            }),
          }),
        ),
      );

      const trace = await diagnoseCognitiveGap(
        "Calculus",
        "Failed derivative of sin(x^2)",
        "Got cos(x^2)",
      );

      expect(trace.id).toBeDefined();
      expect(trace.subject).toBe("Calculus");
      expect(trace.failedQuestionOrTopic).toBe("Failed derivative of sin(x^2)");
      expect(trace.rootCauseSummary).toContain("outer function differentiation");
      expect(trace.layers).toHaveLength(3);
      expect(trace.layers[0].level).toBe(3);
      expect(trace.layers[0].status).toBe("severed");
      expect(trace.layers[1].level).toBe(2);
      expect(trace.layers[2].level).toBe(1);
      expect(trace.layers[2].concept).toBe("Functional Composition & Intermediate Change");

      // Verify cached in localStorage
      const saved = getSavedTraceById(trace.id);
      expect(saved).not.toBeNull();
      expect(saved?.id).toBe(trace.id);
    });

    it("handles fenced JSON responses cleanly", async () => {
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({
            text: "```json\n" +
              JSON.stringify({
                rootCauseSummary: "Base case recursion omitted.",
                layers: [
                  {
                    level: 3,
                    concept: "Stack Overflow in Factorial",
                    status: "severed",
                    explanation: "Infinite loop occurs.",
                  },
                  {
                    level: 2,
                    concept: "Call Stack Unwinding",
                    status: "shaky",
                    explanation: "Did not anticipate return condition.",
                  },
                  {
                    level: 1,
                    concept: "Well-Founded Induction Base",
                    status: "severed",
                    explanation: "Missing base invariant.",
                  },
                ],
              }) +
              "\n```",
          }),
        ),
      );

      const trace = await diagnoseCognitiveGap("Computer Science", "Recursive loop never ends");
      expect(trace.rootCauseSummary).toBe("Base case recursion omitted.");
      expect(trace.layers[0].concept).toBe("Stack Overflow in Factorial");
    });

    it("uses graceful fallback if AI returns error or invalid payload", async () => {
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({ error: "Internal Server Error" }, { status: 500 }),
        ),
      );

      const trace = await diagnoseCognitiveGap("Physics", "Momentum in inelastic collision");
      expect(trace.id).toBeDefined();
      expect(trace.subject).toBe("Physics");
      expect(trace.layers).toHaveLength(3);
      expect(trace.layers[2].level).toBe(1);
      expect(trace.layers[2].status).toBe("severed");
    });
  });

  describe("generateMicroRepair", () => {
    it("generates a micro repair challenge with 60s interactive exercise", async () => {
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({
            text: JSON.stringify({
              rootConcept: "Functional Composition & Intermediate Change",
              intuitionSummary:
                "When you zoom into a composite function f(g(x)), zooming in by dx stretches g by g'(x), which in turn stretches f by f'(g(x)). You multiply the stretch factors.",
              interactiveExercise: {
                prompt:
                  "If a gear A turns gear B at 2x speed, and gear B turns gear C at 3x speed, how fast does gear C turn relative to gear A?",
                options: [
                  "6x speed (2 * 3)",
                  "5x speed (2 + 3)",
                  "1.5x speed (3 / 2)",
                  "No change (1x)",
                ],
                correctIndex: 0,
                firstPrinciplesExplanation:
                  "Rates of change multiply in sequence. This is the bedrock of the Chain Rule.",
              },
            }),
          }),
        ),
      );

      const repair = await generateMicroRepair("Functional Composition & Intermediate Change");
      expect(repair.id).toBeDefined();
      expect(repair.rootConcept).toBe("Functional Composition & Intermediate Change");
      expect(repair.verified).toBe(false);
      expect(repair.interactiveExercise.options).toHaveLength(4);
      expect(repair.interactiveExercise.correctIndex).toBe(0);

      const savedRepairs = getSavedRepairs();
      expect(savedRepairs[repair.id]).toBeDefined();
    });

    it("provides deterministic fallback repair when AI fails", async () => {
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({ error: "Provider unavailable" }, { status: 503 }),
        ),
      );

      const repair = await generateMicroRepair("Conservation of Momentum");
      expect(repair.id).toBeDefined();
      expect(repair.rootConcept).toBe("Conservation of Momentum");
      expect(repair.interactiveExercise.options.length).toBeGreaterThan(1);
    });
  });

  describe("recordRepairSuccess", () => {
    it("marks challenge verified and heals the cognitive stack trace layers to healthy", async () => {
      const trace: CognitiveStackTrace = {
        id: "trace_test_123",
        failedQuestionOrTopic: "Conservation of Energy",
        subject: "Physics",
        timestamp: new Date().toISOString(),
        rootCauseSummary: "Failed to account for thermal dissipation",
        layers: [
          {
            level: 3,
            concept: "Pendulum final velocity",
            status: "severed",
            explanation: "Surface calc broke",
          },
          {
            level: 2,
            concept: "Kinetic-Potential conversion",
            status: "shaky",
            explanation: "Intermediate bridge miscalculated",
          },
          {
            level: 1,
            concept: "Invariant Total Energy",
            status: "severed",
            explanation: "Bedrock gap",
          },
        ],
      };
      saveTrace(trace);

      const challenge: MicroRepairChallenge = {
        id: "repair_test_456",
        rootConcept: "Invariant Total Energy",
        intuitionSummary: "Energy cannot disappear.",
        verified: false,
        interactiveExercise: {
          prompt: "What is conserved?",
          options: ["Total Energy", "Only velocity"],
          correctIndex: 0,
          firstPrinciplesExplanation: "Energy is invariant.",
        },
      };
      saveRepair(challenge);

      await recordRepairSuccess("trace_test_123", "repair_test_456");

      const updatedRepairs = getSavedRepairs();
      expect(updatedRepairs["repair_test_456"].verified).toBe(true);

      const updatedTrace = getSavedTraceById("trace_test_123");
      expect(updatedTrace).not.toBeNull();
      expect(updatedTrace?.layers.find((l) => l.level === 1)?.status).toBe("healthy");
      expect(updatedTrace?.layers.find((l) => l.level === 2)?.status).toBe("healthy");
      expect(updatedTrace?.layers.find((l) => l.level === 3)?.status).toBe("healthy");
    });
  });

  describe("Storage Helpers", () => {
    it("saves, retrieves, deletes, and clears traces", () => {
      expect(getSavedTraces()).toEqual([]);

      const sample: CognitiveStackTrace = {
        id: "tr-1",
        failedQuestionOrTopic: "Test Topic",
        subject: "Math",
        layers: [],
        rootCauseSummary: "Sample summary",
        timestamp: new Date().toISOString(),
      };

      saveTrace(sample);
      expect(getSavedTraces()).toHaveLength(1);
      expect(getSavedTraceById("tr-1")?.failedQuestionOrTopic).toBe("Test Topic");

      // Update existing trace
      saveTrace({ ...sample, rootCauseSummary: "Updated summary" });
      expect(getSavedTraces()).toHaveLength(1);
      expect(getSavedTraceById("tr-1")?.rootCauseSummary).toBe("Updated summary");

      deleteTrace("tr-1");
      expect(getSavedTraces()).toHaveLength(0);

      saveTrace(sample);
      clearTraceHistory();
      expect(getSavedTraces()).toHaveLength(0);
    });

    it("handles corrupted storage gracefully", () => {
      localStorage.setItem(STORAGE_KEY_TRACES, "INVALID_JSON{");
      expect(getSavedTraces()).toEqual([]);
      expect(getSavedTraceById("any")).toBeNull();

      localStorage.setItem(STORAGE_KEY_REPAIRS, "INVALID_JSON{");
      expect(getSavedRepairs()).toEqual({});
    });
  });
});
