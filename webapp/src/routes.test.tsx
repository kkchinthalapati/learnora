import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "./test/mocks/server";
import { SUPABASE_URL } from "./lib/supabase";
import { AppRoutes } from "./routes";
import { ChatProvider } from "./context/ChatProvider";
import { fakeSession, renderWithAuth } from "./test/auth";

/* Lazy routes compile the first time they render, and that used to happen
   inside each test's 10-second wait. Under the full parallel suite the cold
   transform of the notes editor alone could run past it, failing a test
   about routing for a reason that has nothing to do with routing. Load them
   once, up front, with a budget of their own. */
beforeAll(async () => {
  await Promise.all([
    import("./views/analytics/StudyAnalyticsView"),
    import("./views/decks/DeckCardsView"),
    import("./views/exam-detective/ExamDetectiveHubView"),
    import("./views/feynman/FeynmanDebriefView"),
    import("./views/feynman/FeynmanStudioView"),
    import("./views/friends/FriendInviteLanding"),
    import("./views/friends/FriendsView"),
    import("./views/library/SubjectDetailPage"),
    import("./views/lifesync/MyWeekView"),
    import("./views/notebooks/NotebookStudioView"),
    import("./views/notes/NotesView"),
    import("./views/onboarding/WelcomeView"),
    import("./views/pro-welcome/WelcomeToProView"),
    import("./views/quiz/MockExamRunner"),
    import("./views/quiz/QuizReview"),
    import("./views/quiz/QuizRunner"),
    import("./views/review/ReviewView"),
    import("./views/room/StudyRoomView"),
    import("./views/settings/SettingsView"),
    import("./views/sparring/SocraticSparringView"),
    import("./views/trajectory/TrajectoryView"),
  ]);
}, 120_000);
import { mockAuthSession } from "./test/mockSession";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function renderAt(path: string) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      {/* The dashboard's command bar and AI card read the chat context, which
          App.tsx provides inside the router. */}
      <ChatProvider>
        <AppRoutes />
      </ChatProvider>
    </MemoryRouter>,
    { session: fakeSession() },
    /* /timer renders TimerView, which reads the timer context. */
    { withTimer: true },
  );
}

describe("route skeleton", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    server.use(http.get(rest("notebooks"), () => HttpResponse.json([])));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["/", "Add your next exam to get a next step"],
    ["/dashboard", "Dashboard"],
    /* The app shell's Header now supplies the page's <h1> (the redesign
       audit found Tasks' old page-only "Tasks" heading duplicating the
       shell's own nav-derived label right below it); the shell's label —
       t("nav_tasks"), "Tasks" — is the one that survives. */
    ["/tasks", "Tasks"],
    ["/exams", "Exams"],
    ["/timer", "Focus timer"],
    ["/library", "Your learning"],
    /* A real tab. This row used to read "/library/notes", which is not in
       LIBRARY_TABS — LibraryView bounced it to /library and rendered the same
       heading, so the assertion passed whether or not tab routing worked. */
    ["/library/quizzes", "Your learning"],
    ["/plan", "Plan"],
    ["/friends", "Friends"],
    ["/analytics", "Progress"],
    ["/study", "What do you need help with?"],
    ["/feynman", "Explain it simply"],
    ["/solver", "Step-by-step solver"],
    ["/settings", "Settings"],
  ])("%s renders the %s view for a signed-in user", async (path, heading) => {
    renderAt(path);
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: heading },
        { timeout: 10000 },
      ),
    ).toBeInTheDocument();
  });

  it.each([
    "/exam-detective",
  ])("%s renders Exam Detective", async (path) => {
    renderAt(path);
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "Exam traps" },
        { timeout: 10000 },
      ),
    ).toBeInTheDocument();
  });

  /* The defect this guards against shipped on five routes at once: AppShell's
     Header rendered an <h1> from the route's section label, and the view below
     it rendered a second one — so /notebooks printed the word "Notebooks"
     twice, 150px apart, and /feynman printed a shell title above the hub's own
     longer hero title. A document has one <h1>; which of the two owns it
     is decided by viewOwnsPageTitle() in lib/sectionLabel.ts. */
  /* Canonical paths only. This list used to include /notebooks, /debugger and
     /sparring, all of which are <Navigate> redirects — so three rows were
     re-testing the heading count of a target already covered by another row,
     and the /notebooks row in particular no longer guarded the defect its
     comment describes. */
  it.each([
    "/",
    "/library",
    "/plan",
    "/analytics",
    "/study",
    "/settings",
    "/feynman",
    "/solver",
    "/exam-detective",
    "/viva",
    "/room",
  ])("%s renders exactly one level-1 heading", async (path) => {
    renderAt(path);
    await waitFor(
      () =>
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1),
      { timeout: 10000 },
    );
  });

  /* Its own case rather than a row in the table above: the subject page is
     titled with the folder's name, so it can only be asserted once the data
     has loaded. */
  it("/folders/:folderId renders that subject's workspace", async () => {
    mockAuthSession("user-1");
    renderAt("/folders/folder-1");

    expect(
      await screen.findByRole("heading", { name: "Biology" }),
    ).toBeInTheDocument();
  });

  /* Also its own case, same reason as the folder test above: the notes
     editor is titled with the material's name, only known once the material
     and its notes have loaded. */
  it("/notes/:materialId renders that material's notes", async () => {
    mockAuthSession("user-1");
    server.use(
      http.get(rest("materials"), () =>
        HttpResponse.json({
          id: "mat-1",
          user_id: "user-1",
          folder_id: null,
          title: "Cell division",
          type: "pdf",
          raw_content: null,
          storage_path: null,
          created_at: "2026-03-05T00:00:00.000Z",
        }),
      ),
      http.get(rest("notes"), () => HttpResponse.json([])),
    );
    renderAt("/notes/mat-1");

    await waitFor(
      () => expect(screen.getByText("Cell division")).toBeInTheDocument(),
      { timeout: 10000 },
    );
  });

  /* Both quiz routes load before they can title themselves, so they get their
     own async cases too. The default handlers return no rows, which is the
     "quiz was deleted" path — enough to prove the route resolves. */
  it("/quiz/:quizId renders the quiz runner", async () => {
    mockAuthSession("user-1");
    renderAt("/quiz/q-1");

    expect(
      await screen.findByText("Quiz not found"),
    ).toBeInTheDocument();
  });

  it("/quiz/:quizId/review renders the quiz review", async () => {
    mockAuthSession("user-1");
    renderAt("/quiz/q-1/review");

    expect(
      await screen.findByText("Quiz not found"),
    ).toBeInTheDocument();
  });

  /* Same reason as the folder/notes/quiz cases above: the review screen
     titles itself with the deck's name, only known once the deck (and its
     cards) have loaded. */
  it("/review/:deckId renders the flashcard review", async () => {
    mockAuthSession("user-1");
    server.use(
      http.get(rest("flashcard_decks"), () =>
        HttpResponse.json([
          {
            id: "d-1",
            user_id: "user-1",
            folder_id: null,
            title: "Cell Biology",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
      http.get(rest("flashcards"), () =>
        HttpResponse.json([
          {
            id: "c-1",
            user_id: "user-1",
            deck_id: "d-1",
            front: "What is a mitochondrion?",
            back: "The powerhouse of the cell.",
            next_review_date: null,
            srs_interval: 0,
            ease_factor: 2.5,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
    );
    renderAt("/review/d-1");

    expect(
      await screen.findByRole(
        "heading",
        { level: 2, name: "Cell Biology" },
        { timeout: 10000 },
      ),
    ).toBeInTheDocument();
  });

  it("unknown paths fall through to Page Not Found", () => {
    renderAt("/definitely-not-a-route");
    expect(
      screen.getByRole("heading", { level: 2, name: "Page Not Found" }),
    ).toBeInTheDocument();
  });
});

/* The routes outside ProtectedRoute. Rendered signed-*out*, which is the whole
   point of them: before auth was ported there was nowhere for a signed-out
   user to go except back to the vanilla app. */
describe("public routes", () => {
  function renderSignedOutAt(path: string) {
    return renderWithAuth(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>,
      { session: null },
    );
  }

  it.each([
    ["/login", "Welcome back"],
    ["/signup", "Create your account"],
    ["/forgot-password", "Reset Password"],
    ["/terms", "Terms of Service"],
  ])("%s renders for a signed-out user", (path, heading) => {
    renderSignedOutAt(path);
    expect(
      screen.getByRole("heading", { level: 1, name: heading }),
    ).toBeInTheDocument();
  });

  it("a protected route sends a signed-out user to /login", () => {
    renderSignedOutAt("/settings");

    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back" }),
    ).toBeInTheDocument();
  });

  it("/terms stays readable while signed in", () => {
    /* It is linked from the auth screens, but also has to survive being opened
       from inside the app. */
    renderWithAuth(
      <MemoryRouter initialEntries={["/terms"]}>
        <AppRoutes />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Terms of Service" }),
    ).toBeInTheDocument();
  });
  /* T7: a screen gets one primary action. Two buttons of equal weight side by
     side means the screen has no obvious next step, which was the most common
     pattern in the redesign audit. data-rank is set by Button from its
     variant, so this asserts the rendered hierarchy rather than the source. */
  it.each([
    ["/"],
    ["/tasks"],
    ["/exams"],
    ["/library"],
    ["/plan"],
    ["/analytics"],
    ["/study"],
    ["/feynman"],
    ["/solver"],
    ["/exam-detective"],
    ["/settings"],
  ])("%s shows at most one primary action", async (path) => {
    const { container } = renderAt(path);

    await waitFor(
      () => {
        expect(container.querySelector("h1")).toBeTruthy();
      },
      { timeout: 10000 },
    );

    const primaries = Array.from(
      container.querySelectorAll('[data-rank="primary"]'),
    ).filter((el) => !el.hasAttribute("hidden"));

    /* Name them in the failure: "expected 2 to be <= 1" does not say which
       two buttons are competing. */
    const labels = primaries.map((el) => el.textContent?.trim());
    expect(labels.length, `competing primaries: ${labels.join(" | ")}`).toBeLessThanOrEqual(1);
  });
});
