import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { PreMortemHubView } from "./PreMortemHubView";
import { savePreMortemReport, type PreMortemReport } from "../../api/aiPreMortem";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

describe("PreMortemHubView", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");

    server.use(
      http.get(rest("exams"), () =>
        HttpResponse.json([
          {
            id: 101,
            user_id: "user-1",
            exam_name: "Calculus Final",
            exam_date: "2026-08-30",
            difficulty: "Hard",
            status: "Upcoming",
          },
        ])
      ),
      http.get(rest("folders"), () =>
        HttpResponse.json([
          {
            id: "folder-1",
            user_id: "user-1",
            name: "Physics Mechanics",
            color: "#3b82f6",
            created_at: "2026-08-01",
          },
        ])
      )
    );
  });

  it("renders header, hero section, exam selector, and trap archetype cards", async () => {
    renderWithAuth(<PreMortemHubView />, { session: fakeSession() }, { withRouter: true });

    expect(screen.getByText("Adversarial Professor & Exam Pre-Mortem")).toBeInTheDocument();
    expect(screen.getByText("Stress-Test Against Professor Tricks")).toBeInTheDocument();
    expect(screen.getByText("1. Target Exam & Subject")).toBeInTheDocument();
    expect(screen.getByText("2. Select Adversarial Trap Profiles")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Calculus Final/i })).toBeInTheDocument();
    });

    expect(screen.getByText("Boundary Condition & Edge Case Traps")).toBeInTheDocument();
    expect(screen.getByText("Negative Phrasing Distractors")).toBeInTheDocument();
    expect(screen.getByText("Multi-Step Hidden Assumption Traps")).toBeInTheDocument();
  });

  it("allows toggling trap archetypes, select all, and clear", async () => {
    renderWithAuth(<PreMortemHubView />, { session: fakeSession() }, { withRouter: true });

    const selectAllBtn = screen.getByRole("button", { name: "Select All" });
    const clearBtn = screen.getByRole("button", { name: "Clear" });

    // Click Clear
    fireEvent.click(clearBtn);
    expect(screen.getByText(/0 of \d+ trap archetypes active/i)).toBeInTheDocument();

    // Click Select All
    fireEvent.click(selectAllBtn);
    expect(screen.getByText(/6 of 6 trap archetypes active/i)).toBeInTheDocument();

    // Toggle single trap
    const boundaryCard = screen.getByText("Boundary Condition & Edge Case Traps").closest('[role="checkbox"]');
    expect(boundaryCard).toBeInTheDocument();
    if (boundaryCard) {
      fireEvent.click(boundaryCard);
      expect(screen.getByText(/5 of 6 trap archetypes active/i)).toBeInTheDocument();
    }
  });

  it("launches gauntlet when Launch button is clicked", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PreMortemHubView />, { session: fakeSession() }, { withRouter: true });

    const launchBtn = screen.getByRole("button", { name: /Launch Stress-Test Gauntlet/i });
    expect(launchBtn).toBeEnabled();

    await user.click(launchBtn);

    // Should transition to runner
    await waitFor(() => {
      expect(screen.getByText(/Adversarial Professor Stress-Test • Question 1 of/i)).toBeInTheDocument();
    });
  });

  it("displays past pre-mortem audit history and opens radar report", async () => {
    const mockReport: PreMortemReport = {
      id: "hist-audit-1",
      subject: "Linear Algebra",
      predictedScore: 78,
      gradeEstimate: "B (Solid with Edge Blindspots)",
      radarData: [{ topic: "Determinants", riskLevel: "medium", failureProbability: 45 }],
      predictedFailures: [
        {
          topic: "Determinants",
          failureProbability: 45,
          predictedLostMarks: 6,
          coreTrap: "Boundary Condition & Edge Case Traps",
          neutralizerId: "boundary-condition-tricks",
        },
      ],
      timestamp: "2026-08-25T14:00:00.000Z",
      totalQuestions: 5,
      correctCount: 3,
    };

    savePreMortemReport(mockReport);

    renderWithAuth(<PreMortemHubView />, { session: fakeSession() }, { withRouter: true });

    expect(screen.getByText("Past Pre-Mortem Audit Reports")).toBeInTheDocument();
    expect(screen.getByText("Linear Algebra")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();

    const viewRadarBtn = screen.getByRole("button", { name: "View Failure Radar" });
    fireEvent.click(viewRadarBtn);

    // Should transition to radar view
    await waitFor(() => {
      expect(screen.getByText("Topic Failure Probability Radar")).toBeInTheDocument();
      expect(screen.getByText("Predicted Exam-Day Failure Traps")).toBeInTheDocument();
    });
  });
});
