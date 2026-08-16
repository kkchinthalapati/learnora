import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { Storage } from "../../lib/storage";
import { MockExamRunner } from "./MockExamRunner";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

const SAMPLE_QUIZ = {
  id: "quiz-1",
  user_id: "user-1",
  title: "Bio Exam",
  questions_json: [
    {
      question: "What is mitochondria?",
      choices: ["Powerhouse", "Cell wall"],
      correctIndex: 0,
      topic: "Cells",
    },
    {
      question: "Is water wet?",
      choices: ["Yes", "No"],
      correctIndex: 0,
      topic: "Water",
    },
  ],
};

function serveQuiz(row: unknown) {
  server.use(
    http.get(rest("quizzes"), ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("id") === "eq.quiz-1" && row) {
        return HttpResponse.json([row]);
      }
      return HttpResponse.json([]);
    }),
  );
}

function renderRunner() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/quiz/quiz-1/mock-exam"]}>
      <Routes>
        <Route path="/quiz/:quizId/mock-exam" element={<MockExamRunner />} />
        <Route path="/library/quizzes" element={<h1>Quizzes tab</h1>} />
        <Route path="/quiz/:quizId/review" element={<h1>Review page</h1>} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

describe("MockExamRunner", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires fullscreen to start", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();
    expect(await screen.findByText(/This is a strict mock exam/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Begin Mock Exam/ })).toBeInTheDocument();
  });

  it("shows questions and timer when in fullscreen", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();
    
    // Simulate being in fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    
    // Fire the event manually to trigger the useEffect
    document.dispatchEvent(new Event("fullscreenchange"));

    expect(await screen.findByText("What is mitochondria?")).toBeInTheDocument();
    expect(screen.getByText(/Time Left:/)).toBeInTheDocument();
  });

  it("exits if fullscreen is exited", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
    await screen.findByText("What is mitochondria?");

    // Exit fullscreen — this only starts the 5s grace-period countdown
    // (useExamProctor), it doesn't terminate immediately.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    act(() => {
      vi.advanceTimersByTime(5100);
    });
    vi.useRealTimers();

    expect(await screen.findByText("Review page")).toBeInTheDocument();
  });

  it("offers Return to fullscreen button during fullscreen grace period", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
    await screen.findByText("What is mitochondria?");

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    expect(
      await screen.findByRole("button", { name: "Return to fullscreen" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("You exited fullscreen!");
  });

  it("exits if tab is switched (visibilitychange)", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
    await screen.findByText("What is mitochondria?");

    // Switch tab — only starts the 5s grace-period countdown, not an
    // immediate termination.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(5100);
    });
    vi.useRealTimers();

    expect(await screen.findByText("Review page")).toBeInTheDocument();
  });

  it("automatically advances without showing right/wrong feedback", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();
    
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    await userEvent.click(await screen.findByRole("button", { name: "Powerhouse" }));

    // Should immediately go to question 2 without Next button or Feedback
    expect(await screen.findByText("Is water wet?")).toBeInTheDocument();
    expect(screen.queryByText(/Correct!/)).not.toBeInTheDocument();
  });

  it("ends exam and records attempt when all questions answered", async () => {
    serveQuiz(SAMPLE_QUIZ);
    let attemptRecorded = false;
    server.use(
      http.post(rest("quiz_attempts"), () => {
        attemptRecorded = true;
        return HttpResponse.json([{}]);
      }),
    );

    renderRunner();
    
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    await userEvent.click(await screen.findByRole("button", { name: "Powerhouse" }));
    await userEvent.click(await screen.findByRole("button", { name: "Yes" }));

    expect(await screen.findByText("Exam Complete!")).toBeInTheDocument();
    expect(screen.getByText("2 / 2 correct")).toBeInTheDocument();
    
    await waitFor(() => expect(attemptRecorded).toBe(true));
  });

  it("ends exam automatically when time is up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serveQuiz(SAMPLE_QUIZ); // 2 questions = 2 minutes = 120 seconds
    renderRunner();
    
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    await screen.findByText("What is mitochondria?");

    // Advance 120 seconds, 1 second at a time to allow React state updates to flush
    for (let i = 0; i < 120; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    vi.useRealTimers();

    expect(await screen.findByText("Exam Complete!")).toBeInTheDocument();
    expect(screen.getByText("Time's up!")).toBeInTheDocument();
    expect(screen.getByText("0 / 2 correct")).toBeInTheDocument();
  });

  it("does not terminate when the tab is switched before the exam has started", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();

    // Still on the pre-fullscreen instructions screen — never clicked
    // "Begin Mock Exam".
    await screen.findByText(/This is a strict mock exam/);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(screen.queryByText("Quizzes tab")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Begin Mock Exam/ }),
    ).toBeInTheDocument();
  });

  it("does not terminate when the tab is switched after the exam is already finished", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    await userEvent.click(await screen.findByRole("button", { name: "Powerhouse" }));
    await userEvent.click(await screen.findByRole("button", { name: "Yes" }));
    await screen.findByText("Exam Complete!");

    // Leaving the tab to celebrate (or just breathe) before clicking
    // "Review Answers" must not be mistaken for leaving mid-exam.
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(screen.queryByText("Quizzes tab")).not.toBeInTheDocument();
    expect(screen.getByText("Exam Complete!")).toBeInTheDocument();
  });

  it("records a partial attempt when the exam is terminated early", async () => {
    serveQuiz(SAMPLE_QUIZ);
    let attemptRecorded = false;
    server.use(
      http.post(rest("quiz_attempts"), async ({ request }) => {
        const [row] = (await request.clone().json()) as {
          score?: number;
          total?: number;
        }[];
        expect(row.score).toBe(1);
        expect(row.total).toBe(2);
        attemptRecorded = true;
        return HttpResponse.json([{}]);
      }),
    );

    renderRunner();

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    // Answer only the first (correct) question, then get pulled away.
    await userEvent.click(await screen.findByRole("button", { name: "Powerhouse" }));
    await screen.findByText("Is water wet?");

    // Only starts the 5s grace-period countdown, not an immediate
    // termination.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(5100);
    });
    vi.useRealTimers();

    expect(await screen.findByText("Review page")).toBeInTheDocument();
    await waitFor(() => expect(attemptRecorded).toBe(true));
  });
});

describe("MockExamRunner draft autosave", () => {
  const draftKey = "learnora_exam_draft_quiz-1";

  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function enterFullscreen() {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
  }

  it("autosaves index, answers, and the exam end time after answering a question", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();
    enterFullscreen();

    await userEvent.click(await screen.findByRole("button", { name: "Powerhouse" }));
    await screen.findByText("Is water wet?");

    await waitFor(() => {
      const draft = Storage.get<{
        index: number;
        answers: unknown[];
        examEndAt: number;
      }>(draftKey);
      expect(draft).not.toBeNull();
      expect(draft!.index).toBe(1);
      expect(draft!.answers).toHaveLength(1);
      expect(typeof draft!.examEndAt).toBe("number");
    });
  });

  it("resumes on the saved question with prior answers counted and time computed from the saved end time", async () => {
    serveQuiz(SAMPLE_QUIZ);
    Storage.set(draftKey, {
      index: 1,
      answers: [{ questionId: 0, chosenIndex: 0, correct: true, topic: "Cells" }],
      examEndAt: Date.now() + 45_000,
    });

    renderRunner();
    enterFullscreen();

    expect(await screen.findByText("Is water wet?")).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    // Computed fresh from the saved end timestamp, not a persisted countdown
    // — should read close to the 45s that was left when the draft was saved.
    expect(screen.getByText(/Time Left: 0:4[0-5]/)).toBeInTheDocument();
  });

  it("resumes as finished immediately when the saved end time has already passed", async () => {
    serveQuiz(SAMPLE_QUIZ);
    Storage.set(draftKey, {
      index: 0,
      answers: [],
      examEndAt: Date.now() - 5000,
    });

    renderRunner();
    enterFullscreen();

    expect(await screen.findByText("Exam Complete!")).toBeInTheDocument();
    expect(screen.getByText("Time's up!")).toBeInTheDocument();
    expect(screen.getByText("0 / 2 correct")).toBeInTheDocument();
  });

  it("ignores a draft whose saved index is out of range for the current exam", async () => {
    serveQuiz(SAMPLE_QUIZ);
    Storage.set(draftKey, { index: 99, answers: [], examEndAt: Date.now() + 60_000 });

    renderRunner();
    enterFullscreen();

    expect(await screen.findByText("What is mitochondria?")).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
  });

  it("clears the draft once the exam finishes normally", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();
    enterFullscreen();

    await userEvent.click(await screen.findByRole("button", { name: "Powerhouse" }));
    await userEvent.click(await screen.findByRole("button", { name: "Yes" }));

    await screen.findByText("Exam Complete!");
    expect(Storage.get(draftKey)).toBeNull();
  });

  it("clears the draft when the exam is ended early", async () => {
    serveQuiz(SAMPLE_QUIZ);
    renderRunner();
    enterFullscreen();

    await screen.findByText("What is mitochondria?");
    await waitFor(() => expect(Storage.get(draftKey)).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "End Exam Early" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "End Exam" }),
    );

    await waitFor(() => expect(Storage.get(draftKey)).toBeNull());
  });
});
