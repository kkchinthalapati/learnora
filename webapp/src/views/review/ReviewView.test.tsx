import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { ChatProvider } from "../../context/ChatProvider";
import { ReviewView } from "./ReviewView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;
const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;

function deck(overrides: Record<string, unknown> = {}) {
  return {
    id: "d-1",
    user_id: "user-1",
    folder_id: null,
    title: "Cell Biology",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    user_id: "user-1",
    deck_id: "d-1",
    front: "What is a mitochondrion?",
    back: "The powerhouse of the cell.",
    next_review_date: null,
    srs_interval: 0,
    ease_factor: 2.5,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function serve({
  decks = [deck()],
  cards = [card()],
}: {
  decks?: Record<string, unknown>[];
  cards?: Record<string, unknown>[];
} = {}) {
  server.use(
    http.get(rest("flashcard_decks"), () => HttpResponse.json(decks)),
    http.get(rest("flashcards"), () => HttpResponse.json(cards)),
  );
}

function renderReview(deckId = "d-1") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[`/review/${deckId}`]}>
      {/* The AI-grading box sends through the same chat pipeline the Turbo
          panel uses, so it needs ChatProvider inside the router exactly like
          the dashboard's command bar does (see DashboardView.test.tsx). */}
      <ChatProvider>
        <Routes>
          <Route path="/review/:deckId" element={<ReviewView />} />
          <Route
            path="/library/flashcards"
            element={<h1>Flashcards tab</h1>}
          />
        </Routes>
      </ChatProvider>
    </MemoryRouter>,
    { session: fakeSession() },
    { withTimer: true },
  );
}

describe("ReviewView", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the front of the first due card, hint visible, controls hidden", async () => {
    serve();
    renderReview();

    expect(
      await screen.findByText("What is a mitochondrion?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Card 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Click to flip")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Flip card to see the answer" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByRole("button", { name: "Good (3)" }),
    ).not.toBeInTheDocument();
  });

  it("flips on click and reveals the grading controls", async () => {
    serve();
    renderReview();
    await screen.findByText("What is a mitochondrion?");

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Flip card to see the answer" }),
    );

    expect(screen.getByText("The powerhouse of the cell.")).toBeInTheDocument();
    expect(screen.queryByText("Click to flip")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Flip card to see the answer" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Again (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hard (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Good (3)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Easy (4)" })).toBeInTheDocument();
  });

  it("grades the card, saves the SM-2 state, and advances to the next one", async () => {
    serve({
      cards: [
        card({ id: "c-1", front: "Q1", back: "A1" }),
        card({ id: "c-2", front: "Q2", back: "A2" }),
      ],
    });
    let capturedBody: unknown;
    server.use(
      http.patch(rest("flashcards"), async ({ request }) => {
        capturedBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderReview();
    await screen.findByText("Q1");

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Flip card to see the answer" }),
    );
    await user.click(screen.getByRole("button", { name: "Good (3)" }));

    expect(await screen.findByText("Q2")).toBeInTheDocument();
    expect(screen.getByText("Card 2 of 2")).toBeInTheDocument();
    expect(capturedBody).toEqual({
      next_review_date: expect.any(String),
      srs_interval: 1,
      ease_factor: 2.6,
    });
    /* The next card starts unflipped again — grading resets the session's
       per-card state. */
    expect(
      screen.getByRole("button", { name: "Flip card to see the answer" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the session's card list stable across the background refetch grading triggers", async () => {
    /* Regression test: grading invalidates useFlashcardsByDeck, which
       refetches in the background. If the session read its card list from
       that live query instead of a snapshot, the refetch's shrunk "due" set
       would desync `index` mid-session and end the review a card early. */
    const c1 = card({ id: "c-1", front: "Q1", back: "A1" });
    const c2 = card({ id: "c-2", front: "Q2", back: "A2" });
    let gradedC1 = false;
    let getCalls = 0;
    server.use(
      http.get(rest("flashcard_decks"), () => HttpResponse.json([deck()])),
      http.get(rest("flashcards"), () => {
        getCalls++;
        // Once c1 is graded, the server reports it not due again — the same
        // shape a real Supabase refetch would return.
        const first = gradedC1
          ? { ...c1, next_review_date: "2099-01-01T00:00:00.000Z" }
          : c1;
        return HttpResponse.json([first, c2]);
      }),
      http.patch(rest("flashcards"), () => {
        gradedC1 = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderReview();
    await screen.findByText("Q1");

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Flip card to see the answer" }),
    );
    const callsBeforeGrade = getCalls;
    await user.click(screen.getByRole("button", { name: "Good (3)" }));

    // Wait for the invalidation's background refetch to actually land
    // (proving this isn't passing merely because it never happened).
    await waitFor(() => expect(getCalls).toBeGreaterThan(callsBeforeGrade));

    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByText("Card 2 of 2")).toBeInTheDocument();
  });

  it("shows the completion screen after grading the last due card", async () => {
    serve();
    renderReview();
    await screen.findByText("What is a mitochondrion?");

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Flip card to see the answer" }),
    );
    await user.click(screen.getByRole("button", { name: "Easy (4)" }));

    expect(
      await screen.findByText("Review Complete! 🧠"),
    ).toBeInTheDocument();
    expect(screen.getByText("Great job.")).toBeInTheDocument();
  });

  it("surfaces a toast when saving a grade fails, without blocking on it", async () => {
    serve();
    server.use(
      http.patch(rest("flashcards"), () =>
        HttpResponse.json({ message: "db offline" }, { status: 500 }),
      ),
    );
    renderReview();
    await screen.findByText("What is a mitochondrion?");

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Flip card to see the answer" }),
    );
    await user.click(screen.getByRole("button", { name: "Good (3)" }));

    /* The session still advances immediately — a slow or failing write must
       not stall the student's review, the same call Step 8/16 already made
       for task toggles and quiz-attempt writes. */
    expect(
      await screen.findByText("Review Complete! 🧠"),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save this card's review",
    );
  });

  it("shows the all-caught-up state when no cards are due, naming the deck", async () => {
    serve({
      cards: [
        card({ next_review_date: "2099-01-01T00:00:00.000Z" }),
      ],
    });
    renderReview();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Cell Biology" }),
    ).toBeInTheDocument();
    expect(screen.getByText("All caught up! 🎉")).toBeInTheDocument();
  });

  it("shows a not-found state for a deck that no longer exists", async () => {
    serve({ decks: [] });
    renderReview("gone");

    expect(
      await screen.findByText("This deck no longer exists."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Flashcards" }),
    ).toHaveAttribute("href", "/library/flashcards");
  });

  it("exits back to the Flashcards tab", async () => {
    serve();
    renderReview();
    await screen.findByText("What is a mitochondrion?");

    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "← Exit Review" }));

    expect(
      await screen.findByRole("heading", { name: "Flashcards tab" }),
    ).toBeInTheDocument();
  });

  /* End to end: the "AI grade" box sends the same prompt the vanilla built
     (js/router.js:726-736) through the real chat pipeline, and a reply
     containing <GRADE_FLASHCARD> must click through to the same `scoreCard`
     the manual buttons use — the loose end named in Step 17's own ledger
     entry ("Whoever lands step 18 should wire it into ChatProvider's
     handlers"). */
  describe("AI grading", () => {
    it("grades the card from the model's reply and clears the loading status", async () => {
      serve({
        cards: [
          card({ id: "c-1", front: "Q1", back: "A1" }),
          card({ id: "c-2", front: "Q2", back: "A2" }),
        ],
      });
      let capturedBody: unknown;
      server.use(
        http.patch(rest("flashcards"), async ({ request }) => {
          capturedBody = await request.json();
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(EDGE_URL, () =>
          HttpResponse.json({
            text: "Nice, close enough! <GRADE_FLASHCARD>4</GRADE_FLASHCARD>",
          }),
        ),
      );
      renderReview();
      await screen.findByText("Q1");

      const user = userEvent.setup();
      await user.type(
        screen.getByRole("textbox", { name: "Your answer, for AI to grade" }),
        "the mitochondria",
      );
      await user.click(screen.getByRole("button", { name: "Grade" }));

      /* By the time the click settles the mocked reply has already resolved
         and the tag has already executed — same as the manual-grade test,
         the visible proof is the session having moved on. */
      expect(await screen.findByText("Q2")).toBeInTheDocument();
      expect(
        screen.queryByText("AI is grading your answer..."),
      ).not.toBeInTheDocument();
      expect(capturedBody).toMatchObject({ srs_interval: 1, ease_factor: 2.6 });
    });

    it("shows a loading status while the reply is in flight, and reveals the back", async () => {
      serve();
      let resolveEdge!: (response: Response) => void;
      server.use(
        http.post(
          EDGE_URL,
          () => new Promise<Response>((resolve) => (resolveEdge = resolve)),
        ),
      );
      renderReview();
      await screen.findByText("What is a mitochondrion?");

      const user = userEvent.setup();
      await user.type(
        screen.getByRole("textbox", { name: "Your answer, for AI to grade" }),
        "the mitochondria",
      );
      await user.click(screen.getByRole("button", { name: "Grade" }));

      expect(
        await screen.findByText("AI is grading your answer..."),
      ).toBeInTheDocument();
      /* Grading reveals the back, same as the vanilla (js/router.js:722). */
      expect(screen.getByText("The powerhouse of the cell.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Grade" })).toBeDisabled();

      resolveEdge(
        HttpResponse.json({ text: "<GRADE_FLASHCARD>3</GRADE_FLASHCARD>" }),
      );

      await waitFor(() =>
        expect(screen.getByText("Review Complete! 🧠")).toBeInTheDocument(),
      );
    });

    it("grades on Enter as well as on the Grade button", async () => {
      serve();
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({
            text: "<GRADE_FLASHCARD>3</GRADE_FLASHCARD> Good enough.",
          }),
        ),
      );
      renderReview();
      await screen.findByText("What is a mitochondrion?");

      const user = userEvent.setup();
      await user.type(
        screen.getByRole("textbox", { name: "Your answer, for AI to grade" }),
        "mitochondria{Enter}",
      );

      await waitFor(() =>
        expect(screen.getByText("Review Complete! 🧠")).toBeInTheDocument(),
      );
    });

    it("recovers with an error toast when the reply has no usable tag", async () => {
      /* An improvement over the vanilla, not just a port: its own
         "AI is grading..." text had no recovery path if the model ignored
         the instruction. Here the student gets an error and can grade
         manually instead of staring at a stuck spinner forever. */
      serve();
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({ text: "Mitochondria are indeed important!" }),
        ),
      );
      renderReview();
      await screen.findByText("What is a mitochondrion?");

      const user = userEvent.setup();
      await user.type(
        screen.getByRole("textbox", { name: "Your answer, for AI to grade" }),
        "mitochondria",
      );
      await user.click(screen.getByRole("button", { name: "Grade" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "AI couldn't grade that answer",
      );
      expect(
        screen.queryByText("AI is grading your answer..."),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Grade" })).not.toBeDisabled();

      // Manual grading still works after the AI path failed.
      await user.click(screen.getByRole("button", { name: "Easy (4)" }));
      expect(
        await screen.findByText("Review Complete! 🧠"),
      ).toBeInTheDocument();
    });

    it("does nothing when the answer box is empty", async () => {
      serve();
      renderReview();
      await screen.findByText("What is a mitochondrion?");

      expect(screen.getByRole("button", { name: "Grade" })).toBeDisabled();
    });

    it("a stale reply arriving after the student already left grades nothing", async () => {
      /* Guards the registration cleanup: unmounting the review view (e.g. by
         exiting) must unregister the grader so a chat reply that resolves
         afterwards has no card left to click through to. */
      serve();
      let resolveEdge!: (response: Response) => void;
      server.use(
        http.post(
          EDGE_URL,
          () => new Promise<Response>((resolve) => (resolveEdge = resolve)),
        ),
      );
      renderReview();
      await screen.findByText("What is a mitochondrion?");

      const user = userEvent.setup();
      await user.type(
        screen.getByRole("textbox", { name: "Your answer, for AI to grade" }),
        "mitochondria",
      );
      await user.click(screen.getByRole("button", { name: "Grade" }));
      await user.click(screen.getByRole("link", { name: "← Exit Review" }));
      expect(
        await screen.findByRole("heading", { name: "Flashcards tab" }),
      ).toBeInTheDocument();

      resolveEdge(
        HttpResponse.json({ text: "<GRADE_FLASHCARD>4</GRADE_FLASHCARD>" }),
      );

      /* Settles without error and stays on the page navigated to — the
         resolved reply had no registered grader left to call. */
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: "Flashcards tab" }),
        ).toBeInTheDocument(),
      );
    });
  });
});
