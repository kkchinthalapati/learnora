import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { resetLifeContextCache } from "../../hooks/useLifeContext";
import {
  DEFAULT_LIFE_CONTEXT,
  LIFE_CONTEXT_KEY,
  createCommitment,
  type LifeContext,
  type Weekday,
} from "../../lib/lifeContext";
import { localDateStr } from "../../lib/date";
import { TodayTimelineCard } from "./TodayTimelineCard";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

const TODAY = localDateStr();
const TODAY_WEEKDAY = new Date().getDay() as Weekday;

function serve({
  tasks = [] as unknown[],
  exams = [] as unknown[],
  dueCount = 0,
} = {}) {
  server.use(
    http.get(rest("tasks"), () => HttpResponse.json(tasks)),
    http.get(rest("exams"), () => HttpResponse.json(exams)),
    /* `fetchDueCount` asks for `count: "exact", head: true`, so the number
       arrives in a content-range header on a HEAD, not in a JSON body. */
    http.head(
      rest("flashcards"),
      () =>
        new HttpResponse(null, {
          status: 200,
          headers: { "content-range": `*/${dueCount}` },
        }),
    ),
    http.get(rest("quiz_attempts"), () => HttpResponse.json([])),
  );
}

/** Seed a configured week whose commitments land on whatever today is, so the
 *  test does not silently pass on six days out of seven. */
function seedLifeContext(patch: Partial<LifeContext> = {}) {
  localStorage.setItem(
    LIFE_CONTEXT_KEY,
    JSON.stringify({
      ...DEFAULT_LIFE_CONTEXT,
      wakeTime: "07:00",
      sleepTime: "23:00",
      weekdayCapacityMins: 300,
      weekendCapacityMins: 300,
      commitments: [
        createCommitment({
          label: "Chemistry lecture",
          kind: "class",
          days: [TODAY_WEEKDAY],
          start: "09:00",
          end: "11:00",
        }),
      ],
      ...patch,
    }),
  );
  resetLifeContextCache();
}

function render() {
  return renderWithAuth(
    <TodayTimelineCard />,
    { session: fakeSession() },
    {
      withTimer: true,
      withRouter: true,
    },
  );
}

describe("TodayTimelineCard", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLifeContextCache();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLifeContextCache();
  });

  it("invites setup when Learnora knows nothing about the week", async () => {
    serve();
    render();

    expect(
      await screen.findByText(/doesn’t know your week yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /set up my week/i }),
    ).toBeInTheDocument();
  });

  it("does not show the invitation once a commitment exists", async () => {
    seedLifeContext();
    serve({ dueCount: 12 });
    render();

    expect(await screen.findByText(/Chemistry lecture/)).toBeInTheDocument();
    expect(screen.queryByText(/doesn’t know your week yet/i)).toBeNull();
  });

  it("places today's work around the student's commitments", async () => {
    seedLifeContext();
    serve({ dueCount: 12 });
    render();

    /* The review demand is built from the due-card count, so its presence
       proves the whole chain ran: context → availability → demands →
       scheduler → timeline. */
    expect(await screen.findByText(/Review 12 due cards/)).toBeInTheDocument();
    expect(screen.getByText(/Chemistry lecture/)).toBeInTheDocument();
    expect(screen.getByText(/placed around 1 commitment/)).toBeInTheDocument();
  });

  it("hands a block off to the timer when Start is pressed", async () => {
    const user = userEvent.setup();
    seedLifeContext();
    serve({ dueCount: 12 });
    render();

    const start = await screen.findByRole("button", {
      name: /Start .* focus session: Review 12 due cards/,
    });
    await user.click(start);

    /* The handoff is PlanView's startBlock contract: the block's duration is
       pre-staged on the timer and the student lands on /timer with only Start
       left to press. The staged duration is what proves it happened — the
       navigation itself has nothing to render under a bare MemoryRouter. */
    await waitFor(() => {
      const staged = JSON.parse(localStorage.getItem("timer_state") ?? "{}");
      expect(staged.totalTime).toBe(10 * 60);
    });
  });

  it("says the day is the student's own when it is protected", async () => {
    seedLifeContext({ protectedDays: [TODAY_WEEKDAY] });
    serve({ dueCount: 12 });
    render();

    expect(await screen.findByText(/Today is yours/)).toBeInTheDocument();
  });

  it("offers a calendar export only when there is something to export", async () => {
    seedLifeContext();
    serve({ dueCount: 12 });
    render();

    expect(
      await screen.findByRole("button", { name: /add week to calendar/i }),
    ).toBeInTheDocument();
  });

  it("shows an all-day calendar entry as context without blocking the day", async () => {
    const today = TODAY.replace(/-/g, "");
    seedLifeContext({
      importedIcs: [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "SUMMARY:Reading week",
        `DTSTART;VALUE=DATE:${today}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });
    serve({ dueCount: 12 });
    render();

    expect(await screen.findByText(/Reading week/)).toBeInTheDocument();
    expect(screen.getByText(/Review 12 due cards/)).toBeInTheDocument();
  });

  it("says out loud when more is due today than there is day left", async () => {
    /* A planner that quietly slid the deadline would be lying, and this is
       the most actionable thing the card can say while there is still a
       morning left to act on it. */
    seedLifeContext({
      wakeTime: "08:00",
      sleepTime: "09:00",
      weekdayCapacityMins: 60,
      weekendCapacityMins: 60,
      /* Keeps the context "configured" — the commitment sits outside the
         one-hour waking window above, so it costs the day nothing while
         still standing in for a student who has done the setup. */
      commitments: [
        createCommitment({
          label: "Evening shift",
          kind: "work",
          days: [TODAY_WEEKDAY],
          start: "18:00",
          end: "22:00",
        }),
      ],
    });
    serve({
      tasks: [
        {
          id: 1,
          user_id: "user-1",
          text: "Finish the lab report ~4h",
          is_done: false,
          due_date: TODAY,
        },
      ],
    });
    render();

    expect(await screen.findByText(/of work due today/)).toBeInTheDocument();
  });
});
