import { beforeEach, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { localDateStr } from "../../lib/date";
import { clearStudySnapshot, recordStudySession } from "../../lib/continuity";
import { TodayView } from "./TodayView";
const timer = vi.hoisted(() => ({ prepareFocus: vi.fn(), start: vi.fn(), state: { isRunning: false }, completedFocus: null as null | { id: number; timestamp: string; task: string; minutes: number; deckId: string }, dismissCompletedFocus: vi.fn() }));
vi.mock("../../context/timer", () => ({ useTimer: () => timer, useOptionalTimer: () => timer }));
vi.mock("../../hooks/useTrajectory", () => ({ useTrajectory: () => ({
  exam: { id: 1, exam_name: "Biology", folder_id: "f" }, needsMaterial: false, isPending: false,
  forecast: { daysRemaining: 6, topics: [], confidence: { lower: 50, upper: 70, evidence: .6 }, interventions: [{ topicId: "d", label: "Enzymes", mastery: .3, pointsPerHour: 4 }] },
}) }));
beforeEach(() => { mockAuthSession("user-1"); timer.completedFocus = null; clearStudySnapshot(); vi.clearAllMocks(); });
it("leads with one decision, lists due tasks as rows, and passes the deck to the timer", async () => {
  server.use(http.get(`${SUPABASE_URL}/rest/v1/tasks`, () => HttpResponse.json([
    { id: 1, text: "Due task", is_done: false, due_date: localDateStr() },
    { id: 2, text: "Future task", is_done: false, due_date: "2099-01-01" },
    { id: 3, text: "Undated task", is_done: false, due_date: null },
  ])));
  renderWithAuth(<TodayView />, { session: fakeSession() }, { withRouter: true });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Study Enzymes next.");
  /* The meta line: date and the exam countdown. */
  expect(screen.getByText(/Biology in 6 days/)).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Also worth doing today" })).toBeInTheDocument();
  expect(await screen.findByText("Due task")).toBeInTheDocument();
  expect(screen.queryByText("Future task")).toBeNull();
  expect(screen.queryByText("Undated task")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: /Start 45 min instead/ }));
  expect(timer.prepareFocus).toHaveBeenCalledWith(45, "Enzymes", undefined, "d");
  /* "Start" means start: the student lands on a running clock. */
  expect(timer.start).toHaveBeenCalled();
});

it("switches to a ten-minute recall session for a student with less time", async () => {
  renderWithAuth(<TodayView />, { session: fakeSession() }, { withRouter: true });
  await userEvent.click(screen.getByRole("button", { name: "Only have 10 minutes?" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ten minutes is enough");
  await userEvent.click(screen.getByRole("button", { name: "I have longer" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Study Enzymes next.");
});

it("resumes an unfinished session ahead of the forecast", () => {
  recordStudySession({ id: "s1", objective: "Cellular respiration", mode: "explain", stepIndex: 2, totalSteps: 5, minutesLeft: 12, status: "paused" });
  renderWithAuth(<TodayView />, { session: fakeSession({ user_metadata: { full_name: "Maya Chen" } }) }, { withRouter: true });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pick up where you left off, Maya.");
  expect(screen.getByRole("link", { name: "Resume · 12 min left" })).toHaveAttribute("href", "/study/s1?mode=explain");
});

it("offers the completed timer session after navigating home", async () => {
  timer.completedFocus = { id: 42, timestamp: "Today", task: "Enzymes", minutes: 45, deckId: "d" };
  renderWithAuth(<TodayView />, { session: fakeSession() }, { withRouter: true });
  expect(screen.getByRole("heading", { name: "Session complete: Enzymes" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start quick check" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Not now" }));
  await waitFor(() => expect(timer.dismissCompletedFocus).toHaveBeenCalled());
});

/* The quickest way to use the timer is to press start with nothing
   attached — no task, no note. That session used to finish on "choose a
   topic next time" and no check at all, which throws away the retrieval
   evidence the misconception ledger leans on hardest. The deck and the
   subject folder are already on the session and name the material. */
it("still offers a quick check when the session was never given a name", async () => {
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/flashcard_decks`, () =>
      HttpResponse.json([{ id: "d", title: "Photosynthesis", folder_id: "f", user_id: "user-1" }]),
    ),
  );
  timer.completedFocus = {
    id: 43,
    timestamp: "Today",
    task: "General Study",
    minutes: 25,
    deckId: "d",
  };
  renderWithAuth(<TodayView />, { session: fakeSession() }, { withRouter: true });

  expect(
    await screen.findByRole("button", { name: "Start quick check" }),
  ).toBeInTheDocument();
  /* Named by its material, not by the timer's placeholder. */
  expect(
    await screen.findByRole("heading", { name: "Session complete: Photosynthesis" }),
  ).toBeInTheDocument();
});

it("asks for a topic only when nothing at all identifies the session", async () => {
  timer.completedFocus = {
    id: 44,
    timestamp: "Today",
    task: "General Study",
    minutes: 25,
    deckId: null as unknown as string,
  };
  renderWithAuth(<TodayView />, { session: fakeSession() }, { withRouter: true });

  expect(screen.queryByRole("button", { name: "Start quick check" })).toBeNull();
  expect(screen.getByText(/Choose a topic or add a session note/)).toBeInTheDocument();
});
