import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../test/render";
import { mockAuthSession } from "../../test/mockSession";
import type { Folder, Material } from "../../api/types";

/* A subject as a path (Phase 5): its lessons in the student's order, the
 * next one marked, and each movable. The data hook and the row list are
 * stubbed; the row stub draws what SubjectView hands each row. */

const folders: Folder[] = [{ id: "f-bio", user_id: "u", name: "Biology", color: "#4A90E2", created_at: "" }];
const lesson = (id: string, title: string, created: string, position?: number | null): Material => ({
  id,
  user_id: "u",
  folder_id: "f-bio",
  title,
  type: "text",
  raw_content: null,
  storage_path: null,
  created_at: created,
  position,
});

const data = {
  today: "2026-10-15",
  folders,
  lessons: [] as Material[],
  progress: new Map<string, { total: number; practised: number }>(),
  exams: [],
  plan: null,
  weekBlocks: [],
  weekSource: "schedule" as const,
  isPending: false,
  isError: false,
  planPending: false,
  retry: vi.fn(),
};

const mutate = vi.fn();
const order = vi.hoisted(() => ({ supported: true }));
vi.mock("./useSubjectsData", () => ({ useSubjectsData: () => data }));
vi.mock("../../hooks/useMaterials", () => ({
  useSetLessonOrder: () => ({ mutate, isPending: false }),
}));
vi.mock("../../api/materials", () => ({ isOrderSupported: () => order.supported }));
vi.mock("../../hooks/useDecks", () => ({ useAllDecks: () => ({ data: [] }) }));
const readiness = vi.hoisted(() => ({ tier: "Getting there" as string }));
vi.mock("../../hooks/useExamReadiness", () => ({
  useExamReadiness: () => ({ readiness: { tier: readiness.tier }, roadmap: [], isPending: false }),
}));
vi.mock("../library/useLibraryActions", () => ({
  useLibraryActions: () => ({ rename: vi.fn(), removeFolder: vi.fn() }),
}));
vi.mock("../../hooks/useQuizzes", () => ({ useQuizzes: () => ({ data: [] }) }));
vi.mock("../../hooks/useFlashcards", () => ({ useAllDueFlashcards: () => ({ data: [] }) }));
vi.mock("../../hooks/useNotebooks", () => ({ useNotebooks: () => ({ notebooks: [] }) }));
vi.mock("../../hooks/useMisconceptions", () => ({
  useMisconceptions: () => ({ forSubject: () => [], all: [] }),
}));
vi.mock("../lesson/LessonRows", () => ({
  LessonRows: ({
    lessons,
    label,
    rowExtras,
  }: {
    lessons: Material[];
    label: string;
    rowExtras?: (m: Material, i: number) => { note?: string; controls?: ReactNode };
  }) => (
    <ol aria-label={label}>
      {lessons.map((m, i) => {
        const extras = rowExtras?.(m, i);
        return (
          <li key={m.id}>
            <span>{m.title}</span>
            {extras?.note ? <em>{extras.note}</em> : null}
            {extras?.controls}
          </li>
        );
      })}
    </ol>
  ),
}));

const { SubjectView } = await import("./SubjectView");

function renderSubject() {
  return renderWithProviders(
    <Routes>
      <Route path="/subjects/:folderId" element={<SubjectView />} />
    </Routes>,
    undefined,
    { initialEntries: ["/subjects/f-bio"] },
  );
}

const rows = () => within(screen.getByRole("list", { name: "Lessons in Biology" })).getAllByRole("listitem");
const titles = () => rows().map((li) => li.querySelector("span")?.textContent);

describe("SubjectView as a path", () => {
  beforeEach(() => {
    mockAuthSession();
    mutate.mockClear();
    order.supported = true;
    data.progress = new Map();
    data.lessons = [
      lesson("m-3", "Respiration", "2026-10-03T00:00:00Z"),
      lesson("m-1", "Cells", "2026-10-01T00:00:00Z"),
      lesson("m-2", "Enzymes", "2026-10-02T00:00:00Z"),
    ];
  });

  it("lists lessons oldest first until the student orders them", () => {
    renderSubject();
    expect(titles()).toEqual(["Cells", "Enzymes", "Respiration"]);
  });

  it("follows the order the student stored", () => {
    data.lessons = [
      lesson("m-1", "Cells", "2026-10-01T00:00:00Z", 2),
      lesson("m-2", "Enzymes", "2026-10-02T00:00:00Z", 0),
      lesson("m-3", "Respiration", "2026-10-03T00:00:00Z", 1),
    ];
    renderSubject();
    expect(titles()).toEqual(["Enzymes", "Respiration", "Cells"]);
  });

  it("marks the first lesson not yet practised through as next", () => {
    data.progress = new Map([["m-1", { total: 3, practised: 3 }]]);
    renderSubject();
    expect(within(rows()[0]).queryByText("Next up")).not.toBeInTheDocument();
    expect(within(rows()[1]).getByText("Next up")).toBeInTheDocument();
    expect(screen.getAllByText("Next up")).toHaveLength(1);
  });

  it("marks nothing as next when every lesson is practised through", () => {
    data.progress = new Map(["m-1", "m-2", "m-3"].map((id) => [id, { total: 2, practised: 2 }]));
    renderSubject();
    expect(screen.queryByText("Next up")).not.toBeInTheDocument();
  });

  it("moves a lesson down and saves every lesson's place the first time", async () => {
    renderSubject();
    await userEvent.setup().click(screen.getByRole("button", { name: "Move Cells down" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual([
      { id: "m-2", position: 0 },
      { id: "m-1", position: 1 },
      { id: "m-3", position: 2 },
    ]);
  });

  it("cannot move the first lesson up or the last one down", () => {
    renderSubject();
    expect(screen.getByRole("button", { name: "Move Cells up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Respiration down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Enzymes up" })).toBeEnabled();
  });

  it("offers no move buttons for a single lesson", () => {
    data.lessons = [lesson("m-1", "Cells", "2026-10-01T00:00:00Z")];
    renderSubject();
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
  });

  it("offers no move buttons when the database cannot store an order yet", () => {
    order.supported = false;
    renderSubject();
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
    /* The path itself still reads in order. */
    expect(titles()).toEqual(["Cells", "Enzymes", "Respiration"]);
  });
});
