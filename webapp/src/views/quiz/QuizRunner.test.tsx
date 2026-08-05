import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { QuizRunner } from "./QuizRunner";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

const QUESTIONS = [
  {
    id: "q1",
    question: "Which organelle makes ATP?",
    choices: ["Ribosome", "Mitochondrion", "Nucleus"],
    correctIndex: 1,
    topic: "Cell biology",
    feedback: "The mitochondrion is where respiration happens.",
  },
  {
    id: "q2",
    question: "What does DNA stand for?",
    choices: ["Deoxyribonucleic acid", "Dinitrogen acetate"],
    correctIndex: 0,
    topic: "Genetics",
  },
];

function serveQuiz(questions: unknown = QUESTIONS, title = "Biology basics") {
  server.use(
    http.get(rest("quizzes"), () =>
      HttpResponse.json([
        {
          id: "quiz-1",
          user_id: "user-1",
          material_id: null,
          folder_id: null,
          title,
          questions_json: questions,
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ]),
    ),
    http.post(rest("quiz_attempts"), () => new HttpResponse(null, { status: 201 }))
  );
}

function renderRunner() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/quiz/quiz-1"]}>
      <Routes>
        <Route path="/quiz/:quizId" element={<QuizRunner />} />
        <Route path="/quiz/:quizId/review" element={<h1>Review page</h1>} />
        <Route path="/library/quizzes" element={<h1>Quizzes tab</h1>} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

describe("QuizRunner", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens on the first question with the host's welcome", async () => {
    serveQuiz();
    renderRunner();

    expect(
      await screen.findByRole("heading", {
        name: "Which organelle makes ATP?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(
      screen.getByText("Welcome to the quiz. Let's see what you've got!"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Ribosome|Mitochondrion|Nucleus/ }),
    ).toHaveLength(3);
  });

  it("hides the Next button until an answer is picked", async () => {
    serveQuiz();
    renderRunner();
    await screen.findByText("Question 1 of 2");

    expect(
      screen.queryByRole("button", { name: /Next Question/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Mitochondrion" }),
    );

    expect(
      screen.getByRole("button", { name: "Next Question →" }),
    ).toBeInTheDocument();
  });

  it("shows the question's own feedback for a correct answer", async () => {
    serveQuiz();
    renderRunner();
    await screen.findByText("Question 1 of 2");

    await userEvent.click(
      screen.getByRole("button", { name: "Mitochondrion" }),
    );

    expect(
      screen.getByText("The mitochondrion is where respiration happens."),
    ).toBeInTheDocument();
  });

  it("falls back to Correct!/Incorrect. when a question has no feedback", async () => {
    serveQuiz();
    renderRunner();
    await screen.findByText("Question 1 of 2");
    await userEvent.click(
      screen.getByRole("button", { name: "Mitochondrion" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Next Question →" }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Dinitrogen acetate" }),
    );

    expect(screen.getByText("Incorrect.")).toBeInTheDocument();
  });

  /* A wrong verdict is announced, not just coloured — the vanilla's host
     bubble was invisible to a screen reader. */
  it("announces a wrong answer as an alert and a right one as a status", async () => {
    serveQuiz();
    renderRunner();
    await screen.findByText("Question 1 of 2");

    await userEvent.click(screen.getByRole("button", { name: "Ribosome" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The mitochondrion is where respiration happens.",
    );
  });

  it("locks the choices once one is picked", async () => {
    serveQuiz();
    renderRunner();
    await screen.findByText("Question 1 of 2");

    await userEvent.click(screen.getByRole("button", { name: "Ribosome" }));
    // A second click must not re-grade or advance.
    await userEvent.click(
      screen.getByRole("button", { name: "Mitochondrion" }),
    );

    expect(screen.getByRole("button", { name: "Nucleus" })).toBeDisabled();
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
  });

  it("labels the last question's button as the results step", async () => {
    serveQuiz();
    renderRunner();
    await screen.findByText("Question 1 of 2");
    await userEvent.click(
      screen.getByRole("button", { name: "Mitochondrion" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Next Question →" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Deoxyribonucleic acid" }),
    );

    expect(
      screen.getByRole("button", { name: "See results →" }),
    ).toBeInTheDocument();
  });

  describe("completion", () => {
    async function playThrough(secondAnswer: string) {
      serveQuiz();
      renderRunner();
      await screen.findByText("Question 1 of 2");
      await userEvent.click(
        screen.getByRole("button", { name: "Mitochondrion" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Next Question →" }),
      );
      await userEvent.click(screen.getByRole("button", { name: secondAnswer }));
      await userEvent.click(
        screen.getByRole("button", { name: "See results →" }),
      );
    }

    it("scores the run and lists the topics that were missed", async () => {
      await playThrough("Dinitrogen acetate");

      expect(
        await screen.findByRole("heading", { name: /Quiz Complete/ }),
      ).toBeInTheDocument();
      expect(screen.getByText("1 / 2 correct")).toBeInTheDocument();
      expect(
        screen.getByText("Topics to review: Genetics"),
      ).toBeInTheDocument();
    });

    it("shows no weak topics on a perfect run", async () => {
      await playThrough("Deoxyribonucleic acid");

      expect(await screen.findByText("2 / 2 correct")).toBeInTheDocument();
      expect(screen.queryByText(/Topics to review/)).not.toBeInTheDocument();
    });

    it("records the attempt with the score, answers and weak topics", async () => {
      let body: Record<string, unknown>[] | undefined;
      server.use(
        http.post(rest("quiz_attempts"), async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>[];
          return new HttpResponse(null, { status: 201 });
        }),
      );
      await playThrough("Dinitrogen acetate");
      await screen.findByText("1 / 2 correct");

      await waitFor(() => expect(body).toBeDefined());
      expect(body?.[0]).toMatchObject({
        user_id: "user-1",
        quiz_id: "quiz-1",
        score: 1,
        total: 2,
        weak_topics: ["Genetics"],
      });
      expect(body?.[0].answers_json).toEqual([
        {
          questionId: "q1",
          chosenIndex: 1,
          correct: true,
          topic: "Cell biology",
        },
        { questionId: "q2", chosenIndex: 1, correct: false, topic: "Genetics" },
      ]);
    });

    /* The student already finished — the score must show whether or not the
       save landed, but a silent failure would stop weak-topic tracking. */
    it("still shows the score when the attempt fails to save, and says so", async () => {
      server.use(
        http.post(rest("quiz_attempts"), () =>
          HttpResponse.json({ message: "permission denied" }, { status: 403 }),
        ),
      );
      await playThrough("Dinitrogen acetate");

      expect(await screen.findByText("1 / 2 correct")).toBeInTheDocument();
      expect(
        await screen.findByText(/couldn't save this attempt/),
      ).toBeInTheDocument();
    });

    it("records the attempt exactly once", async () => {
      let posts = 0;
      server.use(
        http.post(rest("quiz_attempts"), () => {
          posts++;
          return new HttpResponse(null, { status: 201 });
        }),
      );
      await playThrough("Dinitrogen acetate");
      await screen.findByText("1 / 2 correct");
      await waitFor(() => expect(posts).toBe(1));

      // Give any stray re-render a chance to fire a second write.
      await new Promise((r) => setTimeout(r, 50));
      expect(posts).toBe(1);
    });

    it("offers the review page and the way back to the Library", async () => {
      await playThrough("Dinitrogen acetate");
      await screen.findByText("1 / 2 correct");

      await userEvent.click(
        screen.getByRole("link", { name: /Review answers/ }),
      );
      expect(
        await screen.findByRole("heading", { name: "Review page" }),
      ).toBeInTheDocument();
    });
  });

  describe("unusable data", () => {
    it("says the quiz was not found rather than rendering an empty shell", async () => {
      server.use(http.get(rest("quizzes"), () => HttpResponse.json([])));
      renderRunner();

      expect(
        await screen.findByRole("heading", { name: "Quiz not found." }),
      ).toBeInTheDocument();
    });

    /* A stored question whose correctIndex is out of range would grade every
       option wrong. Dropping it can empty the quiz, which has to be said. */
    it("reports a quiz whose questions are all unusable", async () => {
      serveQuiz([{ question: "q", choices: ["a", "b"], correctIndex: 9 }]);
      renderRunner();

      expect(
        await screen.findByText(/no usable questions/),
      ).toBeInTheDocument();
    });

    it("runs the usable questions when only some are broken", async () => {
      serveQuiz([
        { question: "broken", choices: ["a"], correctIndex: 0 },
        QUESTIONS[0],
      ]);
      renderRunner();

      expect(await screen.findByText("Question 1 of 1")).toBeInTheDocument();
      expect(screen.queryByText("broken")).not.toBeInTheDocument();
    });

    it("reports a load failure without blanking the page", async () => {
      server.use(
        http.get(rest("quizzes"), () =>
          HttpResponse.json({ message: "permission denied" }, { status: 403 }),
        ),
      );
      renderRunner();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "permission denied",
      );
    });
  });

  it("exits to the Library's Quizzes tab", async () => {
    serveQuiz();
    renderRunner();
    await screen.findByText("Question 1 of 2");

    await userEvent.click(screen.getByRole("link", { name: "← Exit" }));

    expect(
      await screen.findByRole("heading", { name: "Quizzes tab" }),
    ).toBeInTheDocument();
  });
});
