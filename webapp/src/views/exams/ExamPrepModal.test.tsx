import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import type { Exam } from "../../api/types";
import { ExamPrepModal } from "./ExamPrepModal";

const TASKS_REST = `${SUPABASE_URL}/rest/v1/tasks`;
const MATERIALS_REST = `${SUPABASE_URL}/rest/v1/materials`;
const FOLDERS_REST = `${SUPABASE_URL}/rest/v1/folders`;
const FLASHCARDS_REST = `${SUPABASE_URL}/rest/v1/flashcards`;
const DECKS_REST = `${SUPABASE_URL}/rest/v1/flashcard_decks`;
const QUIZZES_REST = `${SUPABASE_URL}/rest/v1/quizzes`;
const QUIZ_ATTEMPTS_REST = `${SUPABASE_URL}/rest/v1/quiz_attempts`;
const SESSIONS_REST = `${SUPABASE_URL}/rest/v1/study_sessions`;

const FUTURE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
})();

const mockExam: Exam = {
  id: 10,
  user_id: "user-1",
  exam_name: "Advanced Molecular Biology",
  exam_date: FUTURE_DATE,
  difficulty: "Hard",
  status: "Scheduled",
};

describe("ExamPrepModal", () => {
  beforeEach(() => {
    mockAuthSession("user-1");

    server.use(
      http.get(MATERIALS_REST, () =>
        HttpResponse.json([
          {
            id: "m-1",
            user_id: "user-1",
            folder_id: "f-1",
            title: "Genetics Notes",
            type: "pdf",
            raw_content:
              "Comprehensive overview of DNA transcription and translation.",
            storage_path: null,
            created_at: "2026-08-01T00:00:00Z",
          },
        ]),
      ),
      http.get(FOLDERS_REST, () =>
        HttpResponse.json([
          {
            id: "f-1",
            user_id: "user-1",
            name: "Molecular Biology",
            color: "#3b82f6",
            created_at: "2026-08-01T00:00:00Z",
          },
        ]),
      ),
      http.get(FLASHCARDS_REST, () =>
        HttpResponse.json([
          {
            id: "c-1",
            user_id: "user-1",
            deck_id: "d-1",
            front: "RNA Polymerase II",
            back: "Enzyme synthesizing mRNA in eukaryotes",
            next_review_date: "2026-09-01T00:00:00Z",
            srs_interval: 4,
            ease_factor: 2.5,
            created_at: "2026-08-01T00:00:00Z",
          },
        ]),
      ),
      http.get(DECKS_REST, () =>
        HttpResponse.json([
          {
            id: "d-1",
            user_id: "user-1",
            folder_id: "f-1",
            title: "Molecular Biology",
            created_at: "2026-08-01T00:00:00Z",
          },
        ]),
      ),
      http.get(QUIZZES_REST, () =>
        HttpResponse.json([
          {
            id: "q-1",
            user_id: "user-1",
            material_id: "m-1",
            folder_id: "f-1",
            title: "Molecular Biology Quiz",
            questions_json: [],
            created_at: "2026-08-01T00:00:00Z",
          },
        ]),
      ),
      http.get(QUIZ_ATTEMPTS_REST, () =>
        HttpResponse.json([
          {
            id: "qa-1",
            user_id: "user-1",
            quiz_id: "q-1",
            score: 7,
            total: 10,
            answers_json: {},
            weak_topics: ["Spliceosome Mechanism"],
            created_at: "2026-08-02T00:00:00Z",
          },
        ]),
      ),
      http.get(SESSIONS_REST, () =>
        HttpResponse.json([
          {
            id: "s-1",
            user_id: "user-1",
            folder_id: "f-1",
            task: "Transcriptional Regulation",
            minutes: 600,
            timer_type: "pomodoro",
            started_at: "2026-08-05T00:00:00Z",
            created_at: "2026-08-05T00:00:00Z",
          },
        ]),
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders exam details, countdown pill, circular gauge, and breakdown factors", async () => {
    renderWithAuth(
      <ExamPrepModal open exam={mockExam} onClose={vi.fn()} />,
      { session: fakeSession() },
      { withRouter: true },
    );

    expect(
      await screen.findByText("Advanced Molecular Biology"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Exam Countdown & AI Prep Roadmap"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Material Coverage/i)).toBeInTheDocument();
    expect(screen.getByText(/Quiz Mastery/i)).toBeInTheDocument();
    expect(screen.getByText(/Study Investment/i)).toBeInTheDocument();
    expect(
      await screen.findByText("Spliceosome Mechanism"),
    ).toBeInTheDocument();
  });

  it("renders 4 prep roadmap phases with task items", async () => {
    renderWithAuth(
      <ExamPrepModal open exam={mockExam} onClose={vi.fn()} />,
      { session: fakeSession() },
      { withRouter: true },
    );

    expect(
      await screen.findByText(/Phase 1: Foundation & Material Synthesis/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Phase 2: Active Recall & Spaced Practice/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Phase 3: High-Yield Mock Exams & Weak Topic Polish/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Phase 4: Final Memory Lock & Review/i),
    ).toBeInTheDocument();
  });

  it("adds all prep tasks to task manager via 1-click CTA", async () => {
    const user = userEvent.setup();
    const postedTasks: Record<string, unknown>[] = [];

    server.use(
      http.post(TASKS_REST, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>[];
        postedTasks.push(...body);
        return HttpResponse.json(body, { status: 201 });
      }),
    );

    renderWithAuth(
      <ExamPrepModal open exam={mockExam} onClose={vi.fn()} />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const addAllBtn = await screen.findByRole("button", {
      name: /Add All Prep Tasks to Task Manager/i,
    });

    await user.click(addAllBtn);

    await waitFor(() => {
      expect(postedTasks.length).toBeGreaterThan(0);
    });

    expect(
      await screen.findByText(/Added \d+ prep tasks to Task Manager!/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "All Prep Tasks Added" }),
    ).toBeDisabled();
  });

  it("retries a partially failed bulk add without duplicating completed tasks", async () => {
    const user = userEvent.setup();
    const successfulTitles: string[] = [];
    let requestCount = 0;

    server.use(
      http.post(TASKS_REST, async ({ request }) => {
        requestCount++;
        const body = (await request.json()) as Record<string, unknown>[];
        if (requestCount === 2) {
          return HttpResponse.json(
            { message: "temporary failure" },
            { status: 500 },
          );
        }
        successfulTitles.push(String(body[0]?.text));
        return HttpResponse.json(body, { status: 201 });
      }),
    );

    renderWithAuth(
      <ExamPrepModal open exam={mockExam} onClose={vi.fn()} />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const addAllBtn = await screen.findByRole("button", {
      name: "Add All Prep Tasks to Task Manager",
    });
    await user.click(addAllBtn);

    expect(
      await screen.findByText(/Added 1 prep task, but the next task failed/i),
    ).toBeInTheDocument();

    await user.click(addAllBtn);
    await screen.findByText(/Added 7 prep tasks to Task Manager!/i);

    expect(successfulTitles).toHaveLength(8);
    expect(new Set(successfulTitles).size).toBe(8);
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithAuth(
      <ExamPrepModal open exam={mockExam} onClose={onClose} />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const closeButtons = await screen.findAllByRole("button", {
      name: "Close",
    });
    await user.click(closeButtons[0]);

    expect(onClose).toHaveBeenCalled();
  });
});
