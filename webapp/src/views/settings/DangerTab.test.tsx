import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { DangerTab } from "./DangerTab";

const WIPED_TABLES = [
  "tasks",
  "exams",
  "study_sessions",
  "weekly_plans",
  "quizzes",
];

function renderDanger(signOut = vi.fn().mockResolvedValue(undefined)) {
  return renderWithAuth(<DangerTab />, { session: fakeSession(), signOut });
}

async function confirmDialog(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name }));
}

describe("DangerTab", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not wipe anything when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.delete(`${SUPABASE_URL}/rest/v1/tasks`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDanger();

    await user.click(screen.getByRole("button", { name: /Wipe Data/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("This cannot be undone.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(called).toBe(false);
  });

  it("deletes every wiped table scoped to the signed-in user", async () => {
    const user = userEvent.setup();
    const deleted: Record<string, string | null> = {};
    server.use(
      ...WIPED_TABLES.map((table) =>
        http.delete(`${SUPABASE_URL}/rest/v1/${table}`, ({ request }) => {
          deleted[table] = new URL(request.url).searchParams.get("user_id");
          return new HttpResponse(null, { status: 204 });
        }),
      ),
    );
    renderDanger();

    await user.click(screen.getByRole("button", { name: /Wipe Data/ }));
    await confirmDialog(user, "Delete everything");

    await waitFor(() =>
      expect(Object.keys(deleted).sort()).toEqual([...WIPED_TABLES].sort()),
    );
    for (const table of WIPED_TABLES) {
      expect(deleted[table]).toBe("eq.user-1");
    }
    expect(
      await screen.findByText("All study data has been wiped."),
    ).toBeInTheDocument();
  });

  it("clears the local session history but leaves auth and theme keys alone", async () => {
    const user = userEvent.setup();
    localStorage.setItem("sessions", "[]");
    localStorage.setItem("fav_times", "[]");
    localStorage.setItem("learnora_accent", '"ocean"');
    renderDanger();

    await user.click(screen.getByRole("button", { name: /Wipe Data/ }));
    await confirmDialog(user, "Delete everything");

    await waitFor(() => expect(localStorage.getItem("sessions")).toBeNull());
    expect(localStorage.getItem("fav_times")).toBeNull();
    expect(localStorage.getItem("learnora_accent")).toBe('"ocean"');
  });

  it("reports a partial wipe failure instead of claiming success", async () => {
    const user = userEvent.setup();
    server.use(
      http.delete(`${SUPABASE_URL}/rest/v1/quizzes`, () =>
        HttpResponse.json({ message: "permission denied" }, { status: 403 }),
      ),
    );
    renderDanger();

    await user.click(screen.getByRole("button", { name: /Wipe Data/ }));
    await confirmDialog(user, "Delete everything");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some data could not be deleted.",
    );
  });

  it("requires both confirmations before deleting the account", async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/delete-account`, () => {
        called = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    renderDanger();

    await user.click(screen.getByRole("button", { name: /Delete Account/ }));
    await confirmDialog(user, "Yes, delete my account");

    // Second prompt — backing out here must still not delete anything.
    const second = await screen.findByRole("alertdialog");
    expect(second).toHaveTextContent("Last chance");
    await user.click(within(second).getByRole("button", { name: "Cancel" }));

    expect(called).toBe(false);
  });

  it("deletes the account and signs out after the second confirmation", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn().mockResolvedValue(undefined);
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/delete-account`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    vi.spyOn(
      await import("../../lib/supabase").then((m) => m.supabase.auth),
      "signOut",
    ).mockResolvedValue({ error: null } as Awaited<
      ReturnType<typeof import("../../lib/supabase").supabase.auth.signOut>
    >);
    renderDanger(signOut);

    await user.click(screen.getByRole("button", { name: /Delete Account/ }));
    await confirmDialog(user, "Yes, delete my account");
    await confirmDialog(user, "Delete forever");

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("surfaces the edge function's error message", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/delete-account`, () =>
        HttpResponse.json({ error: "Account is locked" }, { status: 400 }),
      ),
    );
    renderDanger();

    await user.click(screen.getByRole("button", { name: /Delete Account/ }));
    await confirmDialog(user, "Yes, delete my account");
    await confirmDialog(user, "Delete forever");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Account is locked",
    );
  });
});
