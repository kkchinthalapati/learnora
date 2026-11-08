import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import type { Folder, Material } from "../../api/types";
import { LessonActions, PutInSubjectButton } from "./LessonActions";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    user_id: "user-1",
    name: "Biology",
    color: "#4A90E2",
    created_at: "2026-03-04T00:00:00.000Z",
    ...overrides,
  };
}

/* The case F-01 was about: a lesson made from Home's topic box, so it has
   no subject and no stored file. */
function lesson(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat-1",
    user_id: "user-1",
    folder_id: null,
    title: "i want to learn photosynthesis",
    type: "text",
    raw_content: "photosynthesis",
    storage_path: null,
    created_at: "2026-11-07T00:00:00.000Z",
    ...overrides,
  };
}

type Patch = {
  table: string;
  filters: Record<string, string>;
  body: Record<string, unknown>;
};

function recordPatches(): Patch[] {
  const patches: Patch[] = [];
  for (const table of ["materials", "quizzes", "flashcard_decks"]) {
    server.use(
      http.patch(rest(table), async ({ request }) => {
        const url = new URL(request.url);
        patches.push({
          table,
          filters: Object.fromEntries(url.searchParams.entries()),
          body: (await request.json()) as Record<string, unknown>,
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );
  }
  return patches;
}

function render(ui: React.ReactNode) {
  return renderWithAuth(
    ui,
    { session: fakeSession() },
    { initialEntries: ["/"] },
  );
}

describe("LessonActions", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("files a lesson with no subject under one, taking its quizzes and card sets along", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(rest("folders"), () =>
        HttpResponse.json([
          folder(),
          folder({ id: "folder-2", name: "Maths" }),
        ]),
      ),
    );
    const patches = recordPatches();
    render(<LessonActions lesson={lesson()} />);

    await user.click(screen.getByRole("button", { name: "Put in a subject" }));
    const select = await screen.findByLabelText("Subject");
    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();

    await user.selectOptions(select, "folder-1");
    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(await screen.findByText("Moved to Biology.")).toBeInTheDocument();
    expect(patches).toEqual([
      {
        table: "materials",
        filters: { id: "eq.mat-1", user_id: "eq.user-1" },
        body: { folder_id: "folder-1" },
      },
      {
        table: "quizzes",
        filters: { material_id: "eq.mat-1", user_id: "eq.user-1" },
        body: { folder_id: "folder-1" },
      },
      /* Audit F-16: the card sets made from it go too. */
      {
        table: "flashcard_decks",
        filters: { material_id: "eq.mat-1", user_id: "eq.user-1" },
        body: { folder_id: "folder-1" },
      },
    ]);
    await waitFor(() =>
      expect(screen.queryByLabelText("Subject")).not.toBeInTheDocument(),
    );
  });

  it("can take a filed lesson back out of its subject", async () => {
    const user = userEvent.setup();
    server.use(http.get(rest("folders"), () => HttpResponse.json([folder()])));
    const patches = recordPatches();
    render(<LessonActions lesson={lesson({ folder_id: "folder-1" })} />);

    await user.click(
      screen.getByRole("button", { name: "Move to another subject" }),
    );
    await user.selectOptions(await screen.findByLabelText("Subject"), "");
    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(
      await screen.findByText("Taken out of its subject."),
    ).toBeInTheDocument();
    expect(patches[0].body).toEqual({ folder_id: null });
  });

  it("says how to get a subject when there are none, instead of an empty picker", async () => {
    const user = userEvent.setup();
    server.use(http.get(rest("folders"), () => HttpResponse.json([])));
    render(<PutInSubjectButton lesson={lesson()} />);

    await user.click(
      screen.getByRole("button", { name: "Put this lesson in a subject" }),
    );

    expect(
      await screen.findByRole("link", { name: "Make one" }),
    ).toHaveAttribute("href", "/subjects");
    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();
  });

  it("shows an error and keeps the dialog open when the move fails", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(rest("folders"), () => HttpResponse.json([folder()])),
      http.patch(rest("materials"), () =>
        HttpResponse.json({ message: "nope" }, { status: 403 }),
      ),
    );
    render(<LessonActions lesson={lesson()} />);

    await user.click(screen.getByRole("button", { name: "Put in a subject" }));
    await user.selectOptions(
      await screen.findByLabelText("Subject"),
      "folder-1",
    );
    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't move this lesson",
    );
    expect(screen.getByLabelText("Subject")).toBeInTheDocument();
  });

  it("renames a lesson", async () => {
    const user = userEvent.setup();
    const patches = recordPatches();
    render(<LessonActions lesson={lesson()} />);

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.type(input, "Photosynthesis");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(patches).toEqual([
        {
          table: "materials",
          filters: { id: "eq.mat-1", user_id: "eq.user-1" },
          body: { title: "Photosynthesis" },
        },
      ]),
    );
  });

  it("deletes a lesson after confirming, then reports it gone", async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(
      http.delete(rest("materials"), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onDeleted = vi.fn();
    render(<LessonActions lesson={lesson()} onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: "Delete lesson" }));
    expect(
      screen.getByText(
        /will be permanently deleted, along with its notes and quizzes/,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText('Deleted "i want to learn photosynthesis".'),
    ).toBeInTheDocument();
    expect(deleted).toBe(true);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("keeps the lesson when the delete is cancelled", async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(
      http.delete(rest("materials"), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onDeleted = vi.fn();
    render(<LessonActions lesson={lesson()} onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: "Delete lesson" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleted).toBe(false);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
