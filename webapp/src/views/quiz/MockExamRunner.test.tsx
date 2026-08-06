import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
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

    // Exit fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    expect(await screen.findByText("Quizzes tab")).toBeInTheDocument();
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

    // Switch tab
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(await screen.findByText("Quizzes tab")).toBeInTheDocument();
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
});
