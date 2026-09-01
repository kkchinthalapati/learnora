import { describe, expect, it, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    {
      id: "f-1",
      user_id: "user-1",
      name: "Calculus",
      color: "#3b82f6",
      created_at: "2026-08-01",
    },
    {
      id: "f-2",
      user_id: "user-1",
      name: "Physics",
      color: "#10b981",
      created_at: "2026-08-01",
    },
  ];

  const mockExams: Exam[] = [
    {
      id: 1,
      user_id: "user-1",
      exam_name: "Calculus Final",
      exam_date: "2099-08-28",
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

    expect(
      screen.queryByText("Study Analytics & Insights"),
    ).not.toBeInTheDocument();

    // Summary cards
    expect(screen.getByText("Study time")).toBeInTheDocument();
    expect(screen.getByText("Active days")).toBeInTheDocument();
    expect(screen.getByText("Peak study window")).toBeInTheDocument();
    expect(screen.getByText("Quiz average")).toBeInTheDocument();

    // Section headings
    expect(screen.getByText("Study activity")).toBeInTheDocument();
    expect(screen.getByText("Study time by hour")).toBeInTheDocument();
    expect(screen.getByText("Study patterns")).toBeInTheDocument();
    expect(screen.getByText("Subject time and exam dates")).toBeInTheDocument();

    // Data populated
    expect(
      await screen.findByText("Calculus", {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Physics")).toBeInTheDocument();
    expect(screen.getByText("Calculus Final")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument(); // Quiz Mastery
  });

  it("switches active date range and updates heatmap subtext and consistency metrics", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(rest("study_sessions"), () => HttpResponse.json(mockSessions)),
      http.get(rest("quiz_attempts"), () => HttpResponse.json(mockAttempts)),
      http.get(rest("folders"), () => HttpResponse.json(mockFolders)),
      http.get(rest("exams"), () => HttpResponse.json(mockExams)),
    );

    renderWithAuth(<StudyAnalyticsView />, { session: fakeSession() });

    const rangeGroup = screen.getByRole("group", {
      name: "Progress date range",
    });
    const yearBtn = within(rangeGroup).getByRole("button", {
      name: "52 Weeks (1Y)",
    });
    const ninetyDaysBtn = within(rangeGroup).getByRole("button", {
      name: "90 Days",
    });
    const thirtyDaysBtn = within(rangeGroup).getByRole("button", {
      name: "30 Days",
    });

    // Default state (365 days / 52 Weeks)
    expect(yearBtn).toHaveAttribute("aria-pressed", "true");
    expect(ninetyDaysBtn).toHaveAttribute("aria-pressed", "false");
    expect(thirtyDaysBtn).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Daily focus time for the past 365 days"),
    ).toBeInTheDocument();
    expect(screen.getByText("/ 365d")).toBeInTheDocument();

    // Switch to 90 Days
    await user.click(ninetyDaysBtn);
    expect(yearBtn).toHaveAttribute("aria-pressed", "false");
    expect(ninetyDaysBtn).toHaveAttribute("aria-pressed", "true");
    expect(thirtyDaysBtn).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Daily focus time for the past 90 days"),
    ).toBeInTheDocument();
    expect(screen.getByText("/ 90d")).toBeInTheDocument();

    // Switch to 30 Days
    await user.click(thirtyDaysBtn);
    expect(yearBtn).toHaveAttribute("aria-pressed", "false");
    expect(ninetyDaysBtn).toHaveAttribute("aria-pressed", "false");
    expect(thirtyDaysBtn).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Daily focus time for the past 30 days"),
    ).toBeInTheDocument();
    expect(screen.getByText("/ 30d")).toBeInTheDocument();

    // Switch back to 52 Weeks (1Y)
    await user.click(yearBtn);
    expect(yearBtn).toHaveAttribute("aria-pressed", "true");
    expect(ninetyDaysBtn).toHaveAttribute("aria-pressed", "false");
    expect(thirtyDaysBtn).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Daily focus time for the past 365 days"),
    ).toBeInTheDocument();
    expect(screen.getByText("/ 365d")).toBeInTheDocument();
  });

  it("exposes usable range and hourly chart controls", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(rest("study_sessions"), () => HttpResponse.json(mockSessions)),
      http.get(rest("quiz_attempts"), () => HttpResponse.json(mockAttempts)),
      http.get(rest("folders"), () => HttpResponse.json(mockFolders)),
      http.get(rest("exams"), () => HttpResponse.json(mockExams)),
    );

    renderWithAuth(<StudyAnalyticsView />, { session: fakeSession() });

    const rangeGroup = screen.getByRole("group", {
      name: "Progress date range",
    });
    const thirtyDays = within(rangeGroup).getByRole("button", {
      name: "30 Days",
    });
    await user.click(thirtyDays);
    expect(thirtyDays).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Daily focus time for the past 30 days"),
    ).toBeInTheDocument();

    const chart = screen.getByRole("group", {
      name: "Hourly study distribution bar chart",
    });
    const studiedHour = within(chart).getByRole("button", {
      name: /50 minutes, 1 sessions/,
    });
    await user.click(studiedHour);
    expect(studiedHour).toHaveAttribute("aria-pressed", "true");
    expect(
      await screen.findByText(/50 minutes across 1 session/),
    ).toBeInTheDocument();
  });
});
