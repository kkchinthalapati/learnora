import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "../../test/render";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { useCreateModal } from "../../context/createModal";
import type { OpenCreateModalOptions } from "../../context/createModal";
import { Button } from "../Button";

function Harness({ initial }: { initial?: OpenCreateModalOptions }) {
  const { openCreateModal } = useCreateModal();
  return <Button onClick={() => openCreateModal(initial)}>Open create</Button>;
}

/* The Material panel navigates to whatever a run produced (Step 24), so the
   provider rendering it has to sit under a router — see test/render.tsx. */
function renderModal(ui: ReactNode) {
  return renderWithProviders(ui, undefined, { withRouter: true });
}

describe("CreateModal", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens on the Material panel by default", async () => {
    const user = userEvent.setup();
    renderModal(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open create" }));

    expect(screen.getByRole("dialog", { name: "Create study material" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Start from" })).toBeInTheDocument();
  });

  it("opens directly on the requested panel", async () => {
    const user = userEvent.setup();
    renderModal(<Harness initial={{ type: "task" }} />);
    await user.click(screen.getByRole("button", { name: "Open create" }));

    expect(screen.getByRole("dialog", { name: "New task" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Task" })).toBeInTheDocument();
  });

  it("switches panels via the type picker without closing the dialog", async () => {
    const user = userEvent.setup();
    renderModal(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open create" }));

    await user.click(screen.getByRole("radio", { name: "Subject" }));
    expect(screen.getByRole("dialog", { name: "New subject" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("resets to a fresh panel every time it's reopened", async () => {
    const user = userEvent.setup();
    renderModal(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open create" }));

    // Switch to Subject and type a name, then cancel.
    await user.click(screen.getByRole("radio", { name: "Subject" }));
    await user.type(screen.getByLabelText("Name"), "Half-typed name");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Reopen — should be back on Material, not Subject with stale text.
    await user.click(screen.getByRole("button", { name: "Open create" }));
    expect(screen.getByRole("dialog", { name: "Create study material" })).toBeInTheDocument();
  });
});

describe("SubjectPanel", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a name", async () => {
    const user = userEvent.setup();
    renderModal(<Harness initial={{ type: "subject" }} />);
    await user.click(screen.getByRole("button", { name: "Open create" }));

    await user.click(screen.getByRole("button", { name: "Create subject" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the subject a name");
  });

  it("creates a folder and closes on success", async () => {
    let capturedBody: Record<string, unknown>[] | undefined;
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/folders`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json(
          { id: "folder-1", ...capturedBody[0], created_at: "2026-01-01T00:00:00.000Z" },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderModal(<Harness initial={{ type: "subject" }} />);
    await user.click(screen.getByRole("button", { name: "Open create" }));
    await user.type(screen.getByLabelText("Name"), "Biology");
    await user.click(screen.getByRole("button", { name: "Create subject" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(capturedBody?.[0].name).toBe("Biology");
  });
});

describe("ExamPanel", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a past date", async () => {
    const user = userEvent.setup();
    renderModal(<Harness initial={{ type: "exam" }} />);
    await user.click(screen.getByRole("button", { name: "Open create" }));

    await user.type(screen.getByLabelText("Exam name"), "Midterm");
    const dateInput = screen.getByLabelText("Date") as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2020-01-01" } });
    await user.click(screen.getByRole("button", { name: "Add exam" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("can't be in the past");
  });

  it("creates an exam scoped to the user with status Scheduled", async () => {
    let capturedBody: Record<string, unknown>[] | undefined;
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/exams`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>[];
        return new HttpResponse(null, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderModal(<Harness initial={{ type: "exam" }} />);
    await user.click(screen.getByRole("button", { name: "Open create" }));

    await user.type(screen.getByLabelText("Exam name"), "Final");
    const dateInput = screen.getByLabelText("Date") as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2027-06-15" } });
    await user.click(screen.getByRole("button", { name: "Add exam" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(capturedBody).toEqual([
      {
        exam_name: "Final",
        exam_date: "2027-06-15",
        difficulty: "Medium",
        status: "Scheduled",
        user_id: "user-1",
      },
    ]);
  });
});

describe("TaskPanel", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires task text", async () => {
    const user = userEvent.setup();
    renderModal(<Harness initial={{ type: "task" }} />);
    await user.click(screen.getByRole("button", { name: "Open create" }));

    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Write down what you need to do",
    );
  });

  it("adds a task and closes on success", async () => {
    let capturedBody: Record<string, unknown>[] | undefined;
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/tasks`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>[];
        return new HttpResponse(null, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderModal(<Harness initial={{ type: "task" }} />);
    await user.click(screen.getByRole("button", { name: "Open create" }));
    await user.type(screen.getByRole("textbox", { name: "Task" }), "Read chapter 5");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(capturedBody?.[0].text).toBe("Read chapter 5");
  });
});
