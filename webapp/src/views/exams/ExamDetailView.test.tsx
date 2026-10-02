import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { localDateStr } from "../../lib/date";
import { ExamDetailView } from "./ExamDetailView";

const REST = `${SUPABASE_URL}/rest/v1`;
const FUTURE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 20);
  return localDateStr(d);
})();
const RECENT = new Date(Date.now() - 2 * 86400000).toISOString();

function serveExam(extra: Record<string, unknown> = {}) {
  server.use(
    http.get(`${REST}/exams`, () =>
      HttpResponse.json([
        {
          id: 5,
          user_id: "user-1",
          exam_name: "Biology Paper 1",
          exam_date: FUTURE,
          difficulty: "Medium",
          status: "Scheduled",
          ...extra,
        },
      ]),
    ),
  );
}

function render(path = "/exams/5") {
  return renderWithAuth(
    <Routes>
      <Route path="/exams/:examId" element={<ExamDetailView />} />
      <Route path="/quiz/:quizId" element={<h1>Quiz runner</h1>} />
    </Routes>,
    { session: fakeSession() },
    { initialEntries: [path] },
  );
}

describe("ExamDetailView", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => vi.restoreAllMocks());

  it("asks for a specification when the exam has none", async () => {
    serveExam();
    render();
    expect(await screen.findByText("Which exam is this?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose specification" })).toBeInTheDocument();
  });

  it("says when the exam does not exist", async () => {
    serveExam();
    render("/exams/999");
    expect(await screen.findByText("Exam not found")).toBeInTheDocument();
  });

  it("ranks the spec's topics by marks still on the table, from the student's own quizzes", async () => {
    serveExam({ syllabus_id: "aqa-gcse-biology-8461", syllabus_tier: "Higher" });
    server.use(
      http.get(`${REST}/quizzes`, () =>
        HttpResponse.json([
          {
            id: "q1",
            user_id: "user-1",
            material_id: null,
            folder_id: null,
            title: "Respiration",
            created_at: RECENT,
            questions_json: Array.from({ length: 5 }, (_, i) => ({
              id: i,
              question: `Q${i}`,
              choices: ["a", "b"],
              correctIndex: 0,
              topic: "Anaerobic respiration",
            })),
          },
        ]),
      ),
      http.get(`${REST}/quiz_attempts`, () =>
        HttpResponse.json([
          {
            id: "a1",
            user_id: "user-1",
            quiz_id: "q1",
            score: 1,
            total: 5,
            weak_topics: null,
            created_at: RECENT,
            answers_json: Array.from({ length: 5 }, (_, i) => ({
              questionId: i,
              chosenIndex: 0,
              correct: i === 0,
              topic: "Anaerobic respiration",
              confidence: "certain",
            })),
          },
        ]),
      ),
    );
    render();

    expect(await screen.findByText("AQA GCSE Biology (8461), Higher tier")).toBeInTheDocument();
    const rows = await screen.findAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("4.4.2");
    expect(rows[0]).toHaveTextContent("Respiration");
    expect(rows[0]).toHaveTextContent("Weak");
    expect(rows[0]).toHaveTextContent("20% over 5 answers");
    expect(screen.getByRole("link", { name: "Study Respiration" })).toHaveAttribute(
      "href",
      "/study?topic=Respiration",
    );
    // one quiz is below the forecast floor: the page says how many more it needs
    expect(screen.getByText(/4 more and a forecast appears here/)).toBeInTheDocument();
    expect(screen.getByText(/When you were certain/)).toBeInTheDocument();
  });
  it("prints a complete report: every topic shown, controls hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    serveExam({ syllabus_id: "aqa-gcse-biology-8461", syllabus_tier: "Higher" });
    render();

    const save = await screen.findByRole("button", { name: "Save as PDF" });
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    save.click();
    await vi.advanceTimersByTimeAsync(100);
    expect(print).toHaveBeenCalled();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(8);
    expect(save.closest("[data-print-hide]")).not.toBeNull();
    vi.useRealTimers();
  });
  it("builds a practice quiz from the bank on the top topics and opens it", async () => {
    serveExam({ syllabus_id: "aqa-gcse-biology-8461", syllabus_tier: "Higher" });
    server.use(
      http.get(`${REST}/question_bank`, () =>
        HttpResponse.json([
          {
            id: "b1",
            source: "learnora",
            source_ref: null,
            licence: "learnora",
            attribution: null,
            spec_key: "aqa-gcse-biology-8461",
            topic_ref: "4.1.1",
            tier: null,
            question: "Which structure is only in plant cells?",
            choices: ["Nucleus", "Cell wall"],
            correct_index: 1,
            explanation: "Cellulose cell wall.",
          },
        ]),
      ),
      http.post(`${REST}/quizzes`, async ({ request }) => {
        const [body] = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "quiz-77", ...body });
      }),
    );
    render();
    const button = await screen.findByRole("button", { name: "Practise top topics" });
    button.click();
    expect(await screen.findByRole("heading", { name: "Quiz runner" })).toBeInTheDocument();
  });

  it("offers no practice for a spec the bank doesn't cover yet", async () => {
    serveExam({ syllabus_id: "ib-biology-2025", syllabus_tier: "HL" });
    render();
    await screen.findByText("IB Biology HL");
    expect(screen.queryByRole("button", { name: "Practise top topics" })).toBeNull();
  });
});
