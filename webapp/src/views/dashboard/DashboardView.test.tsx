import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { localDateStr, mondayOfWeek } from "../../lib/date";
import { TIMER_END_KEY, TIMER_STATE_KEY } from "../../lib/timer";
import { Storage } from "../../lib/storage";
import type { Exam, Folder, StudySession, Task } from "../../api/types";
import { ChatProvider } from "../../context/ChatProvider";
import { TurboChat } from "../../components/chat/TurboChat";
import { CommandBar } from "./CommandBar";
import { DashboardView } from "./DashboardView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: 1,
    user_id: "user-1",
    exam_name: "Midterm",
    exam_date: daysFromNow(3),
    difficulty: "Hard",
    status: "Scheduled",
    ...overrides,
  };
}

function studySession(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: "sess-1",
    user_id: "user-1",
    task: "General Study",
    folder_id: null,
    minutes: 30,
    timer_type: "pomodoro",
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    user_id: "user-1",
    name: "Biology",
    color: "#4A90E2",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    user_id: "user-1",
    text: "Read chapter 4",
    is_done: false,
    due_date: null,
    ...overrides,
  };
}

function serveDashboard({
  exams = [] as Exam[],
  sessions = [] as StudySession[],
  folders = [] as Folder[],
  tasks = [] as Task[],
  dueCount = 0,
} = {}) {
  server.use(
    http.get(rest("exams"), () => HttpResponse.json(exams)),
    http.get(rest("study_sessions"), () => HttpResponse.json(sessions)),
    http.get(rest("folders"), () => HttpResponse.json(folders)),
    http.get(rest("tasks"), () => HttpResponse.json(tasks)),
    http.get(rest("quizzes"), () => HttpResponse.json([])),
    http.get(rest("quiz_attempts"), () => HttpResponse.json([])),
    http.head(
      rest("flashcards"),
      () =>
        new HttpResponse(null, {
          status: 200,
          headers: { "content-range": `*/${dueCount}` },
        }),
    ),
  );
}

function renderDashboard() {
  return renderWithAuth(
    /* The dashboard's command bar and AI card both talk to the chat, and
       ChatProvider has to sit inside the router (it navigates) — which the
       harness now supplies, since the create dialog needs it too. */
    <ChatProvider>
      <Routes>
        <Route path="/" element={<DashboardView />} />
        <Route path="/timer" element={<h1>Timer</h1>} />
        <Route path="/tasks" element={<h1>Tasks</h1>} />
        <Route path="/exams" element={<h1>Exams</h1>} />
        <Route path="/library/flashcards" element={<h1>Flashcards</h1>} />
        <Route path="/plan" element={<h1>Weekly plan</h1>} />
      </Routes>
      {/* App.tsx renders both beside the routes, not inside a view — the
          command bar isn't dashboard-only, it's a global Cmd/Ctrl+K entry
          point (see CommandBar.tsx), so the "same conversation" tests below
          need it mounted the same way App.tsx does. */}
      <CommandBar />
      <TurboChat />
    </ChatProvider>,
    { session: fakeSession() },
    { withTimer: true, initialEntries: ["/"] },
  );
}

describe("DashboardView", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Next exam card", () => {
    it("counts down to the earliest upcoming exam", async () => {
      serveDashboard({
        exams: [
          exam({ id: 1, exam_name: "Far exam", exam_date: daysFromNow(10) }),
          exam({ id: 2, exam_name: "Near exam", exam_date: daysFromNow(3) }),
          exam({
            id: 3,
            exam_name: "Done already",
            exam_date: daysFromNow(1),
            status: "Completed",
          }),
        ],
      });
      renderDashboard();

      expect(await screen.findByText("Near exam")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("days away")).toBeInTheDocument();
      expect(screen.getByText("Hard")).toBeInTheDocument();
    });

    it("shows the empty state when nothing is scheduled", async () => {
      serveDashboard({ exams: [] });
      renderDashboard();

      expect(await screen.findByText(/No exams scheduled/)).toBeInTheDocument();
    });

    it("links to the calendar", async () => {
      const user = userEvent.setup();
      serveDashboard({ exams: [exam()] });
      renderDashboard();

      await user.click(
        await screen.findByRole("link", { name: "Open calendar" }),
      );
      expect(
        await screen.findByRole("heading", { name: "Exams" }),
      ).toBeInTheDocument();
    });
  });

  describe("Focus card", () => {
    it("shows the reconciled Supabase total once it loads", async () => {
      serveDashboard({
        sessions: [
          studySession({ minutes: 40, started_at: new Date().toISOString() }),
          studySession({
            minutes: 20,
            started_at: new Date(Date.now() - 86400000).toISOString(),
          }),
        ],
      });
      renderDashboard();

      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /total/ }),
        ).toHaveTextContent("1h total"),
      );
    });

    it("paints instantly from the local session log while the network total loads", () => {
      Storage.set("sessions", [
        {
          id: Date.now(),
          timestamp: "just now",
          minutes: 15,
          task: "General Study",
        },
      ]);
      serveDashboard();
      renderDashboard();

      // Before any MSW response has resolved, the local-storage number is
      // already on screen — this assertion runs synchronously after render.
      expect(screen.getByRole("heading", { name: /total/ })).toHaveTextContent(
        "15m total",
      );
    });

    it("starts a preset and jumps to the timer", async () => {
      const user = userEvent.setup();
      serveDashboard();
      renderDashboard();

      await user.click(await screen.findByRole("button", { name: "45m" }));

      expect(
        await screen.findByRole("heading", { name: "Timer" }),
      ).toBeInTheDocument();
    });

    it("confirms before restarting an already-running timer", async () => {
      const user = userEvent.setup();
      Storage.set(TIMER_STATE_KEY, {
        isRunning: true,
        type: "pomodoro",
        mode: "Focus",
        timeLeft: 100,
        totalTime: 1500,
        config: {},
      });
      localStorage.setItem(TIMER_END_KEY, String(Date.now() + 100_000));
      serveDashboard();
      renderDashboard();

      await user.click(await screen.findByRole("button", { name: "20m" }));

      expect(
        screen.getByText(
          "A timer is currently running. Start a new focus session and reset it now?",
        ),
      ).toBeInTheDocument();
      // Declining keeps the dashboard, not the timer route.
      await user.click(screen.getByRole("button", { name: "Keep running" }));
      expect(
        screen.queryByRole("heading", { name: "Timer" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Streak card", () => {
    it("shows the streak, sparkline and folder breakdown", async () => {
      serveDashboard({
        folders: [folder()],
        sessions: [studySession({ minutes: 30, folder_id: "folder-1" })],
      });
      renderDashboard();

      await screen.findAllByText("Biology");
      expect(
        screen.getByRole("heading", { name: /\d+\s*days?/ }),
      ).toBeInTheDocument();
      expect(screen.getAllByText("Biology").length).toBeGreaterThan(0);
    });

    it("shows the empty state with no session history", async () => {
      serveDashboard({ sessions: [] });
      renderDashboard();

      expect(
        await screen.findByText(/Start your first streak today/),
      ).toBeInTheDocument();
    });
  });

  describe("Tasks card", () => {
    it("shows pending tasks and a View all link", async () => {
      const user = userEvent.setup();
      serveDashboard({ tasks: [task()] });
      renderDashboard();

      expect(await screen.findByText("Read chapter 4")).toBeInTheDocument();
      await user.click(screen.getByRole("link", { name: "View all" }));
      expect(
        await screen.findByRole("heading", { name: "Tasks" }),
      ).toBeInTheDocument();
    });

    it("banners due flashcards and links to the Library", async () => {
      const user = userEvent.setup();
      serveDashboard({ dueCount: 4 });
      renderDashboard();

      expect(await screen.findByText("4 cards due today")).toBeInTheDocument();
      await user.click(screen.getByRole("link", { name: "Review now" }));
      expect(
        await screen.findByRole("heading", { name: "Flashcards" }),
      ).toBeInTheDocument();
    });

    it("hides the due banner when nothing is due", async () => {
      serveDashboard({ dueCount: 0, tasks: [task()] });
      renderDashboard();

      await screen.findByText("Read chapter 4");
      expect(screen.queryByText(/due today/)).not.toBeInTheDocument();
    });
  });

  describe("AI actions card", () => {
    /* Ports js/main.js:2445-2466. This is the one dashboard AI action that
       does real work rather than opening the chat, so it is the one that
       generates and then hands the student to /plan. */
    it("generates this week's plan and navigates to it", async () => {
      const user = userEvent.setup();
      serveDashboard();
      const planJson = { summary: "A calm week", days: [] };
      server.use(
        http.get(rest("weekly_plans"), () => HttpResponse.json([])),
        http.post(`${SUPABASE_URL}/functions/v1/learnora-ai`, () =>
          HttpResponse.json({ text: JSON.stringify(planJson) }),
        ),
        http.post(rest("weekly_plans"), () =>
          HttpResponse.json({
            id: "plan-1",
            week_start: localDateStr(mondayOfWeek()),
            plan_json: planJson,
          }),
        ),
      );
      renderDashboard();

      await user.click(
        await screen.findByRole("button", { name: "Plan my week" }),
      );

      expect(
        await screen.findByRole("heading", { name: "Weekly plan" }),
      ).toBeInTheDocument();
    });

    it("asks the chat the What next? question and shows the reply", async () => {
      const user = userEvent.setup();
      serveDashboard();
      server.use(
        http.post(`${SUPABASE_URL}/functions/v1/learnora-ai`, () =>
          HttpResponse.json({ text: "Start with the Biology revision." }),
        ),
      );
      renderDashboard();

      await user.click(
        await screen.findByRole("button", { name: "What next?" }),
      );

      expect(
        await screen.findByText("Start with the Biology revision."),
      ).toBeInTheDocument();
    });

    /* "Quiz me" opened a pre-filled Create dialog in the vanilla, so firing a
       quiz on a topic nobody named would be a downgrade — it drops an
       unfinished prompt in the composer instead. */
    it("opens the chat with an unfinished prompt for Quiz me", async () => {
      const user = userEvent.setup();
      serveDashboard();
      renderDashboard();

      await user.click(await screen.findByRole("button", { name: "Quiz me" }));

      expect(
        await screen.findByRole("textbox", { name: "AI chat input" }),
      ).toHaveValue("Quiz me on ");
    });

    it("sends the command bar's question into the same conversation", async () => {
      const user = userEvent.setup();
      serveDashboard();
      server.use(
        http.post(`${SUPABASE_URL}/functions/v1/learnora-ai`, () =>
          HttpResponse.json({ text: "Two tasks are due this week." }),
        ),
      );
      renderDashboard();

      const bar = await screen.findByRole("textbox", {
        name: "Ask Learnora AI",
      });
      await user.type(bar, "what is due?");
      await user.click(screen.getByRole("button", { name: "Send AI command" }));

      expect(
        await screen.findByText("Two tasks are due this week."),
      ).toBeInTheDocument();
      expect(bar).toHaveValue("");
    });

    it("asks before replacing a plan that already exists", async () => {
      const user = userEvent.setup();
      serveDashboard();
      let generated = false;
      server.use(
        http.get(rest("weekly_plans"), () =>
          HttpResponse.json([
            {
              id: "plan-1",
              week_start: localDateStr(mondayOfWeek()),
              plan_json: { days: [] },
            },
          ]),
        ),
        http.post(`${SUPABASE_URL}/functions/v1/learnora-ai`, () => {
          generated = true;
          return HttpResponse.json({ text: '{"days":[]}' });
        }),
      );
      renderDashboard();

      await user.click(
        await screen.findByRole("button", { name: "Plan my week" }),
      );

      const dialog = await screen.findByRole("alertdialog");
      expect(
        within(dialog).getByText(/replace your current weekly plan/),
      ).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(generated).toBe(false);
    });

    it("still surfaces real weak topics, which need no AI call", async () => {
      serveDashboard();
      server.use(
        http.get(rest("quiz_attempts"), () =>
          HttpResponse.json([
            { weak_topics: ["Photosynthesis", "Mitosis"] },
            { weak_topics: ["Photosynthesis"] },
          ]),
        ),
      );
      renderDashboard();

      expect(await screen.findByText("Photosynthesis")).toBeInTheDocument();
      expect(screen.getByText("Mitosis")).toBeInTheDocument();
    });
  });

  describe("Onboarding banner", () => {
    it("appears for a brand-new account and can be dismissed", async () => {
      const user = userEvent.setup();
      serveDashboard();
      renderDashboard();

      expect(
        await screen.findByText("Welcome to Learnora"),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByText("Welcome to Learnora")).not.toBeInTheDocument();
      expect(Storage.get("onboarding_dismissed")).toBe(true);
    });

    it("stays dismissed across a reload", async () => {
      Storage.set("onboarding_dismissed", true);
      serveDashboard();
      renderDashboard();

      // The dashboard no longer renders its own "Dashboard" heading (the
      // app shell's Header supplies the page's <h1> — see move #2 in
      // archive/redesign/DESIGN_MOVES.md); wait on AIActionsCard's static label
      // instead as an equivalent "the page has rendered" signal.
      await screen.findByText("Ask Learnora AI");
      expect(screen.queryByText("Welcome to Learnora")).not.toBeInTheDocument();
    });

    it("does not appear once the account has real data", async () => {
      serveDashboard({ tasks: [task()] });
      renderDashboard();

      await screen.findByText("Read chapter 4");
      expect(screen.queryByText("Welcome to Learnora")).not.toBeInTheDocument();
    });

    it("opens the create dialog from its own button", async () => {
      const user = userEvent.setup();
      serveDashboard();
      renderDashboard();

      await user.click(
        await screen.findByRole("button", { name: /Create study material/ }),
      );
      expect(
        await screen.findByRole("heading", { name: "Build study resources" }),
      ).toBeInTheDocument();
    });

    it("focuses the quick-add task input from its own button", async () => {
      const user = userEvent.setup();
      serveDashboard();
      renderDashboard();

      await user.click(
        await screen.findByRole("button", { name: /Add a task/ }),
      );
      expect(screen.getByLabelText("Quick add task")).toHaveFocus();
    });
  });

  describe("Recent focus sessions", () => {
    it("shows the local session log", async () => {
      Storage.set("sessions", [
        {
          id: Date.now(),
          timestamp: "Jul 30, 2:00 PM",
          minutes: 45,
          task: "Biology",
        },
      ]);
      serveDashboard();
      renderDashboard();

      await screen.findByText("Recent focus sessions");
      const history = screen.getByText("Recent focus sessions").closest("div")!;
      expect(within(history).getByRole("listitem")).toHaveTextContent(
        "45m Focus on Biology",
      );
    });

    it("shows the empty state with no history", async () => {
      serveDashboard();
      renderDashboard();

      expect(await screen.findByText(/No sessions yet/)).toBeInTheDocument();
    });

    it("refreshes live when a session is logged elsewhere on the page", async () => {
      serveDashboard();
      renderDashboard();
      await screen.findByText(/No sessions yet/);

      Storage.set("sessions", [
        {
          id: Date.now(),
          timestamp: "just now",
          minutes: 10,
          task: "General Study",
        },
      ]);
      window.dispatchEvent(new Event("learnora:sessionLogged"));

      await waitFor(() =>
        expect(screen.getByText(/10m Focus/)).toBeInTheDocument(),
      );
    });
  });

  describe("Adaptive health widget", () => {
    it("renders cognitive health score and navigates to analytics", async () => {
      serveDashboard({
        sessions: [studySession({ minutes: 45 })],
      });
      renderDashboard();

      expect(
        await screen.findByRole("region", { name: "Adaptive learning health" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Learning Health & AI")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Full Analytics/i }),
      ).toHaveAttribute("href", "/analytics");
    });
  });
});
