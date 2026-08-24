import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { formatDueDate, localDateStr, dateInDays, createNextWeeklyDate } from "../../lib/date";
import type { Task } from "../../api/types";
import { TasksView } from "./TasksView";
import { DOUBLE_CLICK_MS } from "./TaskItem";
import { DEFERRED_DELETE_WINDOW_MS } from "../../hooks/useDeferredDelete";

const REST = `${SUPABASE_URL}/rest/v1/tasks`;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    user_id: "user-1",
    text: "Read chapter 4",
    is_done: false,
    due_date: null,
    ...overrides,
  } as Task;
}

/* A stateful stand-in for the tasks table. A static GET handler would undo
 * every optimistic update the moment TanStack refetched, so writes have to be
 * reflected back the way the real backend reflects them. */
function serveTasks(initial: Task[]) {
  const rowsById = new Map(initial.map((t) => [t.id, { ...t }]));
  const idOf = (request: Request) =>
    Number(new URL(request.url).searchParams.get("id")?.replace("eq.", ""));

  server.use(
    http.get(REST, () => HttpResponse.json([...rowsById.values()])),
    http.patch(REST, async ({ request }) => {
      const patch = (await request.json()) as Partial<Task>;
      const row = rowsById.get(idOf(request));
      if (row) Object.assign(row, patch);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(REST, ({ request }) => {
      rowsById.delete(idOf(request));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return rowsById;
}

function renderTasks() {
  return renderWithAuth(<TasksView />, { session: fakeSession() });
}

const rows = () => screen.getAllByRole("checkbox");

describe("TasksView", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    /* Unconditional, so a test that fails before its own cleanup cannot leave
       fake timers installed for the next one. */
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the empty state when there are no tasks", async () => {
    serveTasks([]);
    renderTasks();

    expect(
      await screen.findByText("No tasks yet - add one above!"),
    ).toBeInTheDocument();
  });

  it("lists tasks, urgent first and completed last", async () => {
    serveTasks([
      task({ id: 1, text: "No due date" }),
      task({ id: 2, text: "Done already", is_done: true }),
      task({ id: 3, text: "Due later", due_date: "2026-09-01" }),
      task({ id: 4, text: "Due soon", due_date: "2026-08-01" }),
    ]);
    renderTasks();

    await screen.findByLabelText("Due soon");
    expect(rows().map((r) => r.getAttribute("aria-label"))).toEqual([
      "Due soon",
      "Due later",
      "No due date",
      "Done already",
    ]);
  });

  it("reflects completion state on the row's checkbox role", async () => {
    serveTasks([task({ id: 1, is_done: true })]);
    renderTasks();

    expect(
      await screen.findByRole("checkbox", { checked: true }),
    ).toBeVisible();
  });

  it("refuses an empty submit without calling the API", async () => {
    const user = userEvent.setup();
    let posted = false;
    serveTasks([]);
    server.use(
      http.post(REST, () => {
        posted = true;
        return HttpResponse.json(null, { status: 201 });
      }),
    );
    renderTasks();
    await screen.findByText("No tasks yet - add one above!");

    await user.click(screen.getByRole("button", { name: "Add Task" }));

    expect(posted).toBe(false);
  });

  it("adds a task with its optional due date and clears both fields", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown>[] | undefined;
    serveTasks([]);
    server.use(
      http.post(REST, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json(null, { status: 201 });
      }),
    );
    renderTasks();
    await screen.findByText("No tasks yet - add one above!");

    const input = screen.getByRole("textbox", { name: "New Task Input" });
    await user.type(input, "Write essay");
    const due = screen.getByLabelText(/Due date/);
    await user.type(due, "2026-08-20");
    await user.click(screen.getByRole("button", { name: "Add Task" }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body![0]).toMatchObject({
      text: "Write essay",
      is_done: false,
      due_date: "2026-08-20",
      user_id: "user-1",
    });
    expect(input).toHaveValue("");
    expect(due).toHaveValue("");
  });

  it("sends a null due date when the field is left blank", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown>[] | undefined;
    serveTasks([]);
    server.use(
      http.post(REST, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json(null, { status: 201 });
      }),
    );
    renderTasks();
    await screen.findByText("No tasks yet - add one above!");

    await user.type(
      screen.getByRole("textbox", { name: "New Task Input" }),
      "Just do it{Enter}",
    );

    await waitFor(() => expect(body).toBeDefined());
    expect(body![0].due_date).toBeNull();
  });

  it("toggles a task optimistically, before the write resolves", async () => {
    const user = userEvent.setup();
    serveTasks([task({ id: 1, text: "Read chapter 4" })]);
    let resolve!: () => void;
    server.use(
      http.patch(REST, async () => {
        await new Promise<void>((r) => {
          resolve = r;
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTasks();
    const row = await screen.findByRole("checkbox", { name: "Read chapter 4" });

    await user.click(row);

    // Already struck through while the PATCH is still in flight.
    expect(
      screen.getByRole("checkbox", { name: "Read chapter 4" }),
    ).toBeChecked();
    resolve();
  });

  it("rolls the toggle back when the write fails", async () => {
    const user = userEvent.setup();
    serveTasks([task({ id: 1, text: "Read chapter 4" })]);
    server.use(
      http.patch(REST, () =>
        HttpResponse.json({ message: "nope" }, { status: 500 }),
      ),
    );
    renderTasks();
    const row = await screen.findByRole("checkbox", { name: "Read chapter 4" });

    await user.click(row);

    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Read chapter 4" }),
      ).not.toBeChecked(),
    );
  });

  it("toggles from the keyboard", async () => {
    const user = userEvent.setup();
    serveTasks([task({ id: 1, text: "Read chapter 4" })]);
    renderTasks();
    const row = await screen.findByRole("checkbox", { name: "Read chapter 4" });

    row.focus();
    await user.keyboard(" ");

    expect(
      screen.getByRole("checkbox", { name: "Read chapter 4" }),
    ).toBeChecked();
  });

  it("renames a task on double-click and Enter", async () => {
    const user = userEvent.setup();
    let patched: Record<string, unknown> | undefined;
    serveTasks([task({ id: 1, text: "Read chapter 4" })]);
    server.use(
      http.patch(REST, async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTasks();
    await screen.findByText("Read chapter 4");

    await user.dblClick(screen.getByText("Read chapter 4"));
    const editor = screen.getByRole("textbox", { name: "Edit task text" });
    await user.clear(editor);
    await user.type(editor, "Read chapter 5{Enter}");

    await waitFor(() => expect(patched).toEqual({ text: "Read chapter 5" }));
  });

  it("abandons a rename on Escape", async () => {
    const user = userEvent.setup();
    let patched = false;
    serveTasks([task({ id: 1, text: "Read chapter 4" })]);
    server.use(
      http.patch(REST, () => {
        patched = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTasks();
    await screen.findByText("Read chapter 4");

    await user.dblClick(screen.getByText("Read chapter 4"));
    await user.type(
      screen.getByRole("textbox", { name: "Edit task text" }),
      " and 5{Escape}",
    );

    expect(screen.getByText("Read chapter 4")).toBeInTheDocument();
    expect(patched).toBe(false);
  });

  it("does not open the rename editor on a completed task", async () => {
    const user = userEvent.setup();
    serveTasks([task({ id: 1, text: "Read chapter 4", is_done: true })]);
    renderTasks();

    await user.dblClick(await screen.findByText("Read chapter 4"));

    expect(
      screen.queryByRole("textbox", { name: "Edit task text" }),
    ).toBeNull();
  });

  it("does not toggle the task when the text is double-clicked to rename", async () => {
    /* The vanilla ran the row's click handler twice on the way to dblclick,
       so opening the rename editor also flipped the task's done state. */
    const user = userEvent.setup();
    let patches = 0;
    const rowsById = serveTasks([task({ id: 1, text: "Read chapter 4" })]);
    server.use(
      http.patch(REST, async ({ request }) => {
        patches++;
        Object.assign(
          rowsById.get(1)!,
          (await request.json()) as Partial<Task>,
        );
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTasks();

    await user.dblClick(await screen.findByText("Read chapter 4"));
    expect(
      screen.getByRole("textbox", { name: "Edit task text" }),
    ).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, DOUBLE_CLICK_MS + 50));
    expect(patches).toBe(0);
    expect(rowsById.get(1)!.is_done).toBe(false);
  });

  it("marks an overdue due date differently from one due today", async () => {
    serveTasks([
      task({ id: 1, text: "Overdue", due_date: "2020-01-01" }),
      task({ id: 2, text: "Today", due_date: localDateStr() }),
    ]);
    renderTasks();

    /* The badge reads "Due Wed, Jan 1" / "Due Today" now rather than the raw
       column value — see lib/date's formatDueDate. */
    const overdue = await screen.findByRole("button", {
      name: new RegExp(`Due ${formatDueDate("2020-01-01")}`),
    });
    const today = screen.getByRole("button", { name: /Due Today/ });
    expect(overdue.className).not.toEqual(today.className);
  });

  it("labels due dates the way a student reads them, not as raw column values", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    serveTasks([
      task({ id: 1, text: "Due today", due_date: localDateStr() }),
      task({ id: 2, text: "Due tomorrow", due_date: localDateStr(tomorrow) }),
    ]);
    renderTasks();

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    expect(screen.queryByText(localDateStr())).not.toBeInTheDocument();
  });

  it("sets a due date from the row's badge", async () => {
    const user = userEvent.setup();
    let patched: Record<string, unknown> | undefined;
    serveTasks([task({ id: 1, text: "Read chapter 4" })]);
    server.use(
      http.patch(REST, async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTasks();

    await user.click(
      await screen.findByRole("button", { name: "Set a due date" }),
    );
    await user.type(screen.getByLabelText("Due date"), "2026-08-20");

    await waitFor(() => expect(patched).toEqual({ due_date: "2026-08-20" }));
  });

  it("hides a deleted task immediately and offers Undo", async () => {
    const user = userEvent.setup();
    serveTasks([task({ id: 1, text: "Read chapter 4" })]);
    renderTasks();

    await user.click(
      await screen.findByRole("button", {
        name: "Delete task: Read chapter 4",
      }),
    );

    expect(screen.queryByText("Read chapter 4")).toBeNull();
    const toast = await screen.findByText("Task deleted.");
    expect(
      within(toast.closest("[role]") ?? toast).getByRole("button", {
        name: "Undo",
      }),
    ).toBeInTheDocument();
  });

  it("waits out the undo window before deleting, and Undo cancels it", async () => {
    /* Real timers here. Faking them deadlocks the in-flight MSW request, and
       `shouldAdvanceTime` fixes that only by burning real time on an interval,
       which slowed the whole suite enough to time out unrelated files. The
       undo window is 4s, so this test simply waits it out. */
    const user = userEvent.setup();
    let deleted = false;
    serveTasks([task({ id: 1, text: "Read chapter 4" })]);
    server.use(
      http.delete(REST, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTasks();

    await user.click(
      await screen.findByRole("button", {
        name: "Delete task: Read chapter 4",
      }),
    );
    expect(screen.queryByText("Read chapter 4")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Read chapter 4")).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, DEFERRED_DELETE_WINDOW_MS + 500));
    expect(deleted).toBe(false);
  }, 15000);

  it("issues the DELETE once the undo window closes", async () => {
    const user = userEvent.setup();
    let deletedId: string | null = null;
    serveTasks([task({ id: 1, text: "Read chapter 4" })]);
    server.use(
      http.delete(REST, ({ request }) => {
        deletedId = new URL(request.url).searchParams.get("id");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTasks();

    await user.click(
      await screen.findByRole("button", {
        name: "Delete task: Read chapter 4",
      }),
    );
    await waitFor(() => expect(deletedId).toBe("eq.1"), {
      timeout: DEFERRED_DELETE_WINDOW_MS + 2000,
    });
  }, 15000);

  it("surfaces a load failure instead of rendering an empty list", async () => {
    server.use(
      http.get(REST, () =>
        HttpResponse.json({ message: "permission denied" }, { status: 403 }),
      ),
    );
    renderTasks();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "permission denied",
    );
  });

  describe("Quick snooze and recurrence actions", () => {
    it("pre-fills due date using quick action pills (Today, Tomorrow, Next week)", async () => {
      const user = userEvent.setup();
      serveTasks([]);
      renderTasks();
      await screen.findByText("No tasks yet - add one above!");

      const dueInput = screen.getByLabelText(/Due date/);

      await user.click(screen.getByRole("button", { name: "Today" }));
      expect(dueInput).toHaveValue(localDateStr());

      await user.click(screen.getByRole("button", { name: "Tomorrow" }));
      expect(dueInput).toHaveValue(dateInDays(1));

      await user.click(screen.getByRole("button", { name: "Next week" }));
      expect(dueInput).toHaveValue(dateInDays(7));
    });

    it("adds a recurring weekly task when Repeat weekly pill is toggled", async () => {
      const user = userEvent.setup();
      let body: Record<string, unknown>[] | undefined;
      serveTasks([]);
      server.use(
        http.post(REST, async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>[];
          return HttpResponse.json(null, { status: 201 });
        }),
      );
      renderTasks();
      await screen.findByText("No tasks yet - add one above!");

      await user.type(
        screen.getByRole("textbox", { name: "New Task Input" }),
        "Review biology",
      );
      await user.click(
        screen.getByRole("button", { name: "🔁 Repeat weekly" }),
      );
      await user.click(screen.getByRole("button", { name: "Add Task" }));

      await waitFor(() => expect(body).toBeDefined());
      expect(body![0]).toMatchObject({
        text: "Review biology [🔁 Weekly]",
        due_date: null,
      });
    });

    it("displays 🔁 Weekly badge and clean title for recurring task", async () => {
      serveTasks([
        task({ id: 1, text: "Chemistry practice [🔁 Weekly]" }),
      ]);
      renderTasks();

      expect(
        await screen.findByText("Chemistry practice"),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Recurring weekly"),
      ).toBeInTheDocument();
    });

    it("snoozes a task to tomorrow from task item quick button", async () => {
      const user = userEvent.setup();
      let patched: Record<string, unknown> | undefined;
      serveTasks([task({ id: 1, text: "Math assignment" })]);
      server.use(
        http.patch(REST, async ({ request }) => {
          patched = (await request.json()) as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderTasks();

      const row = await screen.findByRole("checkbox", {
        name: "Math assignment",
      });
      const tomorrowBtn = within(row).getByRole("button", {
        name: "Tomorrow",
      });
      await user.click(tomorrowBtn);

      await waitFor(() =>
        expect(patched).toEqual({ due_date: dateInDays(1) }),
      );
    });

    it("snoozes a task to next week from task item quick button", async () => {
      const user = userEvent.setup();
      let patched: Record<string, unknown> | undefined;
      serveTasks([task({ id: 1, text: "Math assignment" })]);
      server.use(
        http.patch(REST, async ({ request }) => {
          patched = (await request.json()) as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderTasks();

      const row = await screen.findByRole("checkbox", {
        name: "Math assignment",
      });
      const nextWeekBtn = within(row).getByRole("button", {
        name: "Next week",
      });
      await user.click(nextWeekBtn);

      await waitFor(() =>
        expect(patched).toEqual({ due_date: dateInDays(7) }),
      );
    });

    it("toggles weekly recurrence from task item Repeat weekly button", async () => {
      const user = userEvent.setup();
      let patched: Record<string, unknown> | undefined;
      serveTasks([task({ id: 1, text: "Physics lab" })]);
      server.use(
        http.patch(REST, async ({ request }) => {
          patched = (await request.json()) as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderTasks();

      const row = await screen.findByRole("checkbox", {
        name: "Physics lab",
      });
      const repeatBtn = within(row).getByRole("button", {
        name: "Repeat weekly",
      });
      await user.click(repeatBtn);

      await waitFor(() =>
        expect(patched).toEqual({ text: "Physics lab [🔁 Weekly]" }),
      );
    });

    it("automatically creates the next occurrence when completing a recurring weekly task", async () => {
      const user = userEvent.setup();
      let postedBody: Record<string, unknown>[] | undefined;
      serveTasks([
        task({
          id: 1,
          text: "Weekly quiz [🔁 Weekly]",
          due_date: "2026-08-20",
          is_done: false,
        }),
      ]);
      server.use(
        http.post(REST, async ({ request }) => {
          postedBody = (await request.json()) as Record<string, unknown>[];
          return HttpResponse.json(null, { status: 201 });
        }),
      );
      renderTasks();

      const row = await screen.findByRole("checkbox", {
        name: "Weekly quiz [🔁 Weekly]",
      });
      await user.click(row);

      const nextDueDate = createNextWeeklyDate("2026-08-20");
      await waitFor(() => expect(postedBody).toBeDefined());
      expect(postedBody![0]).toMatchObject({
        text: "Weekly quiz [🔁 Weekly]",
        due_date: nextDueDate,
      });

      const formatted = formatDueDate(nextDueDate);
      expect(
        await screen.findByText(
          `Scheduled next weekly task for ${formatted}`,
        ),
      ).toBeInTheDocument();
    });
  });
});

