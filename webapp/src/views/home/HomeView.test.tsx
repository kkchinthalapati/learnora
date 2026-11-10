import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { HomeView } from "./HomeView";
import { learnStorageKey } from "../../lib/learnPosition";
import type { Misconception } from "../../lib/misconceptions";

const ledger = vi.fn();
const exams = vi.fn();
const folders = vi.fn();
const materials = vi.fn();
const cards = vi.fn();
const dueCount = vi.fn();
const continuity = vi.fn();
const auth = vi.fn();

vi.mock("../../hooks/useMisconceptions", () => ({ useMisconceptions: () => ledger() }));
vi.mock("../../hooks/useExams", () => ({ useExams: () => exams() }));
vi.mock("../../hooks/useFolders", () => ({ useFolders: () => folders() }));
vi.mock("../../hooks/useMaterials", () => ({ useMaterials: () => materials() }));
vi.mock("../../hooks/useFlashcards", () => ({
  useFlashcards: () => cards(),
  useFlashcardsDueCount: () => dueCount(),
}));
vi.mock("../../hooks/useContinuity", () => ({ useContinuity: () => continuity() }));
vi.mock("../../context/auth", () => ({ useOptionalAuth: () => auth() }));
vi.mock("../../context/timer", () => ({
  useTimer: () => ({ completedFocus: null, dismissCompletedFocus: () => {} }),
}));
vi.mock("../../api/misconceptions", () => ({ isLoopSupported: () => true }));
/* Their own tests cover these; here they only need to be present. */
vi.mock("../../components/capture/CaptureBar", () => ({
  CaptureBar: ({ placeholder }: { placeholder?: string }) => <input aria-label="Add something" placeholder={placeholder} />,
}));
vi.mock("../today/MistakeLoopSection", () => ({ MistakeLoopSection: () => null }));
vi.mock("../lesson/LessonRows", () => ({
  LessonRows: ({ lessons }: { lessons: Array<{ id: string; title: string }> }) => (
    <ul aria-label="Lessons">
      {lessons.map((l) => (
        <li key={l.id}>{l.title}</li>
      ))}
    </ul>
  ),
}));

function Probe() {
  const { pathname, search } = useLocation();
  return <h1>{`At ${pathname}${search}`}</h1>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function row(patch: Partial<Misconception> = {}): Misconception {
  return {
    id: "m1",
    subject: "Biology",
    concept: "Osmosis",
    conceptKey: "osmosis",
    summary: "Thinks water moves towards the dilute side.",
    status: "open",
    severity: "critical",
    originTool: "debugger",
    timesObserved: 1,
    timesCorrected: 0,
    firstSeenAt: "2026-09-01T00:00:00Z",
    lastSeenAt: "2026-09-05T00:00:00Z",
    resolvedAt: null,
    ...patch,
  };
}

const lesson = (id: string, title: string, folder: string | null = "bio") => ({
  id,
  title,
  folder_id: folder,
  type: "text",
  created_at: `2026-05-0${id.slice(-1)}T00:00:00Z`,
});
const BIO = { id: "bio", name: "Biology", color: "#0f766e", created_at: "2026-01-01" };
const CHEM = { id: "chem", name: "Chemistry", color: "#b45309", created_at: "2026-01-02" };

const today = () => within(screen.getByRole("region", { name: "Today" }));

describe("HomeView", () => {
  beforeEach(() => {
    localStorage.clear();
    ledger.mockReturnValue({ ranked: [], all: [], isPending: false });
    exams.mockReturnValue({ data: [], isPending: false });
    folders.mockReturnValue({ data: [], isPending: false });
    materials.mockReturnValue({ data: [], isPending: false, isError: false, refetch: vi.fn() });
    cards.mockReturnValue({ data: [], isPending: false });
    dueCount.mockReturnValue({ data: 0, isPending: false });
    continuity.mockReturnValue({ resumeAction: null, snapshot: {} });
    auth.mockReturnValue({ user: { user_metadata: { full_name: "Priya Sharma" }, email: "p@example.com" } });
  });

  it("greets the student by first name in a static heading", () => {
    renderHome();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/^(Good (morning|afternoon|evening), Priya\.|Still up, Priya\?)$/);
  });

  it("greets without a name rather than using the email address", () => {
    auth.mockReturnValue({ user: { user_metadata: {}, email: "priya.s2009@example.com" } });
    renderHome();
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(/priya/i);
  });

  it("a new student sees where to begin, the box, and no empty sections", () => {
    renderHome();
    expect(today().getByText(/your first lesson starts here/)).toBeInTheDocument();
    expect(today().queryByRole("link", { name: "Review cards" })).not.toBeInTheDocument();
    expect(today().queryByRole("button", { name: "Start session" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Add something")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your subjects" })).not.toBeInTheDocument();
    expect(screen.getByText("No lessons yet")).toBeInTheDocument();
  });

  it("with lessons and nothing due, suggests the next lesson", () => {
    folders.mockReturnValue({ data: [BIO], isPending: false });
    materials.mockReturnValue({
      data: [lesson("l2", "Respiration"), lesson("l1", "Photosynthesis")],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderHome();
    expect(today().getByText("Nothing urgent today. Photosynthesis is ready when you are.")).toBeInTheDocument();
    expect(today().getByRole("link", { name: "Open lesson" })).toHaveAttribute("href", "/lessons/l1");
    expect(today().getByRole("link", { name: "Plan a study session" })).toHaveAttribute("href", "/study");
  });

  it("with revision due, counts it and starts the adaptive session", async () => {
    ledger.mockReturnValue({ ranked: [row()], all: [row()], isPending: false });
    dueCount.mockReturnValue({ data: 4, isPending: false });
    renderHome();
    expect(today().getByText("4 cards are worth another look today.")).toBeInTheDocument();
    expect(today().getByRole("link", { name: "See the session first" })).toHaveAttribute("href", "/study");
    expect(today().getByRole("link", { name: /4 cards due/ })).toHaveAttribute("href", "/review/daily-drill");

    await userEvent.setup().click(today().getByRole("button", { name: "Start session" }));
    const at = screen.getByRole("heading", { level: 1 }).textContent ?? "";
    /* The run /study would start: a check on the ledger's most urgent row. */
    expect(at).toContain("/study/new?");
    expect(at).toContain("mode=practice");
    expect(at).toContain("topic=Osmosis");
    expect(at).toContain("misconception=m1");
    expect(at).toMatch(/run=r-/);
  });

  it("with only cards due and no topic to go on, Start opens the card review", () => {
    dueCount.mockReturnValue({ data: 1, isPending: false });
    renderHome();
    expect(today().getByText("1 card is worth another look today.")).toBeInTheDocument();
    expect(today().getByRole("link", { name: "Review cards" })).toHaveAttribute("href", "/review/daily-drill");
  });

  it("shows an ongoing lesson with its subject and the part reached", () => {
    folders.mockReturnValue({ data: [BIO], isPending: false });
    materials.mockReturnValue({ data: [lesson("l1", "Photosynthesis")], isPending: false, isError: false, refetch: vi.fn() });
    localStorage.setItem(learnStorageKey("l1"), JSON.stringify({ outline: ["a", "b", "c", "d", "e"], current: 2, sections: {} }));
    continuity.mockReturnValue({
      resumeAction: {
        type: "material",
        title: "Photosynthesis",
        subtitle: "Lesson",
        targetUrl: "/lessons/l1",
        progressPercentage: 0,
      },
      snapshot: { lastOpenedMaterial: { id: "l1", title: "Photosynthesis", folderId: "bio" } },
    });
    renderHome();
    const row = within(screen.getByRole("region", { name: "Continue" })).getByRole("link");
    expect(row).toHaveAttribute("href", "/lessons/l1");
    expect(row).toHaveTextContent("Photosynthesis");
    expect(row).toHaveTextContent("Biology · Part 3 of 5");
    expect(today().getByText("Nothing urgent today. Continue where you left off.")).toBeInTheDocument();
  });

  it("does not invent a part when Learn was never started", () => {
    continuity.mockReturnValue({
      resumeAction: { type: "material", title: "Bonding", subtitle: "Lesson", targetUrl: "/lessons/l9", progressPercentage: 0 },
      snapshot: { lastOpenedMaterial: { id: "l9", title: "Bonding", folderId: null } },
    });
    renderHome();
    const row = within(screen.getByRole("region", { name: "Continue" })).getByRole("link");
    expect(row).not.toHaveTextContent(/Part \d/);
    expect(row).toHaveTextContent("Lesson");
  });

  it("lists the student's own subjects with what is next in each", () => {
    folders.mockReturnValue({ data: [BIO, CHEM], isPending: false });
    materials.mockReturnValue({
      data: [lesson("l2", "Respiration"), lesson("l1", "Bonding", "chem")],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderHome();
    const list = within(screen.getByRole("region", { name: "Your subjects" }));
    expect(list.getByRole("link", { name: /Biology/ })).toHaveAttribute("href", "/subjects/bio");
    expect(list.getByRole("link", { name: /Biology/ })).toHaveTextContent("Next: Respiration");
    expect(list.getByRole("link", { name: /Chemistry/ })).toHaveTextContent("Next: Bonding");
    expect(list.getByRole("link", { name: "All subjects" })).toHaveAttribute("href", "/subjects");
    expect(document.body.textContent).not.toContain("%");
  });

  it("names the next exam under the greeting", () => {
    const d = new Date();
    d.setDate(d.getDate() + 12);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    exams.mockReturnValue({ data: [{ id: 1, exam_name: "Biology paper 1", exam_date: date }], isPending: false });
    renderHome();
    expect(screen.getByText("Biology paper 1 is in 12 days.")).toBeInTheDocument();
  });

  it("holds its shape while loading", () => {
    dueCount.mockReturnValue({ data: undefined, isPending: true });
    materials.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });
    renderHome();
    expect(today().queryByRole("button", { name: "Start session" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("offers a retry when lessons fail to load", () => {
    materials.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: vi.fn() });
    renderHome();
    expect(screen.getByText("Your lessons didn't load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
