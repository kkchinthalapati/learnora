import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { resetLifeContextCache } from "../../hooks/useLifeContext";
import { loadLifeContext } from "../../lib/lifeContext";
import { MyWeekView } from "./MyWeekView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

const PRO_ROW = {
  plan: "pro",
  plan_status: "active",
  plan_renews_at: null,
  plan_cancel_at_period_end: false,
};

/* Calendar import is a Pro feature, so these tests sign in as a Pro account.
   ProGate has its own tests for what a free account sees. */
function serve({ pro = true } = {}) {
  server.use(
    http.get(rest("profiles"), () => HttpResponse.json(pro ? [PRO_ROW] : [])),
    http.get(rest("tasks"), () => HttpResponse.json([])),
    http.get(rest("exams"), () => HttpResponse.json([])),
    http.get(rest("quiz_attempts"), () => HttpResponse.json([])),
    http.head(
      rest("flashcards"),
      () =>
        new HttpResponse(null, {
          status: 200,
          headers: { "content-range": "*/0" },
        }),
    ),
  );
}

function render() {
  return renderWithAuth(
    <MyWeekView />,
    { session: fakeSession() },
    {
      withTimer: true,
      withRouter: true,
    },
  );
}

describe("MyWeekView", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLifeContextCache();
    mockAuthSession("user-1");
    serve();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLifeContextCache();
  });

  it("opens on defaults with nothing in the week yet", async () => {
    render();

    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
    /* Every field has a working default so a student who stops halfway still
       has a usable context — the setup screen is never in a broken state. */
    expect(loadLifeContext().commitments).toEqual([]);
  });

  it("persists a chronotype choice immediately", async () => {
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("radio", { name: /Night owl/ }));

    expect(loadLifeContext().chronotype).toBe("night");
    expect(screen.getByRole("radio", { name: /Night owl/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("adds a commitment prefilled for the working week", async () => {
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: /^Add$/ }));

    const saved = loadLifeContext().commitments;
    expect(saved).toHaveLength(1);
    expect(saved[0].days).toEqual([1, 2, 3, 4, 5]);
    expect(screen.getByLabelText("What is it")).toBeInTheDocument();
  });

  it("toggles a day off a commitment", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: /^Add$/ }));

    const group = screen.getByRole("group", { name: /days it happens/i });
    await user.click(
      screen.getAllByRole("button", { name: "Mon", pressed: true })[0],
    );

    expect(loadLifeContext().commitments[0].days).toEqual([2, 3, 4, 5]);
    expect(group).toBeInTheDocument();
  });

  it("warns in place when an end time does not follow its start", async () => {
    /* normalizeLifeContext silently drops such a row on reload, so a student
       who never sees this message would just find their commitment gone. */
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: /^Add$/ }));

    const end = screen.getByLabelText("End time");
    await user.clear(end);
    await user.type(end, "08:00");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /end time needs to come after the start/i,
    );
  });

  it("prompts for days when a commitment has none", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: /^Add$/ }));

    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
      await user.click(
        screen.getByRole("button", { name: day, pressed: true }),
      );
    }

    expect(
      screen.getByText(/Pick the days this happens on/),
    ).toBeInTheDocument();
  });

  it("steps the honest daily capacity up and down", async () => {
    const user = userEvent.setup();
    render();

    const before = loadLifeContext().weekdayCapacityMins;
    await user.click(
      await screen.findByRole("button", { name: "More weekday study" }),
    );
    expect(loadLifeContext().weekdayCapacityMins).toBeGreaterThan(before);

    await user.click(
      screen.getByRole("button", { name: "Less weekday study" }),
    );
    expect(loadLifeContext().weekdayCapacityMins).toBe(before);
  });

  it("claims a day back entirely", async () => {
    const user = userEvent.setup();
    render();

    const daysOff = await screen.findByRole("group", { name: /days off/i });
    await user.click(within(daysOff).getByRole("button", { name: "Sun" }));

    expect(loadLifeContext().protectedDays).toEqual([0]);
  });

  it("imports pasted calendar text and reports what it found", async () => {
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByText(/Or paste calendar text/));
    /* Pasted rather than typed: an ICS document is line-oriented, and typing
       it would put the whole thing on one line, where there is no VEVENT to
       find — which is exactly what a student pasting a subscription feed
       would *not* be doing. */
    await user.click(screen.getByLabelText("Calendar text"));
    await user.paste(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "SUMMARY:Lecture",
        "DTSTART:20260901T090000",
        "DTEND:20260901T100000",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );
    await user.click(
      screen.getByRole("button", { name: /import pasted text/i }),
    );

    expect(loadLifeContext().importedIcs).toContain("BEGIN:VEVENT");
    expect(await screen.findByText(/Imported 1 event/)).toBeInTheDocument();
  });

  it("refuses text with no events instead of silently succeeding", async () => {
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByText(/Or paste calendar text/));
    await user.type(screen.getByLabelText("Calendar text"), "just some words");
    await user.click(
      screen.getByRole("button", { name: /import pasted text/i }),
    );

    expect(
      await screen.findByText(/no calendar events in it/i),
    ).toBeInTheDocument();
    expect(loadLifeContext().importedIcs).toBeNull();
  });

  it("previews the coming week and updates as the context changes", async () => {
    const user = userEvent.setup();
    render();

    expect(
      await screen.findByText(/What your next week looks like/),
    ).toBeInTheDocument();

    const daysOff = screen.getByRole("group", { name: /days off/i });
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      await user.click(within(daysOff).getByRole("button", { name: day }));
    }

    /* Every day protected means every day reads "Yours" — the preview is
       computed from the same engine the dashboard uses, not a mock-up. */
    expect(screen.getAllByText("Yours")).toHaveLength(7);
  });
});
