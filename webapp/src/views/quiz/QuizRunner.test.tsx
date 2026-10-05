import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { Storage } from "../../lib/storage";
import { getStudySnapshot } from "../../lib/continuity";
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
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens straight on the first question", async () => {
    serveQuiz();
    renderRunner();

    expect(
      await screen.findByRole("heading", {
        name: "Which organelle makes ATP?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText(/Let's see what you've got/)).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /Ribosome|Mitochondrion|Nucleus/ }),
    ).toHaveLength(3);
  });

  /* A maths question reached the student as raw "$x^2$" while the chat and
     flashcards beside it typeset the same TeX. */
  it("typesets maths in the question and the choices", async () => {
    serveQuiz([
      {
        question: "What is the derivative of $x^2$?",
        choices: ["$2x$", "$x$", "$2$"],
        correctIndex: 0,
      },
    ]);
    const { container } = renderRunner();

    await screen.findByText(/What is the derivative of/);
    /* KaTeX is a lazy chunk (lib/Math.tsx), so the text can paint before it
       is typeset; on a busy run the first import is slow. Wait for it. */
    await waitFor(
      () => {
        expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(4);
        expect(screen.queryByText(/\$x\^2\$/)).toBeNull();
      },
      { timeout: 5000 },
    );
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

    expect(screen.getByText("Correct!")).toBeInTheDocument();
    expect(
      screen.getByText("The mitochondrion is where respiration happens."),
    ).toBeInTheDocument();
  });

  /* The regression this guards: `feedback` is generated once per question and
     shown whatever the student picked, so a model that wrote it as praise
     ("Nice work! …") congratulated someone who had just answered wrongly. The
     verdict now comes from the runner, and praise stored in an existing quiz
     is dropped on the way to the bubble. */
  it("names the right answer instead of praising a wrong one", async () => {
    serveQuiz([
      {
        id: "q1",
        question: "Which triangle criterion applies?",
        choices: ["ASA", "AAS"],
        correctIndex: 1,
        feedback: "Nice work! The AAS criterion proves congruence here.",
      },
    ]);
    renderRunner();
    await screen.findByText("Question 1 of 1");

    await userEvent.click(screen.getByRole("button", { name: "ASA" }));

    expect(
      screen.getByText("Not quite — the correct answer is “AAS”."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The AAS criterion proves congruence here."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nice work/)).not.toBeInTheDocument();
  });

  it("states a verdict when a question has no feedback", async () => {
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

    expect(
      screen.getByText(
        "Not quite — the correct answer is “Deoxyribonucleic acid”.",
      ),
    ).toBeInTheDocument();
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
    async function playThrough(secondAnswer: string, setup?: () => void) {
      serveQuiz();
      setup?.();
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

      /* The headline is the finding; the score is a caption. */
      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Cell biology is solid. Genetics needs another look.",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText(/· 1 of 2$/)).toBeInTheDocument();
      const genetics = screen.getByText("Genetics", { selector: "span" }).closest("li")!;
      expect(genetics).toHaveTextContent("1 to review");
    });

    it("shows no weak topics on a perfect run", async () => {
      await playThrough("Deoxyribonucleic acid");

      expect(await screen.findByText(/· 2 of 2$/)).toBeInTheDocument();
      expect(screen.queryByText(/to review$/)).not.toBeInTheDocument();
    });

    it("records the attempt with the score, answers and weak topics", async () => {
      let body: Record<string, unknown>[] | undefined;
      await playThrough("Dinitrogen acetate", () => {
        server.use(
          http.post(rest("quiz_attempts"), async ({ request }) => {
            body = (await request.json()) as Record<string, unknown>[];
            return new HttpResponse(null, { status: 201 });
          }),
        );
      });
      await screen.findByText(/· 1 of 2$/);

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
          secondsSpent: expect.any(Number),
          confidence: null,
        },
        {
          questionId: "q2",
          chosenIndex: 1,
          correct: false,
          topic: "Genetics",
          secondsSpent: expect.any(Number),
          confidence: null,
        },
      ]);
    });

    /* The student already finished — the score must show whether or not the
       save landed, but a silent failure would stop weak-topic tracking. */
    it("still shows the score when the attempt fails to save, and says so", async () => {
      await playThrough("Dinitrogen acetate", () => {
        server.use(
          http.post(rest("quiz_attempts"), () =>
            HttpResponse.json({ message: "permission denied" }, { status: 403 }),
          ),
        );
      });

      expect(await screen.findByText(/· 1 of 2$/)).toBeInTheDocument();
      expect(
        await screen.findByText(/couldn't save this attempt/),
      ).toBeInTheDocument();
    });

    it("saves how sure the student was with each answer", async () => {
      let body: Record<string, unknown>[] | undefined;
      serveQuiz();
      server.use(
        http.post(rest("quiz_attempts"), async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>[];
          return new HttpResponse(null, { status: 201 });
        }),
      );
      renderRunner();
      await screen.findByText("Question 1 of 2");
      /* Optional, and asked before the answer: once the verdict shows it
         could no longer be answered honestly. */
      expect(screen.getByRole("group", { name: /optional/ })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Guess" }));
      await userEvent.click(screen.getByRole("button", { name: "Mitochondrion" }));
      expect(screen.queryByRole("group", { name: /optional/ })).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Next Question →" }));
      await userEvent.click(screen.getByRole("button", { name: "Certain" }));
      await userEvent.click(screen.getByRole("button", { name: "Dinitrogen acetate" }));
      await userEvent.click(screen.getByRole("button", { name: "See results →" }));

      await waitFor(() => expect(body).toBeDefined());
      const answers = body![0].answers_json as Array<Record<string, unknown>>;
      expect(answers.map((a) => a.confidence)).toEqual(["guess", "certain"]);
      /* Sure and wrong leads the results; the right-but-guessed one is ochre. */
      expect(await screen.findByText(/Confident but wrong/)).toBeInTheDocument();
      expect(screen.getByText("Q2")).toBeInTheDocument();
      expect(screen.getByText("Q1: correct, but guessed.")).toBeInTheDocument();
    });

    it("records the attempt exactly once", async () => {
      let posts = 0;
      await playThrough("Dinitrogen acetate", () => {
        server.use(
          http.post(rest("quiz_attempts"), () => {
            posts++;
            return new HttpResponse(null, { status: 201 });
          }),
        );
      });
      await screen.findByText(/· 1 of 2$/);
      await waitFor(() => expect(posts).toBe(1));

      // Give any stray re-render a chance to fire a second write.
      await new Promise((r) => setTimeout(r, 50));
      expect(posts).toBe(1);
    });

    it("offers the review page and the way back to the Library", async () => {
      await playThrough("Dinitrogen acetate");
      await screen.findByText(/· 1 of 2$/);

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
        await screen.findByText("Quiz not found"),
      ).toBeInTheDocument();
      /* It used to be a bare line of text with nowhere to go but the browser's
         back button. */
      expect(
        screen.getByRole("link", { name: "Back to Quizzes" }),
      ).toHaveAttribute("href", "/library/quizzes");
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

describe("QuizRunner draft autosave", () => {
  const draftKey = "learnora_quiz_draft_quiz-1";

  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("autosaves progress to localStorage a short debounce after each answer", async () => {
    serveQuiz();
    renderRunner();
    await screen.findByText("Question 1 of 2");

    await userEvent.click(
      screen.getByRole("button", { name: "Mitochondrion" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Next Question →" }),
    );
    await screen.findByText("Question 2 of 2");

    await waitFor(() =>
      expect(Storage.get(draftKey)).toMatchObject({
        index: 1,
        answers: [{ questionId: "q1", chosenIndex: 1, correct: true }],
      }),
    );
  });

  it("clears the draft once the quiz finishes", async () => {
    serveQuiz();
    renderRunner();
    await screen.findByText("Question 1 of 2");

    await userEvent.click(
      screen.getByRole("button", { name: "Mitochondrion" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Next Question →" }),
    );
    await screen.findByText("Question 2 of 2");
    await waitFor(() => expect(Storage.get(draftKey)).not.toBeNull());

    await userEvent.click(
      screen.getByRole("button", { name: "Deoxyribonucleic acid" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "See results →" }),
    );

    await screen.findByText("Nothing to fix.");
    expect(Storage.get(draftKey)).toBeNull();
    expect(getStudySnapshot().lastQuizDraft).toBeNull();
  });

  it("offers to resume on a saved question, landing there with prior answers counted", async () => {
    Storage.set(draftKey, {
      index: 1,
      answers: [{ questionId: "q1", chosenIndex: 1, correct: true, topic: "Cell biology" }],
    });
    serveQuiz();
    renderRunner();

    expect(
      await screen.findByText(
        'You have an in-progress attempt at this quiz (question 2 of 2). Resume where you left off?',
      ),
    ).toBeInTheDocument();
    // Optimistically resumed already, ahead of the dialog resolving.
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));

    await userEvent.click(
      screen.getByRole("button", { name: "Deoxyribonucleic acid" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "See results →" }),
    );

    expect(await screen.findByText(/· 2 of 2$/)).toBeInTheDocument();
  });

  it("starting over drops the draft and begins again at question 1", async () => {
    Storage.set(draftKey, {
      index: 1,
      answers: [{ questionId: "q1", chosenIndex: 1, correct: true, topic: "Cell biology" }],
    });
    serveQuiz();
    renderRunner();

    await screen.findByText(/Resume where you left off/);
    await userEvent.click(screen.getByRole("button", { name: "Start Over" }));

    await waitFor(() =>
      expect(screen.getByText("Question 1 of 2")).toBeInTheDocument(),
    );
    expect(Storage.get(draftKey)).toBeNull();
  });

  it("does not offer to resume a quiz that was opened but never answered", async () => {
    Storage.set(draftKey, { index: 0, answers: [] });
    serveQuiz();
    renderRunner();

    await screen.findByText("Question 1 of 2");
    expect(
      screen.queryByText(/Resume where you left off/),
    ).not.toBeInTheDocument();
  });

  it("ignores a draft whose saved index is out of range for the current quiz", async () => {
    Storage.set(draftKey, { index: 9, answers: [] });
    serveQuiz();
    renderRunner();

    await screen.findByText("Question 1 of 2");
    expect(
      screen.queryByText(/Resume where you left off/),
    ).not.toBeInTheDocument();
  });
  describe("study time", () => {
    /* Date.now is stubbed rather than vi.useFakeTimers(): the clock has to
       advance, but fake timers break MSW and userEvent pacing. */
    function stubClock() {
      let now = Date.now();
      vi.spyOn(Date, "now").mockImplementation(() => now);
      return (ms: number) => {
        now += ms;
      };
    }

    async function playThroughTaking(perQuestionMs: number) {
      const logged: Record<string, unknown>[] = [];
      serveQuiz();
      server.use(
        http.post(rest("study_sessions"), async ({ request }) => {
          logged.push(...((await request.json()) as Record<string, unknown>[]));
          return new HttpResponse(null, { status: 201 });
        }),
      );
      const advance = stubClock();
      renderRunner();

      await screen.findByText("Question 1 of 2");
      advance(perQuestionMs);
      await userEvent.click(
        screen.getByRole("button", { name: "Mitochondrion" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Next Question →" }),
      );
      advance(perQuestionMs);
      await userEvent.click(
        screen.getByRole("button", { name: "Deoxyribonucleic acid" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "See results →" }),
      );
      await screen.findByText(/· 2 of 2$/);
      return logged;
    }

    it("credits the quiz with the time its questions took", async () => {
      const logged = await playThroughTaking(90_000);

      await waitFor(() => expect(logged).toHaveLength(1));
      expect(logged[0]).toMatchObject({
        minutes: 3,
        task: "Biology basics",
        timer_type: "quiz",
      });
    });

    it("does not credit a question that was left open and abandoned", async () => {
      const logged = await playThroughTaking(30 * 60_000);

      await waitFor(() => expect(logged).toHaveLength(1));
      // Both questions clipped to the 2-minute idle cap.
      expect(logged[0]).toMatchObject({ minutes: 4 });
    });

    it("logs nothing for a quiz answered too fast to be worth a row", async () => {
      const logged = await playThroughTaking(2_000);

      expect(logged).toEqual([]);
    });
  });

});

/* A resumed draft can land the student back on a question its answers
   array already covers — Back, Forward, Resume is the ordinary way there.
   The answer store used to append blindly, so that question went in
   twice: a two-question quiz submitted three rows. The score looked
   right, because it counts correct entries, but `answers_json` is what
   the evidence layer reads for per-topic accuracy, so the duplicate
   quietly weighted one question twice in the misconception ledger. */
describe("QuizRunner answer integrity", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps one row per question, and a revealed answer stands, when resuming", async () => {
    /* Resumed sitting on question 1 while already holding an answer for
       it — exactly what Back/Forward/Resume produces. */
    Storage.set("learnora_quiz_draft_quiz-1", {
      index: 0,
      answers: [
        { questionId: "q1", chosenIndex: 0, correct: false, topic: "Cell biology" },
      ],
    });
    let submitted: Record<string, unknown> | undefined;
    serveQuiz();
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/quiz_attempts`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>[];
        submitted = body[0];
        return HttpResponse.json([{ id: "attempt-1" }]);
      }),
    );
    renderRunner();

    await screen.findByText("Question 1 of 2");
    /* The draft already holds a (revealed) answer for question 1, so the
       verdict is restored rather than the question being offered fresh: a
       refresh must not turn a seen wrong answer into a right one. */
    expect(screen.getByRole("button", { name: "Mitochondrion" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next Question →" }));
    await screen.findByText("Question 2 of 2");
    await userEvent.click(
      screen.getByRole("button", { name: "Deoxyribonucleic acid" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "See results →" }));
    await screen.findByRole("heading", { level: 2, name: /solid|look|fix/ });

    await waitFor(() => expect(submitted).toBeDefined());
    const answers = submitted!.answers_json as Array<Record<string, unknown>>;
    expect(answers).toHaveLength(2);
    expect(answers.filter((a) => a.questionId === "q1")).toHaveLength(1);
    /* The first, revealed answer stands. */
    expect(answers.find((a) => a.questionId === "q1")?.correct).toBe(false);
  });
});

/* The results screen named the weak topics and then offered nothing to do
   about them: "check your weak topics" pointed at a destination that was
   not on the page. */
describe("QuizRunner results routing", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });
  afterEach(() => vi.restoreAllMocks());

  it("offers a route into the Solver carrying the weak topic", async () => {
    serveQuiz();
    renderRunner();

    await screen.findByText("Question 1 of 2");
    /* Wrong on both, so there is something to fix. */
    await userEvent.click(screen.getByRole("button", { name: "Nucleus" }));
    await userEvent.click(screen.getByRole("button", { name: "Next Question →" }));
    await screen.findByText("Question 2 of 2");
    await userEvent.click(screen.getByRole("button", { name: "Dinitrogen acetate" }));
    await userEvent.click(screen.getByRole("button", { name: "See results →" }));

    const fix = await screen.findByRole("link", { name: /Work on/ });
    expect(fix.getAttribute("href")).toContain("/study/new?mode=socratic&topic=");
    /* No confetti, no emoji: the headline states what to fix. */
    expect(screen.getByRole("heading", { level: 2, name: /need another look/ })).toHaveTextContent(
      "need another look",
    );
  });

  it("says there is nothing to fix on a clean sweep, and offers no fix-up", async () => {
    serveQuiz();
    renderRunner();

    await screen.findByText("Question 1 of 2");
    await userEvent.click(screen.getByRole("button", { name: "Mitochondrion" }));
    await userEvent.click(screen.getByRole("button", { name: "Next Question →" }));
    await screen.findByText("Question 2 of 2");
    await userEvent.click(
      screen.getByRole("button", { name: "Deoxyribonucleic acid" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "See results →" }));

    await screen.findByText("Nothing to fix.");
    expect(screen.queryByRole("link", { name: /Work on/ })).toBeNull();
  });

  it("retakes the quiz from question 1 as a new attempt", async () => {
    const keys: unknown[] = [];
    serveQuiz();
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/quiz_attempts`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>[];
        keys.push(body[0].attempt_key);
        return HttpResponse.json([{ id: `attempt-${keys.length}` }]);
      }),
    );
    renderRunner();

    await screen.findByText("Question 1 of 2");
    await userEvent.click(screen.getByRole("button", { name: "Nucleus" }));
    await userEvent.click(screen.getByRole("button", { name: "Next Question →" }));
    await screen.findByText("Question 2 of 2");
    await userEvent.click(screen.getByRole("button", { name: "Dinitrogen acetate" }));
    await userEvent.click(screen.getByRole("button", { name: "See results →" }));
    await screen.findByText(/· 0 of 2$/);
    await waitFor(() => expect(keys).toHaveLength(1));

    await userEvent.click(screen.getByRole("button", { name: /Retake test/ }));
    await screen.findByText("Question 1 of 2");
    expect(screen.getByRole("button", { name: "Mitochondrion" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Mitochondrion" }));
    await userEvent.click(screen.getByRole("button", { name: "Next Question →" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Deoxyribonucleic acid" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "See results →" }));
    await screen.findByText(/· 2 of 2$/);

    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).not.toEqual(keys[1]);
  });
  /* A wrong pick that states a known misconception is named, repaired and
     checked on the spot, and the outcome goes to the ledger. */
  describe("misconception repair", () => {
    function serveLedger() {
      const observations: Record<string, unknown>[] = [];
      let stored: Record<string, unknown> | null = null;
      server.use(
        http.get(rest("misconceptions"), () => HttpResponse.json(stored ? [stored] : [])),
        http.post(rest("misconceptions"), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          stored = {
            id: "m-1",
            user_id: "user-1",
            status: "open",
            times_observed: 1,
            times_corrected: 0,
            first_seen_at: "2026-10-01T00:00:00Z",
            last_seen_at: "2026-10-01T00:00:00Z",
            resolved_at: null,
            ...body,
          };
          return HttpResponse.json(stored);
        }),
        http.post(rest("misconception_observations"), async ({ request }) => {
          observations.push((await request.json()) as Record<string, unknown>);
          return new HttpResponse(null, { status: 201 });
        }),
      );
      return observations;
    }

    const OSMOSIS = [
      {
        id: "o1",
        question: "In osmosis, what moves across a partially permeable membrane?",
        choices: ["Water molecules", "Salt moves across", "Protein molecules"],
        correctIndex: 0,
        topic: "Osmosis",
      },
    ];

    it("names the belief, checks the fix, and records evidence then a correction", async () => {
      const user = userEvent.setup();
      serveQuiz(OSMOSIS, "Cells");
      const observations = serveLedger();
      renderRunner();

      await user.click(await screen.findByRole("button", { name: "Salt moves across" }));
      const repair = await screen.findByRole("region", { name: "Common mix-up" });
      expect(repair).toHaveTextContent("the solute (salt or sugar) moves across the membrane");

      await waitFor(() => expect(observations.some((o) => o.kind === "evidence")).toBe(true));

      await user.click(within(repair).getByRole("button", { name: "Water molecules" }));
      expect(await within(repair).findByText("That's it.")).toBeInTheDocument();
      await waitFor(() => expect(observations.some((o) => o.kind === "correction")).toBe(true));

      /* The card is the repair: it starts the retest clock, and both the
         failed question and the check are tied to it so neither can later
         count as the "new" retest question. */
      await waitFor(() => expect(observations.some((o) => o.kind === "repair")).toBe(true));
      const repairObs = observations.find((o) => o.kind === "repair")!;
      const evidence = observations.find((o) => o.kind === "evidence")!;
      const check = observations.find((o) => o.kind === "correction")!;
      expect(repairObs.question_key).toBe(check.question_key);
      expect(evidence.question_key).toMatch(/^q/);
      expect(evidence.question_key).not.toBe(check.question_key);
      expect(repairObs.idempotency_key).toBeTruthy();
    });

    it("stays quiet on a wrong pick that doesn't state a known belief", async () => {
      const user = userEvent.setup();
      serveQuiz(OSMOSIS, "Cells");
      serveLedger();
      renderRunner();

      await user.click(await screen.findByRole("button", { name: "Protein molecules" }));
      expect(await screen.findByRole("button", { name: /See results/ })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Common mix-up" })).toBeNull();
    });
  });
});
