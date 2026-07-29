import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { localDateStr } from "../../lib/date";
import type { Exam } from "../../api/types";
import { ExamModal } from "./ExamModal";

const REST = `${SUPABASE_URL}/rest/v1/exams`;

/* Rendered directly rather than reached through the calendar: the date rules
 * are the interesting part and driving them through a month grid would make
 * them depend on what today happens to be. */

const TODAY = localDateStr();
const FUTURE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return localDateStr(d);
})();

function existingExam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: 7,
    user_id: "user-1",
    exam_name: "Physics Final",
    exam_date: "2020-01-15", // deliberately in the past
    difficulty: "Hard",
    status: "Scheduled",
    ...overrides,
  };
}

function renderModal(props: {
  exam?: Exam | null;
  initialDate?: string;
  onClose?: () => void;
}) {
  const onClose = props.onClose ?? vi.fn();
  const result = renderWithAuth(
    <ExamModal
      open
      exam={props.exam ?? null}
      initialDate={props.initialDate}
      onClose={onClose}
    />,
    { session: fakeSession() },
  );
  return { ...result, onClose };
}

describe("ExamModal", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creating shows no status field and no delete button", () => {
    renderModal({ initialDate: FUTURE });

    expect(screen.getByText("New exam")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add exam" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("editing prefills every field and offers status and delete", () => {
    renderModal({ exam: existingExam() });

    expect(screen.getByText("Edit exam")).toBeInTheDocument();
    expect(screen.getByLabelText("What's the exam?")).toHaveValue(
      "Physics Final",
    );
    expect(screen.getByLabelText("When is it?")).toHaveValue("2020-01-15");
    expect(screen.getByRole("radio", { name: "Hard" })).toBeChecked();
    expect(screen.getByLabelText("Status")).toHaveValue("Scheduled");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
  });

  it("defaults a new exam to Medium difficulty", () => {
    renderModal({ initialDate: FUTURE });
    expect(screen.getByRole("radio", { name: "Medium" })).toBeChecked();
  });

  it("only lets a new exam be dated from today onwards", () => {
    renderModal({ initialDate: FUTURE });
    expect(screen.getByLabelText("When is it?")).toHaveAttribute("min", TODAY);
  });

  it("drops the min for an existing exam, which may legitimately be past", () => {
    renderModal({ exam: existingExam() });
    expect(screen.getByLabelText("When is it?")).not.toHaveAttribute("min");
  });

  it("refuses to create an exam dated in the past", async () => {
    const user = userEvent.setup();
    let posted = false;
    server.use(
      http.post(REST, () => {
        posted = true;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const { onClose } = renderModal({ initialDate: FUTURE });

    await user.type(screen.getByLabelText("What's the exam?"), "Nope");
    await user.clear(screen.getByLabelText("When is it?"));
    await user.type(screen.getByLabelText("When is it?"), "2020-01-01");
    await user.click(screen.getByRole("button", { name: "Add exam" }));

    expect(
      await screen.findByText("Exam date can't be in the past."),
    ).toBeVisible();
    expect(posted).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("saves an existing exam even though its date is in the past", async () => {
    const user = userEvent.setup();
    let patched: Record<string, unknown> | undefined;
    let patchedId: string | null = null;
    server.use(
      http.patch(REST, async ({ request }) => {
        patchedId = new URL(request.url).searchParams.get("id");
        patched = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { onClose } = renderModal({ exam: existingExam() });

    await user.selectOptions(screen.getByLabelText("Status"), "Completed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(patched).toBeDefined());
    expect(patchedId).toBe("eq.7");
    expect(patched).toMatchObject({
      exam_name: "Physics Final",
      exam_date: "2020-01-15",
      difficulty: "Hard",
      status: "Completed",
      user_id: "user-1",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("always files a new exam as Scheduled", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown>[] | undefined;
    server.use(
      http.post(REST, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>[];
        return new HttpResponse(null, { status: 201 });
      }),
    );
    renderModal({ initialDate: FUTURE });

    await user.type(screen.getByLabelText("What's the exam?"), "Biology Final");
    await user.click(screen.getByText("Hard"));
    await user.click(screen.getByRole("button", { name: "Add exam" }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body![0]).toMatchObject({
      exam_name: "Biology Final",
      exam_date: FUTURE,
      difficulty: "Hard",
      status: "Scheduled",
      user_id: "user-1",
    });
  });

  it("reports a save failure and stays open", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(REST, () =>
        HttpResponse.json({ message: "row level security" }, { status: 403 }),
      ),
    );
    const { onClose } = renderModal({ initialDate: FUTURE });

    await user.type(screen.getByLabelText("What's the exam?"), "Doomed");
    await user.click(screen.getByRole("button", { name: "Add exam" }));

    expect(await screen.findByText(/row level security/)).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("deletes only after the confirmation is accepted", async () => {
    const user = userEvent.setup();
    let deletedId: string | null = null;
    server.use(
      http.delete(REST, ({ request }) => {
        deletedId = new URL(request.url).searchParams.get("id");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { onClose } = renderModal({ exam: existingExam() });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirmBox = await screen.findByRole("alertdialog");
    expect(confirmBox).toHaveTextContent("removed from your calendar");
    await user.click(
      within(confirmBox).getByRole("button", { name: "Cancel" }),
    );
    expect(deletedId).toBeNull();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Remove",
      }),
    );

    await waitFor(() => expect(deletedId).toBe("eq.7"));
    expect(onClose).toHaveBeenCalled();
  });

  it("caps the date five years out", () => {
    renderModal({ initialDate: FUTURE });
    const max = screen
      .getByLabelText("When is it?")
      .getAttribute("max")!
      .slice(0, 4);
    expect(Number(max)).toBe(new Date().getFullYear() + 5);
  });

  it("closes on Cancel without saving", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({ initialDate: FUTURE });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
