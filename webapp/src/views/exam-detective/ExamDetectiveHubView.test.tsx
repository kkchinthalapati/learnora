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
        })
      )
    );
  });

  it("renders hero, navigation tabs, and playbook trap cards", async () => {
    renderWithAuth(
      <ExamDetectiveHubView />,
      { session: fakeSession() },
      { withRouter: true }
    );

    expect(
      screen.getByText("Exam Detective & Tricky Question Simulator")
    ).toBeInTheDocument();
    expect(screen.getByText("Exam Trap Radar")).toBeInTheDocument();

    // Tab buttons
    expect(
      screen.getByRole("button", { name: /Professor's Trick Playbook/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Deconstruct Exam Paper/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Challenge Sprint$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Trap Immunity Radar/i })
    ).toBeInTheDocument();

    // Archetype cards
    expect(screen.getByText("Edge Case Hazards")).toBeInTheDocument();
    expect(screen.getByText("Negative Wording Maze")).toBeInTheDocument();
    expect(screen.getByText("Hidden Assumptions")).toBeInTheDocument();
    expect(
      screen.getByText("Lookalike Terms & False Synonyms")
    ).toBeInTheDocument();
  });

  it("switches to Deconstruct Exam Paper tab and allows scanning text", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ExamDetectiveHubView />,
      { session: fakeSession() },
      { withRouter: true }
    );

    const deconstructTab = screen.getByRole("button", {
      name: /Deconstruct Exam Paper/i,
    });
    await user.click(deconstructTab);

    expect(
      screen.getByText("Scan Exam Paper or Syllabus")
    ).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(
      /Paste past exam questions/i
    );
    expect(textarea).toBeInTheDocument();

    const sampleBtn = screen.getByRole("button", {
      name: /Load Sample Problem/i,
    });
    await user.click(sampleBtn);

    const scanBtn = screen.getByRole("button", {
      name: /Scan for Professor Traps/i,
    });
    await user.click(scanBtn);

    // After scanning, switches back to playbook with archetypes
    await waitFor(() => {
      expect(
        screen.getByText("The Professor's Adversarial Playbook")
      ).toBeInTheDocument();
    });
  });

  it("opens 4-Step Aha! Breakdown modal when clicked on archetype card", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ExamDetectiveHubView />,
      { session: fakeSession() },
      { withRouter: true }
    );

    const exploreBtns = screen.getAllByRole("button", {
      name: /Explore 4-Step Aha!/i,
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

  it("switches to Trap Immunity Radar tab and displays SVG radar and badges", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ExamDetectiveHubView />,
      { session: fakeSession() },
      { withRouter: true }
    );

    const radarTab = screen.getByRole("button", {
      name: /Trap Immunity Radar/i,
    });
    await user.click(radarTab);

    expect(screen.getByText("Exam Trap Immunity Radar")).toBeInTheDocument();
    expect(screen.getByLabelText("Trap Immunity Radar Chart")).toBeInTheDocument();
    expect(screen.getByText("Edge Case Disarmer")).toBeInTheDocument();
    expect(screen.getByText("Wording Sleuth")).toBeInTheDocument();
  });

  it("launches Challenge Sprint and renders runner", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ExamDetectiveHubView />,
      { session: fakeSession() },
      { withRouter: true }
    );

    const sprintTab = screen.getByRole("button", {
      name: /^Challenge Sprint$/i,
    });
    await user.click(sprintTab);

    expect(
      screen.getByText("Tricky Question Challenge Sprint")
    ).toBeInTheDocument();

    const startBtn = screen.getByRole("button", {
      name: /Start Challenge Sprint/i,
    });
    await user.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText(/Trap 1 of/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Exit Sprint/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Inspect Bait Clue/i })).toBeInTheDocument();
  });
});
