import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { localDateStr, mondayOfWeek } from "../lib/date";
import {
  PlanShapeError,
  buildPlanPrompt,
  generateWeeklyPlan,
  loadAdaptiveContext,
  loadWorkspaceContext,
} from "./aiPlan";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;
const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

const TODAY = "2026-08-05";

const tasks = [
  {
    id: 1,
    user_id: "user-1",
    text: "Read chapter 4",
    is_done: false,
    due_date: "2026-08-07",
  },
  {
    id: 2,
    user_id: "user-1",
    text: "Tidy notes",
    is_done: false,
    due_date: null,
  },
  {
    id: 3,
    user_id: "user-1",
    text: "Already done",
    is_done: true,
    due_date: null,
  },
];

const exams = [
  {
    id: 1,
    user_id: "user-1",
    exam_name: "Biology final",
    exam_date: "2026-08-20",
    difficulty: "hard",
    status: "Scheduled",
  },
  {
    id: 2,
    user_id: "user-1",
    exam_name: "Chemistry midterm",
    exam_date: "2026-08-10",
    difficulty: null,
    status: "Scheduled",
  },
  {
    id: 3,
    user_id: "user-1",
    exam_name: "Last month's mock",
    exam_date: "2026-07-01",
    difficulty: "easy",
    status: "Scheduled",
  },
  {
    id: 4,
    user_id: "user-1",
    exam_name: "Sat and passed",
    exam_date: "2026-08-25",
    difficulty: "easy",
    status: "Completed",
  },
];

function serveWorkspace() {
  server.use(
    http.get(rest("tasks"), () => HttpResponse.json(tasks)),
    http.get(rest("exams"), () => HttpResponse.json(exams)),
  );
}

describe("loadWorkspaceContext", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    serveWorkspace();
  });

  afterEach(() => vi.restoreAllMocks());

  it("lists only pending tasks, carrying each due date through", async () => {
    const { pendingTasks } = await loadWorkspaceContext(TODAY);
    expect(pendingTasks).toBe("Read chapter 4 (due 2026-08-07), Tidy notes");
    expect(pendingTasks).not.toContain("Already done");
  });

  /* An exam that already happened, or one the student marked Completed, is
     not "upcoming" and must not shape the schedule as if it still were. */
  it("drops past and Completed exams, and sorts the rest soonest first", async () => {
    const { upcomingExams } = await loadWorkspaceContext(TODAY);
    expect(upcomingExams).toBe(
      "Chemistry midterm on 2026-08-10 (difficulty: unspecified), Biology final on 2026-08-20 (difficulty: hard)",
    );
  });

  it('says "None" rather than an empty string when there is nothing', async () => {
    server.use(
      http.get(rest("tasks"), () => HttpResponse.json([])),
      http.get(rest("exams"), () => HttpResponse.json([])),
    );

    await expect(loadWorkspaceContext(TODAY)).resolves.toEqual({
      pendingTasks: "None",
      upcomingExams: "None",
    });
  });
});

describe("buildPlanPrompt", () => {
  it("names the week, its seven dates, and the workspace state", () => {
    const prompt = buildPlanPrompt({
      weekStartISO: "2026-08-03",
      dates: ["2026-08-03", "2026-08-04"],
      pendingTasks: "Read chapter 4",
      upcomingExams: "None",
    });

    expect(prompt).toContain("week of 2026-08-03");
    expect(prompt).toContain("days: 2026-08-03, 2026-08-04");
    expect(prompt).toContain("Pending tasks: Read chapter 4");
    expect(prompt).toContain("Upcoming exams: None");
  });

  it("defaults weak topics and last week's adherence to None when omitted", () => {
    const prompt = buildPlanPrompt({
      weekStartISO: "2026-08-03",
      dates: ["2026-08-03"],
      pendingTasks: "None",
      upcomingExams: "None",
    });

    expect(prompt).toContain("Recent weak topics from quizzes: None");
    expect(prompt).toContain("Last week's adherence: None");
  });

  it("carries weak topics and last week's adherence through when given", () => {
    const prompt = buildPlanPrompt({
      weekStartISO: "2026-08-03",
      dates: ["2026-08-03"],
      pendingTasks: "None",
      upcomingExams: "None",
      weakTopics: "Photosynthesis, Cell division",
      lastWeekAdherence: "Followed about 40% of last week's plan.",
    });

    expect(prompt).toContain(
      "Recent weak topics from quizzes: Photosynthesis, Cell division",
    );
    expect(prompt).toContain(
      "Last week's adherence: Followed about 40% of last week's plan.",
    );
  });
});

describe("buildPlanPrompt — performance evidence", () => {
  const base = {
    weekStartISO: "2026-09-07",
    dates: ["2026-09-07", "2026-09-08"],
    pendingTasks: "None",
    upcomingExams: "None",
  };

  /* The planner decides where a week's hours go. `weakTopics` alone is a list
     of names — it says a topic was flagged, not how badly, not what is already
     solid, and not how much evidence sits behind either. */
  it("carries the evidence block and the rule that uses it", () => {
    const prompt = buildPlanPrompt({
      ...base,
      weakTopics: "Titration",
      performanceEvidence:
        "PERFORMANCE EVIDENCE (from the student's actual quiz results):\n- WEAK (below 60%, measured): Titration (30%).",
    });

    expect(prompt).toContain("PERFORMANCE EVIDENCE");
    expect(prompt).toContain("Titration (30%)");
    expect(prompt).toContain("EVIDENCE RULE");
    expect(prompt).toContain("SOLID");
    expect(prompt).toContain("NEVER TESTED");
  });

  it("carries it into the triage prompt too", () => {
    const prompt = buildPlanPrompt({
      ...base,
      isTriage: true,
      performanceEvidence: "PERFORMANCE EVIDENCE: Titration 30%.",
    });
    expect(prompt).toContain("PERFORMANCE EVIDENCE");
    expect(prompt).toContain("Triage situation");
  });

  /* Callers that predate this — and the existing prompt tests — must still
     get the plain task/exam prompt rather than a "None"-cluttered one. */
  it("omits the block and its rule entirely when there is no evidence", () => {
    const prompt = buildPlanPrompt(base);
    expect(prompt).not.toContain("PERFORMANCE EVIDENCE");
    expect(prompt).not.toContain("EVIDENCE RULE");
  });
});

describe("loadAdaptiveContext", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    serveWorkspace();
  });

  afterEach(() => vi.restoreAllMocks());

  it("reports None for both signals when there is nothing to go on", async () => {
    // Global default handlers already answer quiz_attempts/weekly_plans/
    // study_sessions/folders with empty results — nothing extra to mock.
    const context = await loadAdaptiveContext(mondayOfWeek());
    expect(context).toMatchObject({
      weakTopics: "None",
      weakFlashcardDecks: "None",
      lastWeekAdherence: "None",
    });
    /* The evidence block is rendered even with nothing to report — the empty
       summary is what carries the instruction not to guess a grade, which is
       exactly the case where the model otherwise would. */
    expect(context.performanceEvidence).toContain("PERFORMANCE EVIDENCE");
    expect(context.performanceEvidence).toContain(
      "no current performance data",
    );
  });

  it("ranks weak topics by frequency and summarizes last week's adherence", async () => {
    const monday = mondayOfWeek();
    const prevMonday = new Date(monday);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevWeekStartISO = localDateStr(prevMonday);

    server.use(
      http.get(rest("quiz_attempts"), () =>
        HttpResponse.json([
          {
            weak_topics: ["Photosynthesis", "Photosynthesis", "Cell division"],
          },
        ]),
      ),
      http.get(rest("weekly_plans"), ({ request }) => {
        const requestedWeek = new URL(request.url).searchParams
          .get("week_start")
          ?.replace(/^eq\./, "");
        if (requestedWeek !== prevWeekStartISO) return HttpResponse.json([]);
        return HttpResponse.json([
          {
            id: "prev-plan",
            week_start: prevWeekStartISO,
            plan_json: {
              days: [
                {
                  date: prevWeekStartISO,
                  blocks: [{ subject: "Chemistry", durationMins: 90 }],
                },
              ],
            },
          },
        ]);
      }),
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

    const context = await loadAdaptiveContext(monday);

    expect(context.weakTopics).toBe("Photosynthesis, Cell division");
    expect(context.weakFlashcardDecks).toBe("None");
    expect(context.lastWeekAdherence).toBe(
      "Followed about 0% of last week's planned study time. Under-studied relative to plan: Chemistry.",
    );
  });
});

describe("generateWeeklyPlan", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    serveWorkspace();
  });

  afterEach(() => vi.restoreAllMocks());

  it('sends mode "plan" with the settings the caller passed', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          text: JSON.stringify({ summary: "s", days: [] }),
        });
      }),
      http.post(rest("weekly_plans"), () =>
        HttpResponse.json({ id: "plan-1", week_start: "2026-08-03" }),
      ),
    );

    await generateWeeklyPlan({ ...DEFAULT_SETTINGS, aiPersona: "coach" });

    expect(body?.mode).toBe("plan");
    expect(body?.settings).toMatchObject({ aiPersona: "coach" });
  });

  it("folds weak topics into the prompt it sends the model", async () => {
    server.use(
      http.get(rest("quiz_attempts"), () =>
        HttpResponse.json([{ weak_topics: ["Thermodynamics"] }]),
      ),
    );
    let sentPrompt = "";
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        const body = (await request.json()) as {
          history: { content: string }[];
        };
        sentPrompt = body.history[0].content;
        return HttpResponse.json({
          text: JSON.stringify({ summary: "s", days: [] }),
        });
      }),
      http.post(rest("weekly_plans"), () =>
        HttpResponse.json({ id: "plan-1" }),
      ),
    );

    await generateWeeklyPlan(DEFAULT_SETTINGS);

    expect(sentPrompt).toContain(
      "Recent weak topics from quizzes: Thermodynamics",
    );
  });

  it("upserts the parsed plan against this week's Monday", async () => {
    let upserted: Record<string, unknown>[] | undefined;
    const planJson = {
      summary: "Balanced week",
      days: [{ date: "2026-08-03", blocks: [] }],
    };
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({ text: JSON.stringify(planJson) }),
      ),
      http.post(rest("weekly_plans"), async ({ request }) => {
        upserted = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "plan-1" });
      }),
    );

    await generateWeeklyPlan(DEFAULT_SETTINGS);

    expect(upserted?.[0]).toMatchObject({
      user_id: "user-1",
      week_start: localDateStr(mondayOfWeek()),
      plan_json: planJson,
    });
  });

  it("recovers a plan wrapped in prose and code fences", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({
          text: 'Here you go!\n```json\n{"days":[{"date":"2026-08-03"}],}\n```',
        }),
      ),
      http.post(rest("weekly_plans"), () =>
        HttpResponse.json({ id: "plan-1" }),
      ),
    );

    await expect(generateWeeklyPlan(DEFAULT_SETTINGS)).resolves.toMatchObject({
      id: "plan-1",
    });
  });

  /* A reply the model produced but that carries no days is a different
     failure from the service being down, and deserves a different message —
     so it gets its own error type rather than being flattened into AiError. */
  it("throws PlanShapeError when nothing plan-shaped comes back", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({ text: "I'd rather write you a poem." }),
      ),
    );

    await expect(generateWeeklyPlan(DEFAULT_SETTINGS)).rejects.toBeInstanceOf(
      PlanShapeError,
    );
  });

  it("does not save anything when the model reply is unusable", async () => {
    let saves = 0;
    server.use(
      http.post(EDGE_URL, () => HttpResponse.json({ text: "nope" })),
      http.post(rest("weekly_plans"), () => {
        saves++;
        return HttpResponse.json({ id: "plan-1" });
      }),
    );

    await expect(generateWeeklyPlan(DEFAULT_SETTINGS)).rejects.toThrow();
    expect(saves).toBe(0);
  });

  it("propagates a transport failure instead of swallowing it", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({ error: "Bad token" }, { status: 401 }),
      ),
    );

    await expect(generateWeeklyPlan(DEFAULT_SETTINGS)).rejects.toThrow(
      "Bad token",
    );
  });
});
