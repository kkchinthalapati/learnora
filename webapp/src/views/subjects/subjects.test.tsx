import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../test/render";
import { mockAuthSession } from "../../test/mockSession";
import type { Exam, Folder, Material } from "../../api/types";
import type { DatedBlock } from "../../lib/subjects";

/* Subjects and a subject's page (webapp/DESIGN.md 0.1). The data hook is
 * stubbed so these test what each page does with the data, not the network. */

const today = "2026-10-15";
const folders: Folder[] = [
  { id: "f-bio", user_id: "u", name: "Biology", color: "#4A90E2", created_at: "" },
  { id: "f-hist", user_id: "u", name: "History", color: "#E24A4A", created_at: "" },
];
const lesson = (id: string, folder_id: string | null, title: string): Material => ({
  id,
  user_id: "u",
  folder_id,
  title,
  type: "text",
  raw_content: null,
  storage_path: null,
  created_at: "2026-10-10T00:00:00Z",
});
const exams: Exam[] = [
  { id: 7, user_id: "u", exam_name: "Biology Paper 2", exam_date: "2026-10-21", difficulty: null, status: null },
];
const weekBlocks: DatedBlock[] = [
  { date: "2026-10-16", folderId: "f-bio", block: { subject: "Biology", durationMins: 45, startHint: "7:30", reason: "Biology Paper 2 prep" } },
  { date: "2026-10-16", folderId: "f-hist", block: { subject: "History", durationMins: 30, startHint: "9:00", reason: "Essay plan" } },
];

const data = {
  today,
  folders,
  lessons: [lesson("m-1", "f-bio", "Enzymes.pdf"), lesson("m-2", null, "Loose notes")],
  progress: new Map([["m-1", { total: 4, practised: 1 }]]),
  exams,
  plan: null,
  weekBlocks,
  weekSource: "schedule" as const,
  isPending: false,
  isError: false,
  planPending: false,
  retry: vi.fn(),
};

vi.mock("./useSubjectsData", () => ({ useSubjectsData: () => data }));
vi.mock("../../hooks/useDecks", () => ({ useAllDecks: () => ({ data: [] }) }));
vi.mock("../library/useLibraryActions", () => ({
  useLibraryActions: () => ({ rename: vi.fn(), removeFolder: vi.fn() }),
}));
vi.mock("../../hooks/useQuizzes", () => ({ useQuizzes: () => ({ data: [] }) }));
vi.mock("../../hooks/useFlashcards", () => ({ useAllDueFlashcards: () => ({ data: [] }) }));
vi.mock("../../hooks/useNotebooks", () => ({ useNotebooks: () => ({ notebooks: [] }) }));
const ledger = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock("../../hooks/useMisconceptions", () => ({
  useMisconceptions: () => ({ forSubject: () => [], all: ledger.rows }),
}));
vi.mock("../lesson/LessonRows", () => ({
  LessonRows: ({ lessons, label }: { lessons: Material[]; label: string }) => (
    <ul aria-label={label}>
      {lessons.map((m) => (
        <li key={m.id}>{m.title}</li>
      ))}
    </ul>
  ),
}));

const { SubjectsView } = await import("./SubjectsView");
const { SubjectView } = await import("./SubjectView");

function renderAt(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/subjects" element={<SubjectsView />} />
      <Route path="/subjects/:folderId" element={<SubjectView />} />
    </Routes>,
    undefined,
    { withRouter: true, initialEntries: [path] },
  );
}

describe("SubjectsView", () => {
  beforeEach(() => mockAuthSession("user-1"));

  it("lists each subject with its lessons and next exam", () => {
    renderAt("/subjects");
    expect(screen.getByRole("heading", { level: 1, name: "Subjects" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Your subjects" });
    const bio = within(list).getByRole("link", { name: /Biology/ });
    expect(bio).toHaveAttribute("href", "/subjects/f-bio");
    expect(bio).toHaveTextContent("1 lesson · Biology Paper 2 in 6 days");
    expect(within(list).getByRole("link", { name: /History/ })).toHaveTextContent("0 lessons · No exam date");
  });

  it("keeps lessons with no subject findable", () => {
    renderAt("/subjects");
    expect(screen.getByRole("list", { name: "Lessons not in a subject" })).toHaveTextContent("Loose notes");
  });

  it("holds the planner: this week, exams, and links to the full plan, tasks and free time", () => {
    renderAt("/subjects");
    expect(screen.getByRole("list", { name: "Planned this week" })).toHaveTextContent("Biology · 45 min");
    expect(screen.getByRole("link", { name: "Open week plan" })).toHaveAttribute("href", "/plan");
    expect(
      within(screen.getByRole("list", { name: "Upcoming exams" })).getByRole("link", { name: /Biology Paper 2/ }),
    ).toHaveAttribute("href", "/exams/7");
    const more = screen.getByRole("navigation", { name: "More in Subjects" });
    expect(within(more).getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/tasks");
    expect(within(more).getByRole("link", { name: "Free time" })).toHaveAttribute("href", "/my-week");
  });
});

describe("SubjectView", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    ledger.rows = [];
  });

  /* A mistake as the ledger holds it, filed under a catalogue belief. */
  const mistake = (catalogueId: string, subject: string, patch: Record<string, unknown> = {}) => ({
    id: catalogueId,
    subject,
    concept: catalogueId,
    conceptKey: catalogueId,
    summary: "A belief.",
    status: "open",
    severity: "moderate",
    originTool: "quiz",
    timesObserved: 2,
    timesCorrected: 0,
    firstSeenAt: "2026-10-01T00:00:00Z",
    lastSeenAt: "2026-10-10T00:00:00Z",
    resolvedAt: null,
    catalogueId,
    ...patch,
  });

  it("links to a habit this subject shares with another, and says nothing when it has none", () => {
    ledger.rows = [
      mistake("phys-heavier-falls-faster", "Physics"),
      mistake("bio-antibiotics-viruses", "Biology"),
    ];
    renderAt("/subjects/f-bio");
    const mistakes = screen.getByRole("list", { name: "Mistakes in Biology" });
    const link = within(mistakes).getByRole("link", { name: /Stretching a rule too far/ });
    expect(link).toHaveAttribute("href", "/analytics/habits/overgeneralisation");
    expect(link).toHaveTextContent(/Shows up in (Biology and Physics|Physics and Biology)\./);
    renderAt("/subjects/f-hist");
    expect(screen.queryByRole("list", { name: "Mistakes in History" })).not.toBeInTheDocument();
  });

  it("shows the carry-over to the subject where it was fixed, even with no open mistake there", () => {
    ledger.rows = [
      mistake("bio-antibiotics-viruses", "Biology", { status: "resolved", resolvedAt: "2026-10-12T00:00:00Z" }),
      mistake("phys-heavier-falls-faster", "Physics"),
    ];
    renderAt("/subjects/f-bio");
    expect(
      within(screen.getByRole("list", { name: "Mistakes in Biology" })).getByText(
        "You fixed this in Biology. Watch for it in Physics.",
      ),
    ).toBeInTheDocument();
  });

  it("shows one subject's exam, its own share of the week, and its lessons", () => {
    renderAt("/subjects/f-bio");
    expect(screen.getByRole("heading", { level: 1, name: "Biology" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Exams in Biology" })).getByRole("link", { name: /Biology Paper 2/ }),
    ).toHaveAttribute("href", "/exams/7");
    const week = screen.getByRole("list", { name: "Planned this week" });
    expect(week).toHaveTextContent("Biology Paper 2 prep");
    expect(week).not.toHaveTextContent("Essay plan");
    expect(screen.getByRole("list", { name: "Lessons in Biology" })).toHaveTextContent("Enzymes.pdf");
    expect(screen.getByRole("button", { name: "Start session" })).toBeInTheDocument();
  });

  it("says plainly when a subject has no exam or lessons", () => {
    renderAt("/subjects/f-hist");
    expect(screen.getByText("No exam date for History. Add one and the plan works back from it.")).toBeInTheDocument();
    expect(screen.getByText("No lessons yet")).toBeInTheDocument();
  });

  it("names a missing subject as the page title", () => {
    renderAt("/subjects/nope");
    expect(screen.getByRole("heading", { level: 1, name: "This subject isn't here" })).toBeInTheDocument();
  });
});
