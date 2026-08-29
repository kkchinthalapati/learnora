import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { CognitiveDebuggerView } from "./CognitiveDebuggerView";
import {
  saveTrace,
  type CognitiveStackTrace,
} from "../../api/aiDebugger";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;
const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

describe("CognitiveDebuggerView", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
    server.use(
      http.get(rest("quiz_attempts"), () =>
        HttpResponse.json([
          { weak_topics: ["Recursion Base Cases", "Chain Rule Derivatives"] },
        ]),
      ),
    );
  });

  it("renders page header, input form, and empty state initially", async () => {
    renderWithAuth(<CognitiveDebuggerView />, { session: fakeSession() }, { withRouter: true });

    expect(screen.getByText("Cognitive Root-Cause Debugger")).toBeInTheDocument();
    expect(screen.getByText("Symptom Diagnostic Input")).toBeInTheDocument();
    expect(screen.getByTestId("mistake-input")).toBeInTheDocument();
    expect(screen.getByText("No Active Diagnostic Trace")).toBeInTheDocument();

    // Check detected quiz weak topics
    await waitFor(() => {
      expect(screen.getByText("Recursion Base Cases")).toBeInTheDocument();
    });
  });

  it("populates inputs when clicking a preset button", async () => {
    renderWithAuth(<CognitiveDebuggerView />, { session: fakeSession() }, { withRouter: true });

    const presetBtn = screen.getByTestId("preset-btn-0");
    fireEvent.click(presetBtn);

    const textarea = screen.getByTestId("mistake-input") as HTMLTextAreaElement;
    expect(textarea.value).toContain("Failed derivative of composite");
  });

  it("executes diagnosis and displays 3-layer stack trace and Knowledge Circuit", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({
          text: JSON.stringify({
            rootCauseSummary: "Prerequisite misunderstanding of inner derivative multiplier.",
            layers: [
              {
                level: 3,
                concept: "Surface Chain Rule on sin(x^2)",
                status: "severed",
                explanation: "Did not multiply outer rate by 2x.",
                prerequisiteOf: "Exam Question",
              },
              {
                level: 2,
                concept: "Composite Function Rate Multiplication",
                status: "shaky",
                explanation: "Treated inner argument x^2 as a constant.",
                prerequisiteOf: "Surface Chain Rule",
              },
              {
                level: 1,
                concept: "Functional Composition & Change Invariance",
                status: "severed",
                explanation: "Lacking intuition that changes propagate sequentially.",
                prerequisiteOf: "Composite Function Rate Multiplication",
              },
            ],
          }),
        }),
      ),
    );

    renderWithAuth(<CognitiveDebuggerView />, { session: fakeSession() }, { withRouter: true });

    const textarea = screen.getByTestId("mistake-input");
    await user.type(textarea, "Failed derivative of sin(x^2)");

    const submitBtn = screen.getByTestId("diagnose-submit-btn");
    fireEvent.click(submitBtn);

    // Should display loading state
    expect(screen.getByText(/Decompiling Mental Execution Stack/i)).toBeInTheDocument();

    // Should display the 3-layer stack trace and root cause summary
    await waitFor(() => {
      expect(screen.getByTestId("root-cause-summary-card")).toBeInTheDocument();
      expect(
        screen.getByText(/Prerequisite misunderstanding of inner derivative multiplier/i),
      ).toBeInTheDocument();
      expect(screen.getByTestId("knowledge-circuit")).toBeInTheDocument();
      expect(screen.getByTestId("layer-card-3")).toBeInTheDocument();
      expect(screen.getByTestId("layer-card-2")).toBeInTheDocument();
      expect(screen.getByTestId("layer-card-1")).toBeInTheDocument();
      expect(screen.getByTestId("action-banner")).toBeInTheDocument();
    });
  });

  it("launches 60s micro repair modal and restores the circuit upon success", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        const body = (await request.json()) as any;
        const prompt = body.history?.[0]?.content || "";

        if (prompt.includes("Cognitive Root-Cause Debugger")) {
          return HttpResponse.json({
            text: JSON.stringify({
              rootCauseSummary: "Bedrock gap in invariant energy conservation.",
              layers: [
                {
                  level: 3,
                  concept: "Pendulum Speed Error",
                  status: "severed",
                  explanation: "Surface calc broke.",
                },
                {
                  level: 2,
                  concept: "Kinetic-Potential Equivalence",
                  status: "shaky",
                  explanation: "Bridge broke.",
                },
                {
                  level: 1,
                  concept: "Total Energy Invariance",
                  status: "severed",
                  explanation: "Core broke.",
                },
              ],
            }),
          });
        }

        // Micro repair generation
        return HttpResponse.json({
          text: JSON.stringify({
            rootConcept: "Total Energy Invariance",
            intuitionSummary: "Energy in a closed system cannot vanish.",
            interactiveExercise: {
              prompt: "What is conserved in an isolated mechanical system?",
              options: ["Total Energy", "Only Speed", "Only Position", "Nothing"],
              correctIndex: 0,
              firstPrinciplesExplanation: "Total energy remains invariant.",
            },
          }),
        });
      }),
    );

    renderWithAuth(<CognitiveDebuggerView />, { session: fakeSession() }, { withRouter: true });

    // Run diagnosis
    const textarea = screen.getByTestId("mistake-input");
    await user.type(textarea, "Pendulum energy breakdown");
    fireEvent.click(screen.getByTestId("diagnose-submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("launch-micro-repair-btn")).toBeInTheDocument();
    }, { timeout: 5000 });

    // Launch Micro-Repair
    fireEvent.click(screen.getByTestId("launch-micro-repair-btn"));

    // Modal should open
    await waitFor(() => {
      expect(screen.getByText("60-Second Micro-Repair Sandbox")).toBeInTheDocument();
      expect(screen.getByText("Energy in a closed system cannot vanish.")).toBeInTheDocument();
    }, { timeout: 5000 });

    // Answer correctly in modal
    await user.click(screen.getByTestId("repair-option-0"));
    await user.click(screen.getByTestId("verify-repair-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("apply-fix-btn")).toBeInTheDocument();
    }, { timeout: 5000 });

    await user.click(screen.getByTestId("apply-fix-btn"));

    // Verify view has updated with repaired root cause
    await waitFor(() => {
      expect(screen.getByText(/Root Prerequisite Repaired/i)).toBeInTheDocument();
      expect(screen.getByText(/100% Signal Integrity \(Restored\)/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("manages trace history and allows switching between traces", async () => {
    const existingTrace: CognitiveStackTrace = {
      id: "hist-trace-1",
      subject: "Physics",
      failedQuestionOrTopic: "Conservation of Momentum in 2D",
      rootCauseSummary: "Vector vs Scalar confusion",
      timestamp: new Date().toISOString(),
      layers: [
        {
          level: 3,
          concept: "Velocity Vector Resolution",
          status: "severed",
          explanation: "Wrong angle projection",
        },
        {
          level: 2,
          concept: "Orthogonal Momentum Independence",
          status: "shaky",
          explanation: "Mixed axes",
        },
        {
          level: 1,
          concept: "Vector Linearity Invariance",
          status: "severed",
          explanation: "Root vector algebra",
        },
      ],
    };

    saveTrace(existingTrace);

    renderWithAuth(<CognitiveDebuggerView />, { session: fakeSession() }, { withRouter: true });

    // History button should show count
    const historyBtn = screen.getByTestId("open-history-btn");
    expect(historyBtn).toHaveTextContent("Trace History (1)");

    fireEvent.click(historyBtn);

    expect(screen.getByText("Saved Cognitive Stack Traces")).toBeInTheDocument();
    expect(screen.getByText(/Physics: Conservation of Momentum in 2D/i)).toBeInTheDocument();

    // Select the trace
    fireEvent.click(screen.getByTestId("history-item-hist-trace-1"));

    // Modal should close and active trace should be displayed
    await waitFor(() => {
      expect(screen.getByText("Vector vs Scalar confusion")).toBeInTheDocument();
      expect(screen.getByTestId("new-debug-btn")).toBeInTheDocument();
    });

    // Reset button clears active view
    fireEvent.click(screen.getByTestId("new-debug-btn"));
    expect(screen.getByText("No Active Diagnostic Trace")).toBeInTheDocument();
  });
});
