import { describe, expect, it, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { StudyAnalyticsView } from "./StudyAnalyticsView";
import type { StudySession, QuizAttempt, Folder, Exam } from "../../api/types";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

describe("StudyAnalyticsView", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  const mockSessions: StudySession[] = [
    {
      id: "sess-1",
      user_id: "user-1",
      task: "Calculus Limits",
      folder_id: "f-1",
      minutes: 50,
      timer_type: "pomodoro",
      started_at: "2026-08-22T10:00:00.000Z",
      created_at: "2026-08-22T10:50:00.000Z",
    },
    {
      id: "sess-2",
      user_id: "user-1",
      task: "Physics Mechanics",
      folder_id: "f-2",
      minutes: 70,
      timer_type: "stopwatch",
      started_at: "2026-08-23T11:00:00.000Z",
      created_at: "2026-08-23T12:10:00.000Z",
    },
  ];

  const mockAttempts: QuizAttempt[] = [
    {
      id: "att-1",
      user_id: "user-1",
      quiz_id: "q-1",
      score: 8,
      total: 10,
      answers_json: {},
      weak_topics: ["Vectors"],
      created_at: "2026-08-23T11:30:00.000Z",
    },
  ];

  const mockFolders: Folder[] = [
    { id: "f-1", user_id: "user-1", name: "Calculus", color: "#3b82f6", created_at: "2026-08-01" },
    { id: "f-2", user_id: "user-1", name: "Physics", color: "#10b981", created_at: "2026-08-01" },
  ];

  const mockExams: Exam[] = [
    {
      id: 1,
      user_id: "user-1",
      exam_name: "Calculus Final",
      exam_date: "2026-08-28",
      difficulty: "Hard",
      status: "Upcoming",
    },
  ];

  it("renders the complete analytics suite with summary cards, heatmap, charts, and subject matrix", async () => {
    server.use(
      http.get(rest("study_sessions"), () => HttpResponse.json(mockSessions)),
      http.get(rest("quiz_attempts"), () => HttpResponse.json(mockAttempts)),
      http.get(rest("folders"), () => HttpResponse.json(mockFolders)),
      http.get(rest("exams"), () => HttpResponse.json(mockExams)),
    );

    renderWithAuth(<StudyAnalyticsView />, { session: fakeSession() });

    // Page title
    expect(screen.getByText("Study Analytics & Insights")).toBeInTheDocument();

    // Summary cards
    expect(screen.getByText("Total Focus Time")).toBeInTheDocument();
    expect(screen.getByText("Active Consistency")).toBeInTheDocument();
    expect(screen.getByText("Peak Chronotype")).toBeInTheDocument();
    expect(screen.getByText("Quiz Mastery")).toBeInTheDocument();

    // Section headings
    expect(screen.getByText("Study Activity Heatmap")).toBeInTheDocument();
    expect(screen.getByText("Peak Performance Hours")).toBeInTheDocument();
    expect(screen.getByText("AI Study Copilot Insights")).toBeInTheDocument();
    expect(screen.getByText("Subject Balance & Exam Urgency Matrix")).toBeInTheDocument();

    // Data populated
    await waitFor(() => {
      expect(screen.getByText("Calculus")).toBeInTheDocument();
      expect(screen.getByText("Physics")).toBeInTheDocument();
      expect(screen.getByText("Calculus Final")).toBeInTheDocument();
      expect(screen.getByText("80%")).toBeInTheDocument(); // Quiz Mastery
    });
  });
});
