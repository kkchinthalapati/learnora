import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { createNextWeeklyDate, dateInDays, formatDueDate } from "../../lib/date";
import type { Task } from "../../api/types";
import { DashboardTasksWidget } from "./DashboardTasksWidget";
import { TasksView } from "./TasksView";

const REST = `${SUPABASE_URL}/rest/v1/tasks`;

function task(id: number, text: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    user_id: "user-1",
    text,
    is_done: false,
    due_date: null,
    ...overrides,
  } as Task;
}

function serveTasks(initial: Task[]) {
  const rowsById = new Map(initial.map((t) => [t.id, { ...t }]));
  server.use(
    http.get(REST, () => HttpResponse.json([...rowsById.values()])),
    http.patch(REST, async ({ request }) => {
      const id = Number(
        new URL(request.url).searchParams.get("id")?.replace("eq.", ""),
      );
      const row = rowsById.get(id);
      if (row) Object.assign(row, (await request.json()) as Partial<Task>);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return rowsById;
}

describe("DashboardTasksWidget", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("distinguishes 'nothing pending' from 'no tasks at all'", async () => {
    serveTasks([task(1, "Old thing", { is_done: true })]);
    const { unmount } = renderWithAuth(<DashboardTasksWidget />, {
      session: fakeSession(),
    });
    expect(
      await screen.findByText("All caught up — nothing pending. 🎉"),
    ).toBeInTheDocument();
    unmount();

    serveTasks([]);
    renderWithAuth(<DashboardTasksWidget />, { session: fakeSession() });
    expect(
      await screen.findByText("No tasks yet. Add your first above."),
    ).toBeInTheDocument();
  });

  it("shows only pending tasks, most urgent first, capped at six", async () => {
    serveTasks([
      ...Array.from({ length: 8 }, (_, i) => task(i + 1, `Task ${i + 1}`)),
      task(99, "Finished", { is_done: true }),
      task(100, "Urgent", { due_date: "2026-01-01" }),
    ]);
    renderWithAuth(<DashboardTasksWidget />, { session: fakeSession() });

    await screen.findByText("Urgent");
    const items = screen.getAllByRole("checkbox");
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveAccessibleName("Urgent");
    expect(screen.queryByText("Finished")).toBeNull();
  });

  it("quick-adds without a due date", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown>[] | undefined;
    serveTasks([]);
    server.use(
      http.post(REST, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json(null, { status: 201 });
      }),
    );
    renderWithAuth(<DashboardTasksWidget />, { session: fakeSession() });
    await screen.findByText("No tasks yet. Add your first above.");

    const input = screen.getByRole("textbox", { name: "Quick add task" });
    await user.type(input, "Quick one{Enter}");

    await waitFor(() => expect(body).toBeDefined());
    expect(body![0]).toMatchObject({ text: "Quick one", due_date: null });
    expect(input).toHaveValue("");
  });

  it("ignores an empty quick-add", async () => {
    const user = userEvent.setup();
    let posted = false;
    serveTasks([]);
    server.use(
      http.post(REST, () => {
        posted = true;
        return HttpResponse.json(null, { status: 201 });
      }),
    );
    renderWithAuth(<DashboardTasksWidget />, { session: fakeSession() });
    await screen.findByText("No tasks yet. Add your first above.");

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(posted).toBe(false);
  });

  it("completing a task in the widget updates the full list too", async () => {
    /* One TanStack query with two subscribers replaces the vanilla's
       `tasksUpdated` window event and its "loadTasks() re-renders both"
       coupling (js/main.js:2658-2659). */
    const user = userEvent.setup();
    serveTasks([task(1, "Shared task")]);
    renderWithAuth(
      <>
        <DashboardTasksWidget />
        <TasksView />
      </>,
      { session: fakeSession() },
    );

    await waitFor(() =>
      expect(screen.getAllByText("Shared task")).toHaveLength(2),
    );

    await user.click(screen.getAllByRole("checkbox")[0]);

    // Widget shows only pending work, so the row leaves it entirely...
    await waitFor(() =>
      expect(
        screen.getByText("All caught up — nothing pending. 🎉"),
      ).toBeInTheDocument(),
    );
    // ...while the full list keeps it, now checked.
    expect(
      screen.getByRole("checkbox", { name: "Shared task", checked: true }),
    ).toBeInTheDocument();
  });

  it("snoozes a task to tomorrow using the quick button in the widget", async () => {
    const user = userEvent.setup();
    let patched: Record<string, unknown> | undefined;
    serveTasks([task(1, "Study history")]);
    server.use(
      http.patch(REST, async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithAuth(<DashboardTasksWidget />, { session: fakeSession() });
    await screen.findByText("Study history");

    const tomorrowBtn = screen.getByRole("button", { name: "Tomorrow" });
    await user.click(tomorrowBtn);

    await waitFor(() =>
      expect(patched).toEqual({ due_date: dateInDays(1) }),
    );
  });

  it("snoozes a task to next week using the quick button in the widget", async () => {
    const user = userEvent.setup();
    let patched: Record<string, unknown> | undefined;
    serveTasks([task(1, "Study history")]);
    server.use(
      http.patch(REST, async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithAuth(<DashboardTasksWidget />, { session: fakeSession() });
    await screen.findByText("Study history");

    const nextWeekBtn = screen.getByRole("button", { name: "Next week" });
    await user.click(nextWeekBtn);

    await waitFor(() =>
      expect(patched).toEqual({ due_date: dateInDays(7) }),
    );
  });

  it("spawns next weekly recurrence when completing a recurring task from the widget", async () => {
    const user = userEvent.setup();
    let postedBody: Record<string, unknown>[] | undefined;
    serveTasks([
      task(1, "Weekly problem set [🔁 Weekly]", {
        due_date: "2026-08-20",
      }),
    ]);
    server.use(
      http.post(REST, async ({ request }) => {
        postedBody = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json(null, { status: 201 });
      }),
    );
    renderWithAuth(<DashboardTasksWidget />, { session: fakeSession() });

    const checkbox = await screen.findByRole("checkbox", {
      name: "Weekly problem set [🔁 Weekly]",
    });
    await user.click(checkbox);

    const nextDueDate = createNextWeeklyDate("2026-08-20");
    await waitFor(() => expect(postedBody).toBeDefined());
    expect(postedBody![0]).toMatchObject({
      text: "Weekly problem set [🔁 Weekly]",
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

