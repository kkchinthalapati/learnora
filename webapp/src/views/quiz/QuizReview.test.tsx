import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { QuizReview } from "./QuizReview";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

const QUESTIONS = [
  {
    id: "q1",
    question: "Which organelle makes ATP?",
    choices: ["Ribosome", "Mitochondrion", "Nucleus"],
    correctIndex: 1,
    topic: "Cell biology",
    feedback: "Respiration happens in the mitochondrion.",
  },
  {
    id: "q2",
    question: "What does DNA stand for?",
    choices: ["Deoxyribonucleic acid", "Dinitrogen acetate"],
    correctIndex: 0,
    topic: "Genetics",
  },
];

const ATTEMPT = {
  id: "attempt-1",
  user_id: "user-1",
  quiz_id: "quiz-1",
  score: 1,
  total: 2,
  answers_json: [
    { questionId: "q1", chosenIndex: 1, correct: true, topic: "Cell biology" },
    { questionId: "q2", chosenIndex: 1, correct: false, topic: "Genetics" },
  ],
  weak_topics: ["Genetics"],
  created_at: "2026-07-28T09:00:00.000Z",
};

function serve({
  questions = QUESTIONS as unknown,
  attempt = ATTEMPT as unknown,
}: { questions?: unknown; attempt?: unknown } = {}) {
  server.use(
    http.get(rest("quizzes"), () =>
      HttpResponse.json([
        {
          id: "quiz-1",
          user_id: "user-1",
          title: "Biology basics",
          questions_json: questions,
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ]),
    ),
    http.get(rest("quiz_attempts"), () =>
      HttpResponse.json(attempt ? [attempt] : []),
    ),
  );
}

function renderReview() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/quiz/quiz-1/review"]}>
      <Routes>
        <Route path="/quiz/:quizId/review" element={<QuizReview />} />
        <Route path="/quiz/:quizId" element={<h1>Runner page</h1>} />
        <Route path="/library/quizzes" element={<h1>Quizzes tab</h1>} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

/** The <li> holding a given choice's text. */
function choiceRow(text: string) {
  return screen.getByText(text).closest("li") as HTMLElement;
}

describe("QuizReview", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the title, the score and when the attempt was taken", async () => {
    serve();
    renderReview();

    expect(
      await screen.findByRole("heading", {
        name: /Biology basics — your answers/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2 correct/)).toBeInTheDocument();
    // Derived from the same call the view makes — the runner's locale decides
    // whether that reads "28 Jul 2026" or "Jul 28, 2026".
    const taken = new Date(ATTEMPT.created_at).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    expect(screen.getByText(new RegExp(taken))).toBeInTheDocument();
  });

  it("verdicts each question against the attempt", async () => {
    serve();
    renderReview();
    await screen.findByText("Question 1 of 2");

    expect(screen.getByText("✓ Correct")).toBeInTheDocument();
    expect(screen.getByText("✕ Incorrect")).toBeInTheDocument();
  });

  it("tags the chosen and correct options distinctly", async () => {
    serve();
    renderReview();
    await screen.findByText("Question 1 of 2");

    // Answered correctly: one row carries both facts.
    expect(
      within(choiceRow("Mitochondrion")).getByText("Your answer · correct"),
    ).toBeInTheDocument();
    // Answered wrongly: the right answer and the chosen one are separate rows.
    expect(
      within(choiceRow("Deoxyribonucleic acid")).getByText("Correct answer"),
    ).toBeInTheDocument();
    expect(
      within(choiceRow("Dinitrogen acetate")).getByText("Your answer"),
    ).toBeInTheDocument();
  });

  it("leaves untouched options untagged", async () => {
    serve();
    renderReview();
    await screen.findByText("Question 1 of 2");

    expect(within(choiceRow("Ribosome")).queryByText(/answer/i)).toBeNull();
  });

  it("shows a question's feedback when it has one", async () => {
    serve();
    renderReview();

    expect(
      await screen.findByText("Respiration happens in the mitochondrion."),
    ).toBeInTheDocument();
  });

  /* Attempts are stored in question order, so position is the reliable link
     back when the model omitted question ids. */
  it("matches answers by position when the questions have no ids", async () => {
    serve({
      questions: QUESTIONS.map(({ id: _id, ...rest }) => rest),
      attempt: {
        ...ATTEMPT,
        answers_json: [
          { questionId: 0, chosenIndex: 0, correct: false },
          { questionId: 1, chosenIndex: 0, correct: true },
        ],
      },
    });
    renderReview();
    await screen.findByText("Question 1 of 2");

    expect(
      within(choiceRow("Ribosome")).getByText("Your answer"),
    ).toBeInTheDocument();
    expect(
      within(choiceRow("Deoxyribonucleic acid")).getByText(
        "Your answer · correct",
      ),
    ).toBeInTheDocument();
  });

  it("marks a question the attempt never covered as not answered", async () => {
    serve({ attempt: { ...ATTEMPT, answers_json: [ATTEMPT.answers_json[0]] } });
    renderReview();
    await screen.findByText("Question 2 of 2");

    expect(screen.getByText("Not answered")).toBeInTheDocument();
  });

  describe("with no attempt", () => {
    it("says so and offers to start the quiz", async () => {
      serve({ attempt: null });
      renderReview();

      expect(
        await screen.findByText(/haven't taken this quiz yet/),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("link", { name: "Take the quiz" }),
      );
      expect(
        await screen.findByRole("heading", { name: "Runner page" }),
      ).toBeInTheDocument();
    });
  });

  it("links back to a retake and to the Library", async () => {
    serve();
    renderReview();
    await screen.findByText("Question 1 of 2");

    await userEvent.click(screen.getByRole("link", { name: "Retake quiz" }));
    expect(
      await screen.findByRole("heading", { name: "Runner page" }),
    ).toBeInTheDocument();
  });

  it("says the quiz is gone rather than rendering an empty review", async () => {
    server.use(
      http.get(rest("quizzes"), () => HttpResponse.json([])),
      http.get(rest("quiz_attempts"), () => HttpResponse.json([])),
    );
    renderReview();

    expect(
      await screen.findByText("Quiz not found"),
    ).toBeInTheDocument();
  });

  it("reports a load failure without blanking the page", async () => {
    server.use(
      http.get(rest("quizzes"), () =>
        HttpResponse.json({ message: "permission denied" }, { status: 403 }),
      ),
      http.get(rest("quiz_attempts"), () => HttpResponse.json([])),
    );
    renderReview();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "permission denied",
    );
  });

  it("scopes the attempt lookup to this quiz and the signed-in user", async () => {
    let url: URL | undefined;
    server.use(
      http.get(rest("quizzes"), () =>
        HttpResponse.json([
          { id: "quiz-1", title: "T", questions_json: QUESTIONS },
        ]),
      ),
      http.get(rest("quiz_attempts"), ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([ATTEMPT]);
      }),
    );
    renderReview();
    await screen.findByText("Question 1 of 2");

    expect(url?.searchParams.get("user_id")).toBe("eq.user-1");
    expect(url?.searchParams.get("quiz_id")).toBe("eq.quiz-1");
    expect(url?.searchParams.get("order")).toBe("created_at.desc");
  });

  it("displays proctor termination explanation when exam was ended early by proctor", async () => {
    serve({
      attempt: {
        ...ATTEMPT,
        answers_json: {
          items: ATTEMPT.answers_json,
          proctorTermination: {
            reason: "fullscreen",
            timestamp: "2026-08-16T12:00:00.000Z",
          },
        },
      },
    });
    renderReview();

    expect(
      await screen.findByText(/Mock Exam ended early/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Exited fullscreen mode during the proctored exam/),
    ).toBeInTheDocument();
  });

  describe("Why was I wrong?", () => {
    const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;
    const GOOD = {
      concept: "DNA naming",
      misconception: "You may be matching the letters to any chemical name that fits.",
      explanation: "DNA is deoxyribonucleic acid: the sugar is deoxyribose. Dinitrogen acetate is not a biological molecule.",
      check: {
        question: "What does the R in RNA stand for?",
        choices: ["Ribose", "Radium"],
        correctIndex: 0,
      },
    };

    function serveExplain(text: string) {
      const edgeCalls: Array<{ tool?: string }> = [];
      const ledgerWrites: Array<Record<string, unknown>> = [];
      server.use(
        http.get(rest("quizzes"), () =>
          HttpResponse.json([
            {
              id: "quiz-1",
              user_id: "user-1",
              title: "Biology basics",
              folder_id: "f-bio",
              material_id: null,
              questions_json: QUESTIONS,
              created_at: "2026-07-01T00:00:00.000Z",
            },
          ]),
        ),
        http.get(rest("quiz_attempts"), () =>
          HttpResponse.json([{ ...ATTEMPT, attempt_key: "run-key-1" }]),
        ),
        http.get(rest("folders"), () =>
          HttpResponse.json([{ id: "f-bio", user_id: "user-1", name: "Biology", color: "#10b981", created_at: "2026-07-01" }]),
        ),
        http.post(EDGE_URL, async ({ request }) => {
          edgeCalls.push((await request.json()) as { tool?: string });
          return HttpResponse.json({ text });
        }),
        http.post(rest("misconceptions"), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          ledgerWrites.push(body);
          return HttpResponse.json({
            id: "mc-1",
            ...body,
            status: "open",
            times_observed: 1,
            times_corrected: 0,
            first_seen_at: "2026-09-01T00:00:00Z",
            last_seen_at: "2026-09-01T00:00:00Z",
            resolved_at: null,
          });
        }),
      );
      return { edgeCalls, ledgerWrites };
    }

    it("is offered on the wrong answer only, and costs nothing until pressed", async () => {
      const { edgeCalls } = serveExplain(JSON.stringify(GOOD));
      renderReview();

      const buttons = await screen.findAllByRole("button", { name: /Why was I wrong\?/ });
      expect(buttons).toHaveLength(1);
      const wrongQuestion = screen.getByText("What does DNA stand for?").closest("article") as HTMLElement;
      expect(within(wrongQuestion).getByRole("button", { name: /Why was I wrong\?/ })).toBeInTheDocument();
      expect(edgeCalls).toHaveLength(0);
    });

    it("explains the mistake, asks a check question, and logs it to the ledger", async () => {
      const { edgeCalls, ledgerWrites } = serveExplain(JSON.stringify(GOOD));
      renderReview();

      await userEvent.click(await screen.findByRole("button", { name: /Why was I wrong\?/ }));

      const panel = await screen.findByRole("region", { name: "Why this answer was wrong" });
      expect(within(panel).getByText(GOOD.misconception)).toBeInTheDocument();
      expect(within(panel).getByText(GOOD.explanation)).toBeInTheDocument();
      expect(within(panel).getByText(GOOD.check.question)).toBeInTheDocument();
      expect(edgeCalls).toHaveLength(1);
      expect(edgeCalls[0].tool).toBe("debugger");

      await userEvent.click(within(panel).getByRole("button", { name: "Radium" }));
      expect(within(panel).getByRole("status")).toHaveTextContent("Not quite. The answer is “Ribose”.");

      await waitFor(() => expect(ledgerWrites).toHaveLength(1));
      expect(ledgerWrites[0]).toMatchObject({
        subject: "Biology",
        concept: "Genetics",
        summary: GOOD.misconception,
        origin_tool: "quiz",
      });
      expect(await within(panel).findByText("Logged to your misconception ledger.")).toBeInTheDocument();
    });

    it("shows a calm fallback, not raw model text, when the reply is unusable", async () => {
      const { ledgerWrites } = serveExplain("Honestly the student just guessed lol");
      renderReview();

      await userEvent.click(await screen.findByRole("button", { name: /Why was I wrong\?/ }));

      expect(await screen.findByText(/not in a form we could show/)).toBeInTheDocument();
      expect(screen.queryByText(/just guessed/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
      expect(ledgerWrites).toHaveLength(0);
    });
  });
});
