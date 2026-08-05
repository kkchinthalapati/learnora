import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { localDateStr, mondayOfWeek, WEEKDAY_NAMES } from "../../lib/date";
import { PlanView } from "./PlanView";
import { TimerView } from "../timer/TimerView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;
const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;

/* Real clock, for the reason written up in ExamsView.test.tsx: TanStack Query
 * and MSW both pace off Date.now(), so freezing it hangs the query. Every
 * expectation is derived from today instead. */
const MONDAY = mondayOfWeek();
const WEEK_START = localDateStr(MONDAY);
const dayOffset = (i: number) => {
  const d = new Date(MONDAY);
  d.setDate(MONDAY.getDate() + i);
  return localDateStr(d);
};
const TODAY = localDateStr();

function planRow(planJson: unknown, createdAt = new Date().toISOString()) {
  return {
    id: "plan-1",
    user_id: "user-1",
    week_start: WEEK_START,
    plan_json: planJson,
    source: "ai",
    created_at: createdAt,
  };
}

const SAMPLE_PLAN = {
  summary: "Front-load Biology, coast into the weekend.",
  days: [
    {
      date: dayOffset(0),
      blocks: [
        {
          subject: "Biology",
          durationMins: 45,
          startHint: "after dinner",
          reason: "exam on Friday",
        },
        { subject: "Maths", durationMins: 30 },
      ],
    },
    { date: dayOffset(1), blocks: [] },
  ],
};

/** `maybeSingle()` on an empty result set returns null, not a row.
 *
 *  Filters on the request's `week_start` param rather than answering every
 *  GET the same way: PlanView now also queries *last* week (for the
 *  adherence recap), and a mock that ignored the param would hand that
 *  query this same current-week row back, rendering it twice. */
function servePlan(row: unknown) {
  server.use(
    http.get(rest("weekly_plans"), ({ request }) => {
      const requestedWeek = new URL(request.url).searchParams
        .get("week_start")
        ?.replace(/^eq\./, "");
      return row && requestedWeek === WEEK_START
        ? HttpResponse.json([row])
        : HttpResponse.json([]);
    }),
  );
}

function serveWorkspace() {
  server.use(
    http.get(rest("tasks"), () => HttpResponse.json([])),
    http.get(rest("exams"), () => HttpResponse.json([])),
    http.get(rest("materials"), () => HttpResponse.json([])),
    http.get(rest("quizzes"), () => HttpResponse.json([])),
    http.get(rest("flashcards"), () => HttpResponse.json([])),
    http.get(rest("study_sessions"), () => HttpResponse.json([])),
    http.get(rest("quiz_attempts"), () => HttpResponse.json([])),
    http.get(rest("folders"), () => HttpResponse.json([])),
  );
}

function renderPlan() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/plan"]}>
      <Routes>
        <Route path="/plan" element={<PlanView />} />
        <Route path="/timer" element={<div>Timer view</div>} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
    { withTimer: true },
  );
}

/* The real TimerView on /timer, for the handoff assertions — a placeholder
 * cannot show what the timer was actually left holding. */
function renderPlanWithTimer() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/plan"]}>
      <Routes>
        <Route path="/plan" element={<PlanView />} />
        <Route path="/timer" element={<TimerView />} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
    { withTimer: true },
  );
}

describe("PlanView", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
    serveWorkspace();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the week's Monday-to-Sunday range", async () => {
    servePlan(null);
    renderPlan();

    const sunday = new Date(MONDAY);
    sunday.setDate(MONDAY.getDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

    expect(
      await screen.findByText(`${fmt(MONDAY)} – ${fmt(sunday)}`),
    ).toBeInTheDocument();
  });

  it("asks the database for this week's plan, scoped to the user", async () => {
    // Two requests land now, not one: the view also asks for *last* week's
    // plan for the adherence recap. Both hit this handler, so the
    // assertion below picks out the current-week one specifically rather
    // than trusting whichever happened to resolve last.
    const urls: URL[] = [];
    server.use(
      http.get(rest("weekly_plans"), ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json([]);
      }),
    );
    renderPlan();

    await screen.findByText("No plan yet for this week");
    const thisWeekRequest = urls.find(
      (u) => u.searchParams.get("week_start") === `eq.${WEEK_START}`,
    );
    expect(thisWeekRequest?.searchParams.get("user_id")).toBe("eq.user-1");
    expect(thisWeekRequest?.searchParams.get("week_start")).toBe(
      `eq.${WEEK_START}`,
    );
  });

  describe("with no plan yet", () => {
    it('offers the empty state and labels the button "Generate Plan"', async () => {
      servePlan(null);
      renderPlan();

      expect(
        await screen.findByText("No plan yet for this week"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Generate Weekly Plan with AI/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Generate Plan" }),
      ).toBeInTheDocument();
    });

    /* Generating the first plan of the week overwrites nothing, so it must not
       stop to ask — only a regenerate does (see below). */
    it("generates without a confirmation prompt", async () => {
      servePlan(null);
      let generated = false;
      server.use(
        http.post(EDGE_URL, () => {
          generated = true;
          return HttpResponse.json({ text: JSON.stringify(SAMPLE_PLAN) });
        }),
        http.post(rest("weekly_plans"), () =>
          HttpResponse.json(planRow(SAMPLE_PLAN)),
        ),
      );
      renderPlan();

      await userEvent.click(
        await screen.findByRole("button", {
          name: /Generate Weekly Plan with AI/,
        }),
      );

      await waitFor(() => expect(generated).toBe(true));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("renders the generated plan without waiting for a refetch", async () => {
      servePlan(null);
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({ text: JSON.stringify(SAMPLE_PLAN) }),
        ),
        http.post(rest("weekly_plans"), () =>
          HttpResponse.json(planRow(SAMPLE_PLAN)),
        ),
      );
      renderPlan();

      await userEvent.click(
        await screen.findByRole("button", {
          name: /Generate Weekly Plan with AI/,
        }),
      );

      expect(
        await screen.findByText("Front-load Biology, coast into the weekend."),
      ).toBeInTheDocument();
      expect(screen.getByText("Biology")).toBeInTheDocument();
    });

    it("reports a failure and stays on the empty state", async () => {
      servePlan(null);
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({ error: "Bad token" }, { status: 401 }),
        ),
      );
      renderPlan();

      await userEvent.click(
        await screen.findByRole("button", {
          name: /Generate Weekly Plan with AI/,
        }),
      );

      expect(
        await screen.findByText(
          "Failed to generate your weekly plan. Please try again.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("No plan yet for this week")).toBeInTheDocument();
    });

    /* A model that replied but produced nothing plan-shaped is a different
       failure from the service being down, and says so. */
    it("shows the shape-failure wording when the reply has no days", async () => {
      servePlan(null);
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({ text: "I'd rather write you a poem." }),
        ),
      );
      renderPlan();

      await userEvent.click(
        await screen.findByRole("button", {
          name: /Generate Weekly Plan with AI/,
        }),
      );

      expect(
        await screen.findByText(
          "Couldn't generate a plan this time. Please try again.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Triage Mode", () => {
    it("shows the Triage button when an exam is less than 3 days away", async () => {
      servePlan(planRow(SAMPLE_PLAN));
      const closeExamDate = new Date();
      closeExamDate.setDate(closeExamDate.getDate() + 2); // 48 hours away

      server.use(
        http.get(rest("exams"), () =>
          HttpResponse.json([
            {
              id: 1,
              exam_name: "Bio 101 Midterm",
              exam_date: localDateStr(closeExamDate),
              status: "Scheduled",
            },
          ]),
        ),
      );
      renderPlan();

      expect(await screen.findByRole("button", { name: /Triage/i })).toBeInTheDocument();
    });

    it("generates a triage plan when confirmed", async () => {
      servePlan(planRow(SAMPLE_PLAN));
      const closeExamDate = new Date();
      closeExamDate.setDate(closeExamDate.getDate() + 2);

      let wasTriage = false;
      server.use(
        http.get(rest("exams"), () =>
          HttpResponse.json([
            {
              id: 1,
              exam_name: "Bio 101 Midterm",
              exam_date: localDateStr(closeExamDate),
              status: "Scheduled",
            },
          ]),
        ),
        http.post(EDGE_URL, async ({ request }) => {
          const body = await request.clone().json() as { history?: { content?: string }[] };
          const content = body.history?.[0]?.content || "";
          if (content.includes("EMERGENCY SURVIVAL")) {
             wasTriage = true;
          }
          return HttpResponse.json({ text: JSON.stringify(SAMPLE_PLAN) });
        }),
      );
      renderPlan();

      const triageBtn = await screen.findByRole("button", { name: /Triage/i });
      await userEvent.click(triageBtn);

      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Triage Mode" }),
      );

      await waitFor(() => expect(wasTriage).toBe(true));
    });
  });

  describe("with a plan", () => {
    it("renders the summary, each day and its blocks", async () => {
      servePlan(planRow(SAMPLE_PLAN));
      renderPlan();

      expect(
        await screen.findByText("Front-load Biology, coast into the weekend."),
      ).toBeInTheDocument();
      expect(screen.getByText("Biology")).toBeInTheDocument();
      expect(screen.getByText("45m · after dinner")).toBeInTheDocument();
      expect(screen.getByText("exam on Friday")).toBeInTheDocument();
      expect(screen.getByText("30m")).toBeInTheDocument();
    });

    it("labels each day with its weekday, and calls an empty day free", async () => {
      servePlan(planRow(SAMPLE_PLAN));
      renderPlan();

      const weekday =
        WEEKDAY_NAMES[new Date(`${dayOffset(0)}T00:00:00`).getDay()];
      expect(
        await screen.findByRole("heading", {
          name: new RegExp(`^${weekday},`),
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Free day — nothing scheduled"),
      ).toBeInTheDocument();
    });

    it("marks today's card with aria-current", async () => {
      servePlan(planRow(SAMPLE_PLAN));
      renderPlan();
      await screen.findByText("Biology");

      const todaysDay = SAMPLE_PLAN.days.find((d) => d.date === TODAY);
      const cards = screen.getAllByRole("listitem");
      const marked = cards.filter(
        (c) => c.getAttribute("aria-current") === "date",
      );
      expect(marked).toHaveLength(todaysDay ? 1 : 0);
    });

    it("shows when it was last generated", async () => {
      servePlan(planRow(SAMPLE_PLAN, new Date().toISOString()));
      renderPlan();
      expect(
        await screen.findByText("Last generated just now"),
      ).toBeInTheDocument();
    });

    it('switches the header button to "Regenerate"', async () => {
      servePlan(planRow(SAMPLE_PLAN));
      renderPlan();
      expect(
        await screen.findByRole("button", { name: "Regenerate" }),
      ).toBeInTheDocument();
    });

    /* Upsert is keyed on user + week_start, so regenerating destroys the plan
       already on screen — it has to ask first. */
    it("asks before overwriting, and does nothing when declined", async () => {
      servePlan(planRow(SAMPLE_PLAN));
      let generated = false;
      server.use(
        http.post(EDGE_URL, () => {
          generated = true;
          return HttpResponse.json({ text: JSON.stringify(SAMPLE_PLAN) });
        }),
      );
      renderPlan();

      await userEvent.click(
        await screen.findByRole("button", { name: "Regenerate" }),
      );

      const dialog = await screen.findByRole("alertdialog");
      expect(
        within(dialog).getByText(/overwrite your current weekly plan/),
      ).toBeInTheDocument();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Cancel" }),
      );

      expect(generated).toBe(false);
      expect(screen.getByText("Biology")).toBeInTheDocument();
    });

    it("regenerates when confirmed", async () => {
      servePlan(planRow(SAMPLE_PLAN));
      const nextPlan = {
        summary: "A calmer week.",
        days: [
          {
            date: dayOffset(0),
            blocks: [{ subject: "History", durationMins: 60 }],
          },
        ],
      };
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({ text: JSON.stringify(nextPlan) }),
        ),
        http.post(rest("weekly_plans"), () =>
          HttpResponse.json(planRow(nextPlan)),
        ),
      );
      renderPlan();

      await userEvent.click(
        await screen.findByRole("button", { name: "Regenerate" }),
      );
      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Regenerate" }),
      );

      expect(await screen.findByText("A calmer week.")).toBeInTheDocument();
      expect(screen.getByText("History")).toBeInTheDocument();
    });

    /* Ports js/router.js's `start-plan-block` handoff: the timer is pre-staged
       with the block's length and subject, and the student lands on /timer with
       only Start left to press — it deliberately does not auto-start. */
    it("stages the block on the timer and navigates to /timer", async () => {
      servePlan(planRow(SAMPLE_PLAN));
      renderPlan();

      await userEvent.click(
        await screen.findByRole("button", {
          name: "Start a 45 minute focus session for Biology",
        }),
      );

      expect(await screen.findByText("Timer view")).toBeInTheDocument();
    });

    /* The subject is usually not one of the student's tasks, so the timer's
       task select has to grow an option for it — otherwise it would read
       "None" while the provider logged the session against the subject. */
    it("binds the block's subject as the timer's current task", async () => {
      servePlan(planRow(SAMPLE_PLAN));
      renderPlanWithTimer();

      await userEvent.click(
        await screen.findByRole("button", {
          name: "Start a 45 minute focus session for Biology",
        }),
      );

      expect(
        await screen.findByRole("combobox", { name: "Current Task:" }),
      ).toHaveValue("Biology");
    });

    it("names each Start button by its subject, not just 'Start'", async () => {
      servePlan(planRow(SAMPLE_PLAN));
      renderPlan();
      await screen.findByText("Biology");

      expect(
        screen.getByRole("button", {
          name: "Start a 30 minute focus session for Maths",
        }),
      ).toBeInTheDocument();
    });

    /* plan_json is free-form JSON: a row written before a field existed, or by
       a provider that drifted, must not render "undefinedm". */
    it("falls back to the empty state when the stored plan is unusable", async () => {
      servePlan(planRow({ summary: "orphaned", notDays: [] }));
      renderPlan();

      expect(
        await screen.findByText("No plan yet for this week"),
      ).toBeInTheDocument();
    });

    it("defaults a block with no duration rather than printing undefined", async () => {
      servePlan(
        planRow({
          days: [{ date: dayOffset(0), blocks: [{ subject: "Physics" }] }],
        }),
      );
      renderPlan();

      expect(await screen.findByText("25m")).toBeInTheDocument();
      expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    });
  });

  describe("last week's adherence recap", () => {
    const prevMonday = new Date(MONDAY);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const PREV_WEEK_START = localDateStr(prevMonday);

    /* Answers the previous week's weekly_plans query with a plan, and this
       week's with none — servePlan only knows about the current week (see
       its own comment), so this test needs the finer-grained handler
       itself. */
    function servePrevWeekPlan(planJson: unknown) {
      server.use(
        http.get(rest("weekly_plans"), ({ request }) => {
          const requestedWeek = new URL(request.url).searchParams
            .get("week_start")
            ?.replace(/^eq\./, "");
          return requestedWeek === PREV_WEEK_START && planJson
            ? HttpResponse.json([
                {
                  id: "prev-plan",
                  week_start: PREV_WEEK_START,
                  plan_json: planJson,
                },
              ])
            : HttpResponse.json([]);
        }),
      );
    }

    it("shows nothing when there was no plan last week", async () => {
      servePrevWeekPlan(null);
      renderPlan();

      await screen.findByText("No plan yet for this week");
      expect(
        screen.queryByText(/of last week's plan followed/),
      ).not.toBeInTheDocument();
    });

    it("shows the completion percentage and neglected subjects", async () => {
      servePrevWeekPlan({
        days: [
          {
            date: PREV_WEEK_START,
            blocks: [{ subject: "Chemistry", durationMins: 100 }],
          },
        ],
      });
      server.use(
        http.get(rest("study_sessions"), () => HttpResponse.json([])),
        http.get(rest("folders"), () =>
          HttpResponse.json([
            {
              id: "f-chem",
              user_id: "user-1",
              name: "Chemistry",
              color: "#111111",
              created_at: "2026-01-01T00:00:00Z",
            },
          ]),
        ),
      );
      renderPlan();

      expect(await screen.findByText("0%")).toBeInTheDocument();
      expect(
        screen.getByText("of last week's plan followed"),
      ).toBeInTheDocument();
      expect(screen.getByText("Chemistry")).toBeInTheDocument();
      expect(
        screen.getByText(/the next plan will ease these back in/),
      ).toBeInTheDocument();
    });

    it("omits the neglected-subjects note when nothing was neglected", async () => {
      servePrevWeekPlan({
        days: [
          {
            date: PREV_WEEK_START,
            blocks: [{ subject: "Chemistry", durationMins: 60 }],
          },
        ],
      });
      server.use(
        http.get(rest("study_sessions"), () =>
          HttpResponse.json([
            {
              id: "s-1",
              user_id: "user-1",
              minutes: 60,
              folder_id: "f-chem",
              started_at: new Date(`${PREV_WEEK_START}T10:00:00`).toISOString(),
              task: null,
              timer_type: null,
              created_at: new Date(`${PREV_WEEK_START}T10:00:00`).toISOString(),
            },
          ]),
        ),
        http.get(rest("folders"), () =>
          HttpResponse.json([
            {
              id: "f-chem",
              user_id: "user-1",
              name: "Chemistry",
              color: "#111111",
              created_at: "2026-01-01T00:00:00Z",
            },
          ]),
        ),
      );
      renderPlan();

      expect(await screen.findByText("100%")).toBeInTheDocument();
      expect(
        screen.queryByText(/the next plan will ease these back in/),
      ).not.toBeInTheDocument();
    });
  });

  it("reports a load failure without blanking the page", async () => {
    server.use(
      http.get(rest("weekly_plans"), () =>
        HttpResponse.json({ message: "permission denied" }, { status: 403 }),
      ),
    );
    renderPlan();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "permission denied",
    );
    // Not a heading anymore — the app shell's Header supplies the page's
    // <h1> now (see redesign/DESIGN_MOVES.md move #2).
    expect(screen.getByText("This week's plan")).toBeInTheDocument();
  });
});
