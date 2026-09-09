import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import { ExamDetectiveHubView } from "./ExamDetectiveHubView";

describe("ExamDetectiveHubView", () => {
  beforeEach(() => {
    localStorage.clear();
    /* The subject picker reads the student's exams and folders, and both
       queries go through requireUserId(). */
    mockAuthSession("user-1");

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

    /* No canned "Calculus & STEM" default any more: the subject is seeded
       from the student's own exams, so wait for that before scanning. */
    await waitFor(() =>
      expect(screen.getByLabelText("Subject")).not.toHaveValue(""),
    );

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

    await waitFor(() =>
      expect(screen.getByLabelText("Subject")).not.toHaveValue(""),
    );

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
  /* Exam Detective is one of the four diagnostic tools the product rests on,
     and it used to open on a hardcoded <select> of five generic strings
     ("Calculus & STEM", "Economics & History") with no relationship to
     anything the student had told the app. */
  describe("subject picker", () => {
    const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

    it("offers the student's own exams and subjects, not a canned list", async () => {
      server.use(
        http.get(rest("exams"), () =>
          HttpResponse.json([
            {
              id: 1,
              user_id: "user-1",
              exam_name: "AQA Biology Paper 2",
              exam_date: "2026-06-01",
              difficulty: null,
              status: null,
            },
          ]),
        ),
        http.get(rest("folders"), () =>
          HttpResponse.json([
            {
              id: "f-1",
              user_id: "user-1",
              name: "Organic chemistry",
              color: "#4A90E2",
              created_at: "2026-01-01T00:00:00Z",
            },
          ]),
        ),
      );

      renderWithAuth(
        <ExamDetectiveHubView />,
        { session: fakeSession() },
        { withRouter: true },
      );

      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", { name: /^Practice$/i }),
      );

      expect(
        await screen.findByRole("option", { name: "AQA Biology Paper 2" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Organic chemistry" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Calculus & STEM" }),
      ).not.toBeInTheDocument();
    });

    it("opens on the subject another screen sent it here about", async () => {
      /* The subject page's trap button writes this payload. Nothing read it
         before — ExamDetectiveHubView did not import CognitiveBridge at all —
         so the subject context was silently dropped on every deep link. */
      CognitiveBridge.setPayload({
        subject: "Photosynthesis",
        topic: "Photosynthesis",
        sourceTool: "notes",
        suggestedAction: "run_premortem",
      });
      server.use(
        http.get(rest("exams"), () => HttpResponse.json([])),
        http.get(rest("folders"), () => HttpResponse.json([])),
      );

      renderWithAuth(
        <ExamDetectiveHubView />,
        { session: fakeSession() },
        { withRouter: true },
      );

      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", { name: /^Practice$/i }),
      );

      await waitFor(() =>
        expect(screen.getByLabelText("Which subject?")).toHaveValue(
          "Photosynthesis",
        ),
      );
    });
  });
});
