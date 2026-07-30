import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { Storage } from "../../lib/storage";
import {
  FAVS_KEY,
  TIMER_END_KEY,
  TIMER_STATE_KEY,
  initialTimerState,
  persistTimerState,
} from "../../lib/timer";
import { TimerView } from "./TimerView";
import { MiniTimer } from "./MiniTimer";

function renderTimer(path = "/timer") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <TimerView />
      <MiniTimer />
    </MemoryRouter>,
    { session: fakeSession() },
    { withTimer: true },
  );
}

describe("TimerView", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/tasks`, () => HttpResponse.json([])),
      http.get(`${SUPABASE_URL}/rest/v1/folders`, () => HttpResponse.json([])),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens on a fresh 25-minute pomodoro", () => {
    renderTimer();

    expect(screen.getByText("25:00")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Focus" })).toBeInTheDocument();
    expect(screen.getByText("Cycle: 0 / 4")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Pomodoro" })).toBeChecked();
  });

  it("reports progress on the bar as a percentage", () => {
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 600,
    });
    renderTimer();

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("swaps Start for Pause while running", async () => {
    const user = userEvent.setup();
    renderTimer();

    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });

  it("counts down once per second", async () => {
    const user = userEvent.setup();
    renderTimer();

    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(screen.getByText("24:59")).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it("adds five minutes with +5 min", async () => {
    const user = userEvent.setup();
    renderTimer();

    await user.click(screen.getByRole("button", { name: "+5 min" }));

    expect(screen.getByText("30:00")).toBeInTheDocument();
  });

  it("shows each type's own configuration panel", async () => {
    const user = userEvent.setup();
    renderTimer();
    expect(screen.getByLabelText("Focus (mins)")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Countdown" }));
    expect(screen.getByLabelText("Duration (mins)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Focus (mins)")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Stopwatch" }));
    expect(screen.getByText(/Open-ended count-up/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Flowtime" }));
    expect(screen.getByText(/a fifth as long/)).toBeInTheDocument();
  });

  it("hides +5 min and the cycle counter on a count-up clock", async () => {
    const user = userEvent.setup();
    renderTimer();

    await user.click(screen.getByRole("radio", { name: "Stopwatch" }));

    expect(screen.queryByRole("button", { name: "+5 min" })).toBeNull();
    expect(screen.queryByText(/^Cycle:/)).toBeNull();
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("offers Take a break only in flowtime's focus phase", async () => {
    const user = userEvent.setup();
    renderTimer();
    expect(screen.queryByRole("button", { name: "Take a break" })).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Flowtime" }));

    expect(
      screen.getByRole("button", { name: "Take a break" }),
    ).toBeInTheDocument();
  });

  it("switching type while idle applies immediately", async () => {
    const user = userEvent.setup();
    renderTimer();

    await user.click(screen.getByRole("radio", { name: "Countdown" }));

    expect(screen.getByText("15:00")).toBeInTheDocument();
    // Nothing was staged, so no hint.
    expect(screen.queryByText(/Saved for your next session/)).toBeNull();
  });

  it("switching type while running stages it instead of cancelling", async () => {
    const user = userEvent.setup();
    renderTimer();
    await user.click(screen.getByRole("button", { name: "Start" }));

    await user.click(screen.getByRole("radio", { name: "Countdown" }));

    // The pomodoro keeps running…
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Focus" })).toBeInTheDocument();
    // …and the staged change is announced rather than silently swallowed.
    expect(screen.getByText(/Saved for your next session/)).toBeInTheDocument();
    // The panel switches so the user can set the staged type up.
    expect(screen.getByLabelText("Duration (mins)")).toBeInTheDocument();
  });

  it("Apply & Reset confirms before tearing down a running timer", async () => {
    const user = userEvent.setup();
    renderTimer();
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("radio", { name: "Countdown" }));

    await user.click(screen.getByRole("button", { name: "Apply & Reset" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Keep running" }),
    );

    // Still the running pomodoro.
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply & Reset" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Reset & switch",
      }),
    );

    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByText("15:00")).toBeInTheDocument();
    expect(screen.queryByText(/Saved for your next session/)).toBeNull();
  });

  it("a workflow preset fills the inputs without resetting the clock", async () => {
    /* The vanilla deliberately only wrote the config inputs here — it did not
       apply them — so a running timer was never disturbed. */
    const user = userEvent.setup();
    renderTimer();

    await user.click(screen.getByRole("button", { name: "Deep Work (90m)" }));

    expect(screen.getByLabelText("Focus (mins)")).toHaveValue(90);
    expect(screen.getByLabelText("Long Break")).toHaveValue(30);
    // Not applied yet — the clock is untouched until Apply & Reset.
    expect(screen.getByText("25:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply & Reset" }));
    // 90 minutes crosses an hour, so it formats as h:mm:ss.
    expect(screen.getByText("1:30:00")).toBeInTheDocument();
  });

  it("Reset asks before discarding a part-used count-down", async () => {
    const user = userEvent.setup();
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
    });
    renderTimer();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("discard your current session progress");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("05:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Reset",
      }),
    );
    expect(screen.getByText("25:00")).toBeInTheDocument();
  });

  it("Reset needs no confirmation on a fresh timer", async () => {
    const user = userEvent.setup();
    renderTimer();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("becomes Stop & log once a stopwatch has a minute on it", async () => {
    const user = userEvent.setup();
    renderTimer();
    await user.click(screen.getByRole("radio", { name: "Stopwatch" }));
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();

    // Bank 90s by hand rather than waiting it out.
    Storage.set(TIMER_STATE_KEY, {
      type: "stopwatch",
      mode: "Focus",
      isRunning: false,
      elapsed: 90,
      countUpBase: 90,
      config: {},
    });
    renderTimer();

    expect(
      screen.getAllByRole("button", { name: "Stop & log" })[0],
    ).toBeInTheDocument();
  });

  it("logs the banked stopwatch session on Stop & log", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown>[] | undefined;
    server.use(
      http.post(
        `${SUPABASE_URL}/rest/v1/study_sessions`,
        async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>[];
          return new HttpResponse(null, { status: 201 });
        },
      ),
    );
    Storage.set(TIMER_STATE_KEY, {
      type: "stopwatch",
      mode: "Focus",
      isRunning: false,
      elapsed: 180,
      countUpBase: 180,
      config: {},
    });
    renderTimer();

    await user.click(screen.getByRole("button", { name: "Stop & log" }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body![0]).toMatchObject({
      minutes: 3,
      task: "General Study",
      timer_type: "stopwatch",
      user_id: "user-1",
    });
    // Local history is written too — the source of truth for instant UI.
    expect(Storage.get<unknown[]>("sessions", [])).toHaveLength(1);
  });

  it("keeps the local session log even when the Supabase write fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/study_sessions`, () =>
        HttpResponse.json({ message: "offline" }, { status: 500 }),
      ),
    );
    Storage.set(TIMER_STATE_KEY, {
      type: "stopwatch",
      mode: "Focus",
      isRunning: false,
      elapsed: 180,
      countUpBase: 180,
      config: {},
    });
    renderTimer();

    await user.click(screen.getByRole("button", { name: "Stop & log" }));

    await waitFor(() =>
      expect(Storage.get<unknown[]>("sessions", [])).toHaveLength(1),
    );
  });

  it("saves, applies and deletes a favourite preset", async () => {
    const user = userEvent.setup();
    renderTimer();

    await user.clear(screen.getByLabelText("Focus (mins)"));
    await user.type(screen.getByLabelText("Focus (mins)"), "45");
    await user.click(
      screen.getByRole("button", { name: /Save Current as Preset/ }),
    );

    const prompt = await screen.findByRole("alertdialog");
    await user.type(within(prompt).getByRole("textbox"), "Math Prep");
    await user.click(
      within(prompt).getByRole("button", { name: "Save preset" }),
    );

    const favBtn = await screen.findByRole("button", {
      name: /^Math Prep \[Pomodoro\] \(45m\)$/,
    });
    expect(Storage.get<unknown[]>(FAVS_KEY, [])).toHaveLength(1);

    await user.click(favBtn);
    expect(screen.getByText("45:00")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Delete preset: Math Prep" }),
    );
    expect(screen.queryByRole("button", { name: /^Math Prep/ })).toBeNull();
    expect(Storage.get<unknown[]>(FAVS_KEY, [])).toHaveLength(0);
  });

  it("restores a running count-down across a reload", () => {
    const now = Date.now();
    Storage.set(TIMER_STATE_KEY, {
      isRunning: true,
      type: "pomodoro",
      mode: "Focus",
      timeLeft: 600,
      totalTime: 1500,
      config: {},
    });
    localStorage.setItem(TIMER_END_KEY, String(now + 300_000));
    renderTimer();

    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("finishes a count-down that expired while the tab was closed", async () => {
    let body: Record<string, unknown>[] | undefined;
    server.use(
      http.post(
        `${SUPABASE_URL}/rest/v1/study_sessions`,
        async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>[];
          return new HttpResponse(null, { status: 201 });
        },
      ),
    );
    Storage.set(TIMER_STATE_KEY, {
      isRunning: true,
      type: "pomodoro",
      mode: "Focus",
      timeLeft: 60,
      totalTime: 1500,
      config: {},
    });
    localStorage.setItem(TIMER_END_KEY, String(Date.now() - 5000));
    renderTimer();

    // The focus phase is logged and the timer has moved on to a short break.
    await waitFor(() => expect(body).toBeDefined());
    expect(body![0]).toMatchObject({ minutes: 25 });
    expect(
      screen.getByRole("heading", { name: "Short Break" }),
    ).toBeInTheDocument();
  });

  it("attributes a logged session to the bound task", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown>[] | undefined;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/tasks`, () =>
        HttpResponse.json([
          {
            id: 1,
            user_id: "user-1",
            text: "Read chapter 4",
            is_done: false,
            due_date: null,
          },
        ]),
      ),
      http.post(
        `${SUPABASE_URL}/rest/v1/study_sessions`,
        async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>[];
          return new HttpResponse(null, { status: 201 });
        },
      ),
    );
    Storage.set(TIMER_STATE_KEY, {
      type: "stopwatch",
      mode: "Focus",
      isRunning: false,
      elapsed: 120,
      countUpBase: 120,
      config: {},
    });
    renderTimer();

    await screen.findByRole("option", { name: "Read chapter 4" });
    await user.selectOptions(
      screen.getByLabelText("Current Task:"),
      "Read chapter 4",
    );
    await user.click(screen.getByRole("button", { name: "Stop & log" }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body![0]).toMatchObject({ task: "Read chapter 4", minutes: 2 });
  });

  it("does not dock the mini-timer on the timer route itself", async () => {
    const user = userEvent.setup();
    renderTimer("/timer");

    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.queryByRole("button", { name: "Open the timer" })).toBeNull();
  });
});

describe("MiniTimer", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderMini(path = "/tasks") {
    return renderWithAuth(
      <MemoryRouter initialEntries={[path]}>
        <MiniTimer />
      </MemoryRouter>,
      { session: fakeSession() },
      { withTimer: true },
    );
  }

  it("stays hidden while no session is live", () => {
    renderMini();
    expect(screen.queryByRole("button", { name: "Open the timer" })).toBeNull();
  });

  it("docks on another route once a count-down is part-used", () => {
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
    });
    renderMini();

    expect(
      screen.getByRole("button", { name: "Open the timer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText("Focus")).toBeInTheDocument();
  });

  it("toggles the timer from its own button", async () => {
    const user = userEvent.setup();
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
    });
    renderMini();

    await user.click(screen.getByRole("button", { name: "Resume timer" }));

    expect(
      screen.getByRole("button", { name: "Pause timer" }),
    ).toBeInTheDocument();
  });

  it("announces itself politely rather than interrupting", () => {
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
    });
    renderMini();

    /* The toast container also carries role="status", so scope to the one that
       actually holds the clock. */
    const dock = screen
      .getByRole("button", { name: "Open the timer" })
      .closest('[role="status"]')!;
    expect(dock).toHaveAttribute("aria-live", "polite");
  });
});
