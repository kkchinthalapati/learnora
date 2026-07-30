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
