import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { ExamDetectiveHubView } from "./ExamDetectiveHubView";

describe("ExamDetectiveHubView", () => {
  beforeEach(() => {
    localStorage.clear();

    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/learnora-ai`, () =>
        HttpResponse.json({
          text: JSON.stringify([
            {
              id: "custom-trap-1",
              name: "Calculus L'Hopital Boundary Trap",
              category: "edge_cases",
              description: "Applying L'Hopital when limit is not indeterminate",
              examplePattern: "lim x->0 (cos x)/x",
              frequency: "High",
              disarmRule: "Verify 0/0 or inf/inf first",
            },
          ]),
        }),
      ),
    );
  });

  it("renders hero, navigation tabs, and playbook trap cards", async () => {
    renderWithAuth(
      <ExamDetectiveHubView />,
      { session: fakeSession() },
      { withRouter: true },
    );

    expect(
      screen.getByRole("heading", { name: "Exam trap practice" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Six traps worth recognising")).toBeInTheDocument();

    // Tab buttons
    expect(
      screen.getByRole("button", { name: /Common traps/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Analyse a past paper/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Practice$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Results/i }),
    ).toBeInTheDocument();

    // Archetype cards
    expect(screen.getByText("Edge Case Hazards")).toBeInTheDocument();
    expect(screen.getByText("Negative Wording Maze")).toBeInTheDocument();
    expect(screen.getByText("Hidden Assumptions")).toBeInTheDocument();
    expect(
      screen.getByText("Lookalike Terms & False Synonyms"),
    ).toBeInTheDocument();
  });

  it("switches to Deconstruct Exam Paper tab and allows scanning text", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ExamDetectiveHubView />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const deconstructTab = screen.getByRole("button", {
      name: /Analyse a past paper/i,
    });
    await user.click(deconstructTab);

    expect(screen.getByText("Analyse your own material")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/Paste past exam questions/i);
    expect(textarea).toBeInTheDocument();

    const sampleBtn = screen.getByRole("button", {
      name: /Load Sample Problem/i,
    });
    await user.click(sampleBtn);

    const scanBtn = screen.getByRole("button", {
      name: /Find trap patterns/i,
    });
    await user.click(scanBtn);

    // After scanning, switches back to playbook with archetypes
    await waitFor(() => {
      expect(
        screen.getByText("Six traps worth recognising"),
      ).toBeInTheDocument();
    });
  });

  it("opens the trap walkthrough from an archetype card", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ExamDetectiveHubView />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const exploreBtns = screen.getAllByRole("button", {
      name: /See how to spot it/i,
    });
    expect(exploreBtns.length).toBeGreaterThan(0);
    await user.click(exploreBtns[0]);

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText("4-Step Aha! Breakdown")).toBeInTheDocument();
    });
    expect(screen.getByText(/Spotting the Bait/i)).toBeInTheDocument();
    expect(screen.getByText(/The Sneaky Trick/i)).toBeInTheDocument();
    expect(screen.getByText(/Detective Rule/i)).toBeInTheDocument();
    expect(screen.getByText(/Disarm Challenge/i)).toBeInTheDocument();
  });

  it("switches to practice results without inventing a score", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ExamDetectiveHubView />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const radarTab = screen.getByRole("button", {
      name: /Results/i,
    });
    await user.click(radarTab);

    expect(screen.getByText("Observed practice results")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Trap practice results chart"),
    ).toBeInTheDocument();
    expect(screen.getByText("No practice saved yet")).toBeInTheDocument();
    expect(screen.getByText("Edge cases")).toBeInTheDocument();
    expect(screen.getByText("Negative wording")).toBeInTheDocument();
  });

  it("launches Challenge Sprint and renders runner", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ExamDetectiveHubView />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const sprintTab = screen.getByRole("button", {
      name: /^Practice$/i,
    });
    await user.click(sprintTab);

    expect(screen.getByText("Practise under pressure")).toBeInTheDocument();

    const startBtn = screen.getByRole("button", {
      name: /Start practice/i,
    });
    await user.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText(/Trap 1 of/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Exit Sprint/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Inspect Bait Clue/i }),
    ).toBeInTheDocument();
  });
});
