import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { MONTH_NAMES, formatDateStr, localDateStr } from "../../lib/date";
import type { Exam } from "../../api/types";
import { ExamsView } from "./ExamsView";

const REST = `${SUPABASE_URL}/rest/v1/exams`;

/* These tests deliberately run on the real clock. Pinning it with
 * `vi.useFakeTimers` looks tempting — the grid's shape depends entirely on
 * "today" — but TanStack Query and MSW both pace themselves off `Date.now()`,
 * so a frozen clock means the query never resolves and the grid never renders.
 * Faking the timer functions as well (even with `shouldAdvanceTime`) fixed
 * that only by burning real time on an interval, which slowed the suite down
 * enough to time out unrelated files. So every expectation is derived from the
 * real date instead. */
const NOW = new Date();
const Y = NOW.getFullYear();
const M = NOW.getMonth();
const MONTH_LABEL = `${MONTH_NAMES[M]} ${Y}`;
const DAYS_IN_MONTH = new Date(Y, M + 1, 0).getDate();
const TODAY = localDateStr();

/** A day in the displayed month — 1..28 is safe in every month. */
const dayStr = (d: number) => formatDateStr(Y, M, d);

/** The previous month is always entirely in the past. */
const PREV = new Date(Y, M - 1, 1);
const PREV_LABEL = `${MONTH_NAMES[PREV.getMonth()]} ${PREV.getFullYear()}`;
const prevDayStr = (d: number) =>
  formatDateStr(PREV.getFullYear(), PREV.getMonth(), d);

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: 1,
    user_id: "user-1",
    exam_name: "Chemistry Midterm",
    exam_date: TODAY,
    difficulty: "Medium",
    status: "Scheduled",
    ...overrides,
  };
}

function serveExams(rows: Exam[]) {
  server.use(http.get(REST, () => HttpResponse.json(rows)));
}

function renderExams() {
  return renderWithAuth(
    <ExamsView />,
    { session: fakeSession() },
    { withRouter: true, initialEntries: ["/exams"] },
  );
}

const cellFor = (day: number, month = M, year = Y) =>
  screen.getByRole("button", { name: `${MONTH_NAMES[month]} ${day}, ${year}` });

/* The month heading paints before the exams query resolves, so awaiting it
 * proves nothing. The weekday strip renders only once the grid does. */
const gridReady = () => screen.findByText("Sun");

describe("ExamsView", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens on the current month", async () => {
    serveExams([]);
    renderExams();

    expect(await screen.findByText(MONTH_LABEL)).toBeInTheDocument();
  });

  it("marks Exams as the current planning section", async () => {
    serveExams([]);
    renderExams();

    await gridReady();
    expect(screen.getByRole("link", { name: "Exams" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("renders exactly one cell per day of the month", async () => {
    serveExams([]);
    renderExams();
    await gridReady();

    expect(cellFor(1)).toBeInTheDocument();
    expect(cellFor(DAYS_IN_MONTH)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: `${MONTH_NAMES[M]} ${DAYS_IN_MONTH + 1}, ${Y}`,
      }),
    ).toBeNull();
  });

  it("marks today differently from any other day", async () => {
    serveExams([]);
    renderExams();
    await gridReady();

    const todayCell = cellFor(NOW.getDate());
    const otherCell = cellFor(NOW.getDate() === 1 ? 2 : 1);
    expect(todayCell.className).not.toEqual(otherCell.className);
  });

  it("steps a whole year forward without skipping or repeating a month", async () => {
    /* The vanilla mutated a shared Date with `setMonth()`, which overflows out
       of a long month (31 Jan + 1 month → 3 Mar) and silently skips one.
       Twelve steps must visit twelve distinct months and land one year on. */
    const user = userEvent.setup();
    serveExams([]);
    renderExams();
    await gridReady();

    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      await user.click(screen.getByRole("button", { name: "Next Month" }));
      seen.push(screen.getByRole("heading", { level: 2 }).textContent!);
    }

    expect(new Set(seen).size).toBe(12);
    expect(seen[11]).toBe(`${MONTH_NAMES[M]} ${Y + 1}`);
  });

  it("steps backwards across the year boundary too", async () => {
    const user = userEvent.setup();
    serveExams([]);
    renderExams();
    await gridReady();

    await user.click(screen.getByRole("button", { name: "Previous Month" }));
    expect(screen.getByText(PREV_LABEL)).toBeInTheDocument();

    for (let i = 0; i < 11; i++) {
      await user.click(screen.getByRole("button", { name: "Previous Month" }));
    }
    expect(screen.getByText(`${MONTH_NAMES[M]} ${Y - 1}`)).toBeInTheDocument();
  });

  it("draws an exam on its own day only", async () => {
    serveExams([exam({ exam_date: dayStr(20), exam_name: "Physics Final" })]);
    renderExams();
    await gridReady();

    expect(within(cellFor(20)).getByText("Physics Final")).toBeInTheDocument();
    expect(within(cellFor(21)).queryByText("Physics Final")).toBeNull();
  });

  it("collapses more than two exams on one day into a +N badge", async () => {
    serveExams([
      exam({ id: 1, exam_name: "One", exam_date: dayStr(20) }),
      exam({ id: 2, exam_name: "Two", exam_date: dayStr(20) }),
      exam({ id: 3, exam_name: "Three", exam_date: dayStr(20) }),
      exam({ id: 4, exam_name: "Four", exam_date: dayStr(20) }),
    ]);
    renderExams();
    await gridReady();

    const cell = cellFor(20);
    expect(within(cell).getByText("One")).toBeInTheDocument();
    expect(within(cell).getByText("Two")).toBeInTheDocument();
    expect(within(cell).queryByText("Three")).toBeNull();
    expect(within(cell).getByText("+2 more")).toBeInTheDocument();
  });

  it("gives each difficulty its own bar styling", async () => {
    serveExams([
      exam({
        id: 1,
        exam_name: "Easy one",
        exam_date: dayStr(10),
        difficulty: "Easy",
      }),
      exam({
        id: 2,
        exam_name: "Mid one",
        exam_date: dayStr(11),
        difficulty: "Medium",
      }),
      exam({
        id: 3,
        exam_name: "Hard one",
        exam_date: dayStr(12),
        difficulty: "Hard",
      }),
    ]);
    renderExams();
    await gridReady();

    const classes = ["Easy one", "Mid one", "Hard one"].map(
      (n) => screen.getByText(n).className,
    );
    expect(new Set(classes).size).toBe(3);
  });

  it("dims a past exam unless it is marked Completed", async () => {
    const user = userEvent.setup();
    serveExams([
      exam({ id: 1, exam_name: "Missed it", exam_date: prevDayStr(10) }),
      exam({
        id: 2,
        exam_name: "Sat it",
        exam_date: prevDayStr(11),
        status: "Completed",
      }),
    ]);
    renderExams();
    await gridReady();
    await user.click(screen.getByRole("button", { name: "Previous Month" }));

    expect(screen.getByText("Missed it").className).not.toEqual(
      screen.getByText("Sat it").className,
    );
  });

  it("opens a blank create dialog for a day with no exams", async () => {
    const user = userEvent.setup();
    serveExams([]);
    renderExams();
    await gridReady();

    await user.click(cellFor(20));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("New exam")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("When is it?")).toHaveValue(
      dayStr(20),
    );
  });

  it("opens the day list instead when the day already has exams", async () => {
    const user = userEvent.setup();
    serveExams([exam({ exam_date: dayStr(20), exam_name: "Physics Final" })]);
    renderExams();
    await gridReady();

    await user.click(cellFor(20));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Exams on/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Edit exam: Physics Final" }),
    ).toBeInTheDocument();
  });

  it("activates a cell from the keyboard", async () => {
    const user = userEvent.setup();
    serveExams([]);
    renderExams();
    await gridReady();

    cellFor(20).focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("clicking an exam bar edits it rather than opening the day list", async () => {
    const user = userEvent.setup();
    serveExams([exam({ exam_date: dayStr(20), exam_name: "Physics Final" })]);
    renderExams();
    await gridReady();

    await user.click(screen.getByText("Physics Final"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Edit exam")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Exams on/)).toBeNull();
  });

  it("hands off from the day list to the edit dialog", async () => {
    const user = userEvent.setup();
    serveExams([
      exam({ id: 1, exam_name: "First", exam_date: dayStr(20) }),
      exam({ id: 2, exam_name: "Second", exam_date: dayStr(20) }),
    ]);
    renderExams();
    await gridReady();

    await user.click(cellFor(20));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Edit exam: Second",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("What's the exam?")).toHaveValue(
      "Second",
    );
    // The day list is replaced, not stacked underneath it.
    expect(screen.queryByText(/Exams on/)).toBeNull();
  });

  it("adds another exam for the same day from the day list", async () => {
    const user = userEvent.setup();
    serveExams([exam({ exam_date: dayStr(20), exam_name: "First" })]);
    renderExams();
    await gridReady();

    await user.click(cellFor(20));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "+ Add exam",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("New exam")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("When is it?")).toHaveValue(
      dayStr(20),
    );
  });

  it("starts the toolbar's + Add exam on today", async () => {
    const user = userEvent.setup();
    serveExams([]);
    renderExams();
    await gridReady();

    await user.click(screen.getByRole("button", { name: "+ Add exam" }));

    expect(
      within(await screen.findByRole("dialog")).getByLabelText("When is it?"),
    ).toHaveValue(TODAY);
  });

  it("closes the dialog on Escape", async () => {
    const user = userEvent.setup();
    serveExams([]);
    renderExams();
    await gridReady();

    await user.click(cellFor(20));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("surfaces a load failure", async () => {
    server.use(
      http.get(REST, () =>
        HttpResponse.json({ message: "permission denied" }, { status: 403 }),
      ),
    );
    renderExams();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "permission denied",
    );
  });
});
