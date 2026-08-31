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

  it("renders header, hero section, exam selector, and trap type cards", async () => {
    renderWithAuth(<PreMortemHubView />, { session: fakeSession() }, { withRouter: true });

    expect(screen.getByText("What Could Go Wrong")).toBeInTheDocument();
    expect(screen.getByText("Practise on the questions designed to catch you out")).toBeInTheDocument();
    expect(screen.getByText("1. Which exam or subject?")).toBeInTheDocument();
    expect(screen.getByText("2. Which kinds of trap?")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Calculus Final/i })).toBeInTheDocument();
    });

    expect(screen.getByText("Edge cases")).toBeInTheDocument();
    expect(screen.getByText("Questions phrased backwards")).toBeInTheDocument();
    expect(screen.getByText("Hidden assumptions")).toBeInTheDocument();
  });

  it("allows toggling trap types, select all, and clear", async () => {
    renderWithAuth(<PreMortemHubView />, { session: fakeSession() }, { withRouter: true });

    const selectAllBtn = screen.getByRole("button", { name: "Select All" });
    const clearBtn = screen.getByRole("button", { name: "Clear" });

    // Click Clear
    fireEvent.click(clearBtn);
    expect(screen.getByText(/0 of \d+ picked/i)).toBeInTheDocument();

    // Click Select All
    fireEvent.click(selectAllBtn);
    expect(screen.getByText(/6 of 6 picked/i)).toBeInTheDocument();

    // Toggle single trap
    const boundaryCard = screen.getByText("Edge cases").closest('[role="checkbox"]');
    expect(boundaryCard).toBeInTheDocument();
    if (boundaryCard) {
      fireEvent.click(boundaryCard);
      expect(screen.getByText(/5 of 6 picked/i)).toBeInTheDocument();
    }
  });

  it("starts the question set when Start is clicked", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PreMortemHubView />, { session: fakeSession() }, { withRouter: true });

    const launchBtn = screen.getByRole("button", { name: /^Start$/ });
    expect(launchBtn).toBeEnabled();

    await user.click(launchBtn);

    // Should transition to runner
    await waitFor(() => {
      expect(screen.getByText(/Question 1 of/i)).toBeInTheDocument();
    });
  });

  it("displays past attempts and opens a report", async () => {
    const mockReport: PreMortemReport = {
      id: "hist-audit-1",
      subject: "Linear Algebra",
      predictedScore: 78,
      gradeEstimate: "B — solid, with a few blind spots",
      radarData: [{ topic: "Determinants", riskLevel: "medium", failureProbability: 45 }],
      predictedFailures: [
        {
          topic: "Determinants",
          failureProbability: 45,
          predictedLostMarks: 6,
          coreTrap: "Edge cases",
          neutralizerId: "boundary-condition-tricks",
        },
      ],
      timestamp: "2026-08-25T14:00:00.000Z",
      totalQuestions: 5,
      correctCount: 3,
    };

    savePreMortemReport(mockReport);

    renderWithAuth(<PreMortemHubView />, { session: fakeSession() }, { withRouter: true });

    expect(screen.getByText("Your past attempts")).toBeInTheDocument();
    expect(screen.getByText("Linear Algebra")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();

    const viewRadarBtn = screen.getByRole("button", { name: "See what tripped me up" });
    fireEvent.click(viewRadarBtn);

    // Should transition to radar view
    await waitFor(() => {
      expect(screen.getByText("Where you're most likely to slip")).toBeInTheDocument();
      expect(screen.getByText("The traps most likely to catch you")).toBeInTheDocument();
    });
  });
});
