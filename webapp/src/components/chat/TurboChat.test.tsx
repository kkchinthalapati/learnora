import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { ChatProvider } from "../../context/ChatProvider";
import { useChat } from "../../context/chat";
import { TurboChat } from "./TurboChat";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;
const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;

/** Opens the panel — the app's real entry points do this from the dashboard,
 *  which would drag the whole dashboard into every chat test. */
function OpenChatButton() {
  const { open } = useChat();
  return (
    <button type="button" onClick={open}>
      Open chat
    </button>
  );
}

function LocationProbe() {
  const { pathname } = useLocation();
  return <p>{`path:${pathname}`}</p>;
}

function serveWorkspace() {
  server.use(
    http.get(rest("tasks"), () => HttpResponse.json([])),
    http.get(rest("exams"), () => HttpResponse.json([])),
  );
}

function serveReply(text: string) {
  server.use(http.post(EDGE_URL, () => HttpResponse.json({ text })));
}

/** Dispatches the edge call by `mode`, for tags like `<ADD_QUIZ>`/`<ADD_PLAN>`
 *  whose handler fires a *second*, differently-moded `callEdge` after the
 *  chat turn that emitted the tag — a plain `serveReply` would hand the
 *  generation call the chat reply's tag-bearing text right back. */
function serveEdgeByMode(byMode: Record<string, () => Response>) {
  server.use(
    http.post(EDGE_URL, async ({ request }) => {
      const { mode } = (await request.json()) as { mode?: string };
      const reply = byMode[mode ?? "chat"];
      if (!reply) {
        throw new Error(`test forgot to stub edge mode "${mode}"`);
      }
      return reply();
    }),
  );
}

function renderChat(initialPath = "/") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[initialPath]}>
      {/* ChatProvider sits inside the router, as it does in App.tsx — it
          navigates and reads the current path for context. */}
      <ChatProvider>
        <LocationProbe />
        <Routes>
          <Route path="*" element={<OpenChatButton />} />
        </Routes>
        <TurboChat />
      </ChatProvider>
    </MemoryRouter>,
    { session: fakeSession() },
    { withTimer: true },
  );
}

async function openChat() {
  await userEvent.click(screen.getByRole("button", { name: "Open chat" }));
  return screen.getByRole("region", { name: "Learnora AI chat" });
}

async function ask(question: string) {
  await userEvent.type(
    screen.getByRole("textbox", { name: "AI chat input" }),
    question,
  );
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
}

describe("TurboChat", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
    serveWorkspace();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is closed until something opens it", () => {
    renderChat();
    expect(
      screen.queryByRole("region", { name: "Learnora AI chat" }),
    ).not.toBeInTheDocument();
  });

  it("greets the student on an empty conversation", async () => {
    renderChat();
    const panel = await openChat();
    expect(
      within(panel).getByText(/Hi there! I'm Learnora AI/),
    ).toBeInTheDocument();
  });

  it("closes on the close button", async () => {
    renderChat();
    const panel = await openChat();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Close AI chat" }),
    );
    expect(
      screen.queryByRole("region", { name: "Learnora AI chat" }),
    ).not.toBeInTheDocument();
  });

  it("toggles full screen and reports its state", async () => {
    renderChat();
    const panel = await openChat();
    const toggle = within(panel).getByRole("button", {
      name: "Toggle full screen",
    });

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(
      within(panel).getByRole("button", { name: "Exit full screen" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  describe("sending", () => {
    it("shows the question, then the reply", async () => {
      serveReply("You have nothing due today.");
      renderChat();
      await openChat();

      await ask("what are my tasks?");

      expect(screen.getByText("what are my tasks?")).toBeInTheDocument();
      expect(
        await screen.findByText("You have nothing due today."),
      ).toBeInTheDocument();
    });

    it("sends the workspace state and the student's message to the model", async () => {
      let body: { history?: { content: string }[] } | undefined;
      server.use(
        http.get(rest("tasks"), () =>
          HttpResponse.json([
            {
              id: 1,
              user_id: "user-1",
              text: "Read chapter 4",
              is_done: false,
              due_date: "2026-08-07",
            },
          ]),
        ),
        http.post(EDGE_URL, async ({ request }) => {
          body = (await request.json()) as typeof body;
          return HttpResponse.json({ text: "ok" });
        }),
      );
      renderChat();
      await openChat();

      await ask("hello");
      await screen.findByText("ok");

      const prompt = body?.history?.at(-1)?.content ?? "";
      expect(prompt).toContain("Read chapter 4 (due 2026-08-07)");
      expect(prompt).toContain("User message: hello");
    });

    it("renders markdown in the reply", async () => {
      serveReply("Try **this** and `that`");
      renderChat();
      await openChat();
      await ask("hi");

      expect(await screen.findByText("this")).toBeInTheDocument();
      expect(screen.getByText("this").tagName).toBe("STRONG");
      expect(screen.getByText("that").tagName).toBe("CODE");
    });

    /* The whole reason the chat renders React nodes instead of assigning
       `renderMarkdown`'s output to `innerHTML`. */
    it("cannot be made to inject markup by the model", async () => {
      serveReply('<img src=x onerror="alert(1)">');
      renderChat();
      await openChat();
      await ask("hi");

      expect(await screen.findByText(/<img src=x/)).toBeInTheDocument();
      expect(document.querySelector("img")).toBeNull();
    });

    it("reports a failure in the feed rather than silently doing nothing", async () => {
      server.use(
        http.post(EDGE_URL, () =>
          HttpResponse.json({ error: "Bad token" }, { status: 401 }),
        ),
      );
      renderChat();
      await openChat();
      await ask("hi");

      expect(await screen.findByRole("alert")).toHaveTextContent("Bad token");
    });

    it("carries the conversation into the next request", async () => {
      const bodies: { history: { role: string; content: string }[] }[] = [];
      server.use(
        http.post(EDGE_URL, async ({ request }) => {
          bodies.push((await request.json()) as (typeof bodies)[number]);
          return HttpResponse.json({ text: `reply ${bodies.length}` });
        }),
      );
      renderChat();
      await openChat();

      await ask("first");
      await screen.findByText("reply 1");
      await ask("second");
      await screen.findByText("reply 2");

      /* The second request carries the first exchange — the *clean* text, not
         the injected system context. */
      expect(bodies[1].history[0]).toEqual({ role: "user", content: "first" });
      expect(bodies[1].history[1]).toEqual({
        role: "model",
        content: "reply 1",
      });
    });

    /* Replaying a failed exchange would make the model answer a question the
       student never saw answered. */
    it("does not put a failed exchange into the history", async () => {
      const bodies: { history: { content: string }[] }[] = [];
      let calls = 0;
      server.use(
        http.post(EDGE_URL, async ({ request }) => {
          bodies.push((await request.json()) as (typeof bodies)[number]);
          calls++;
          return calls === 1
            ? HttpResponse.json({ error: "nope" }, { status: 400 })
            : HttpResponse.json({ text: "second time" });
        }),
      );
      renderChat();
      await openChat();

      await ask("doomed");
      await screen.findByRole("alert");
      await ask("retry");
      await screen.findByText("second time");

      expect(bodies[1].history).toHaveLength(1);
    });
  });

  describe("action tags", () => {
    it("never shows a raw tag to the student", async () => {
      serveReply("Done — <ADD_TASK>Revise ch. 3</ADD_TASK>");
      server.use(
        http.post(rest("tasks"), () => new HttpResponse(null, { status: 201 })),
      );
      renderChat();
      await openChat();
      await ask("add a task");

      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Add Task" }),
      );

      await screen.findByText("Revise ch. 3");
      expect(screen.queryByText(/<ADD_TASK>/)).not.toBeInTheDocument();
    });

    it("creates the task once the student allows it", async () => {
      let posted: Record<string, unknown>[] | undefined;
      serveReply("<ADD_TASK>Revise ch. 3</ADD_TASK>");
      server.use(
        http.post(rest("tasks"), async ({ request }) => {
          posted = (await request.json()) as Record<string, unknown>[];
          return new HttpResponse(null, { status: 201 });
        }),
      );
      renderChat();
      await openChat();
      await ask("add a task");

      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Add Task" }),
      );

      await waitFor(() => expect(posted).toBeDefined());
      expect(posted?.[0]).toMatchObject({
        text: "Revise ch. 3",
        user_id: "user-1",
      });
      expect(await screen.findByText("Added task:")).toBeInTheDocument();
    });

    it("creates nothing when the student declines", async () => {
      let posts = 0;
      serveReply("<ADD_TASK>Revise ch. 3</ADD_TASK>");
      server.use(
        http.post(rest("tasks"), () => {
          posts++;
          return new HttpResponse(null, { status: 201 });
        }),
      );
      renderChat();
      await openChat();
      await ask("add a task");

      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Cancel" }),
      );

      expect(
        await screen.findByText("Canceled adding task:"),
      ).toBeInTheDocument();
      expect(posts).toBe(0);
    });

    it("starts a timer and lands the student on it", async () => {
      serveReply("Starting now. <START_TIMER>30</START_TIMER>");
      server.use(http.get(rest("folders"), () => HttpResponse.json([])));
      renderChat();
      await openChat();
      await ask("30 minute timer please");

      expect(
        await screen.findByText("Started focus timer for 30m"),
      ).toBeInTheDocument();
    });

    it("says the reply was pure action when nothing else was in it", async () => {
      serveReply("<SET_THEME>light</SET_THEME>");
      renderChat();
      await openChat();
      await ask("go light");

      expect(
        await screen.findByText("Switched theme to light"),
      ).toBeInTheDocument();
    });

    it("navigates on <NAVIGATE> and says where", async () => {
      serveReply("Sure — <NAVIGATE>settings</NAVIGATE>");
      renderChat();
      await openChat();
      await ask("take me to settings");

      expect(
        await screen.findByText("Navigated to settings"),
      ).toBeInTheDocument();
      expect(await screen.findByText("path:/settings")).toBeInTheDocument();
    });

    /* <ADD_QUIZ>/<ADD_PLAN> fire a *second*, differently-moded `callEdge` off
       the handler passed to `executeActions` — real network glue that the
       pure `chatActions.test.ts` (which mocks the handler outright) can't
       exercise, and nothing else in the suite reaches. */
    describe("<ADD_QUIZ>", () => {
      it("generates the quiz once allowed, and lands on it", async () => {
        serveEdgeByMode({
          chat: () =>
            HttpResponse.json({
              text: "Sure — <ADD_QUIZ>Cell biology</ADD_QUIZ>",
            }),
          quiz: () =>
            HttpResponse.json({
              text: JSON.stringify([
                {
                  question: "What holds a cell's DNA?",
                  choices: ["Nucleus", "Ribosome"],
                  correctIndex: 0,
                },
              ]),
            }),
        });
        server.use(
          http.post(rest("quizzes"), () =>
            HttpResponse.json({ id: "quiz-1", title: "Cell biology Quiz" }),
          ),
        );
        renderChat();
        await openChat();
        await ask("quiz me on cell biology");

        const dialog = await screen.findByRole("alertdialog");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Generate Quiz" }),
        );

        expect(await screen.findByText("Generating quiz:")).toBeInTheDocument();
        expect(
          await screen.findByText("Quiz generated successfully!"),
        ).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.getByText("path:/quiz/quiz-1")).toBeInTheDocument(),
        );
      });

      it("generates nothing when declined", async () => {
        let quizCalls = 0;
        serveReply("Sure — <ADD_QUIZ>Cell biology</ADD_QUIZ>");
        server.use(
          http.post(rest("quizzes"), () => {
            quizCalls++;
            return HttpResponse.json({ id: "quiz-1" });
          }),
        );
        renderChat();
        await openChat();
        await ask("quiz me on cell biology");

        const dialog = await screen.findByRole("alertdialog");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Cancel" }),
        );

        expect(
          await screen.findByText("Canceled quiz generation"),
        ).toBeInTheDocument();
        expect(quizCalls).toBe(0);
      });

      /* A refused topic carries its own explanation, distinct from a plain
         "try again" — the generic message must not swallow it. */
      it("toasts the safety refusal's own wording, not a generic failure", async () => {
        serveEdgeByMode({
          chat: () =>
            HttpResponse.json({
              text: "<ADD_QUIZ>How to make a bomb</ADD_QUIZ>",
            }),
          quiz: () =>
            HttpResponse.json(
              { error: "I can't help with that topic.", refused: true },
              { status: 422 },
            ),
        });
        renderChat();
        await openChat();
        await ask("quiz me on that");

        const dialog = await screen.findByRole("alertdialog");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Generate Quiz" }),
        );

        expect(
          await screen.findByText("I can't help with that topic."),
        ).toBeInTheDocument();
      });

      it("shows QuizShapeError's own wording when nothing quiz-shaped comes back", async () => {
        serveEdgeByMode({
          chat: () =>
            HttpResponse.json({ text: "<ADD_QUIZ>Cell biology</ADD_QUIZ>" }),
          quiz: () => HttpResponse.json({ text: "not JSON at all" }),
        });
        renderChat();
        await openChat();
        await ask("quiz me");

        const dialog = await screen.findByRole("alertdialog");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Generate Quiz" }),
        );

        expect(
          await screen.findByText(
            "Couldn't generate a quiz this time. Please try again.",
          ),
        ).toBeInTheDocument();
      });

      /* Distinct from both the refusal and the shape-error paths above: a
         plain transport failure carries no message worth showing verbatim,
         so this is the one case that must fall all the way through to the
         generic wording. A 4xx (rather than a 5xx/429) keeps this from also
         exercising the client's own retry-with-backoff path — covered
         separately in ai.test.ts — which would just slow this test down. */
      it("falls back to a generic toast for a plain transport failure", async () => {
        serveEdgeByMode({
          chat: () =>
            HttpResponse.json({ text: "<ADD_QUIZ>Cell biology</ADD_QUIZ>" }),
          quiz: () =>
            HttpResponse.json({ error: "Bad request" }, { status: 400 }),
        });
        renderChat();
        await openChat();
        await ask("quiz me");

        const dialog = await screen.findByRole("alertdialog");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Generate Quiz" }),
        );

        expect(
          await screen.findByText("Failed to generate quiz. Please try again."),
        ).toBeInTheDocument();
      });
    });

    describe("<ADD_PLAN>", () => {
      it("generates the plan once allowed, and lands on it", async () => {
        serveEdgeByMode({
          chat: () => HttpResponse.json({ text: "<ADD_PLAN></ADD_PLAN>" }),
          plan: () =>
            HttpResponse.json({
              text: JSON.stringify({
                summary: "A balanced week",
                days: [],
              }),
            }),
        });
        server.use(
          http.post(rest("weekly_plans"), () =>
            HttpResponse.json({
              id: "plan-1",
              week_start: "2026-08-03",
              plan_json: { summary: "A balanced week", days: [] },
            }),
          ),
        );
        renderChat();
        await openChat();
        await ask("plan my week");

        const dialog = await screen.findByRole("alertdialog");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Generate Plan" }),
        );

        expect(
          await screen.findByText("Generating your weekly study plan"),
        ).toBeInTheDocument();
        expect(
          await screen.findByText("Plan generated successfully!"),
        ).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.getByText("path:/plan")).toBeInTheDocument(),
        );
      });

      it("generates nothing when declined", async () => {
        let planCalls = 0;
        serveReply("<ADD_PLAN></ADD_PLAN>");
        server.use(
          http.post(rest("weekly_plans"), () => {
            planCalls++;
            return HttpResponse.json({ id: "plan-1" });
          }),
        );
        renderChat();
        await openChat();
        await ask("plan my week");

        const dialog = await screen.findByRole("alertdialog");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Cancel" }),
        );

        expect(
          await screen.findByText("Canceled plan generation"),
        ).toBeInTheDocument();
        expect(planCalls).toBe(0);
      });

      it("shows PlanShapeError's own wording when nothing plan-shaped comes back", async () => {
        serveEdgeByMode({
          chat: () => HttpResponse.json({ text: "<ADD_PLAN></ADD_PLAN>" }),
          plan: () => HttpResponse.json({ text: "no plan for you" }),
        });
        renderChat();
        await openChat();
        await ask("plan my week");

        const dialog = await screen.findByRole("alertdialog");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Generate Plan" }),
        );

        expect(
          await screen.findByText(
            "Couldn't generate a plan this time. Please try again.",
          ),
        ).toBeInTheDocument();
      });

      /* A 4xx keeps this from also exercising the client's own retry path,
         which would just slow the test down for no extra coverage. */
      it("falls back to a generic toast for a plain transport failure", async () => {
        serveEdgeByMode({
          chat: () => HttpResponse.json({ text: "<ADD_PLAN></ADD_PLAN>" }),
          plan: () =>
            HttpResponse.json({ error: "Bad request" }, { status: 400 }),
        });
        renderChat();
        await openChat();
        await ask("plan my week");

        const dialog = await screen.findByRole("alertdialog");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Generate Plan" }),
        );

        expect(
          await screen.findByText(
            "Failed to generate your weekly plan. Please try again.",
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe("suggestion chips", () => {
    it("sends the ones marked auto-send", async () => {
      serveReply("Here are your tasks.");
      renderChat();
      const panel = await openChat();

      await userEvent.click(
        within(panel).getByRole("button", { name: /What are my tasks\?/ }),
      );

      expect(
        await screen.findByText("Here are your tasks."),
      ).toBeInTheDocument();
    });

    /* This chip used to fire "Start a 25-minute focus timer" immediately, so
       tapping it silently committed the student to 25 minutes. */
    it("drops the timer chip's unfinished prompt into the box instead", async () => {
      renderChat();
      const panel = await openChat();

      await userEvent.click(
        within(panel).getByRole("button", { name: /Start a timer/ }),
      );

      expect(
        screen.getByRole("textbox", { name: "AI chat input" }),
      ).toHaveValue("Start a focus timer for ");
    });
  });

  describe("attachments", () => {
    it("shows a pill for the attached file and lets it be removed", async () => {
      renderChat();
      const panel = await openChat();
      const input = panel.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      await userEvent.upload(
        input,
        new File(["hello"], "notes.txt", { type: "text/plain" }),
      );

      expect(await screen.findByText("notes.txt")).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove notes.txt" }),
      );
      expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
    });

    it("inlines a text file into the prompt rather than sending it as a blob", async () => {
      let body: { history?: { content: string }[]; file?: unknown } | undefined;
      server.use(
        http.post(EDGE_URL, async ({ request }) => {
          body = (await request.json()) as typeof body;
          return HttpResponse.json({ text: "read it" });
        }),
      );
      renderChat();
      const panel = await openChat();
      const input = panel.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      await userEvent.upload(
        input,
        new File(["mitosis has four phases"], "notes.txt", {
          type: "text/plain",
        }),
      );
      await screen.findByText("notes.txt");
      await ask("summarise this");
      await screen.findByText("read it");

      expect(body?.file).toBeFalsy();
      expect(body?.history?.at(-1)?.content).toContain(
        "mitosis has four phases",
      );
    });

    it("clears the attachment once it has been sent", async () => {
      serveReply("done");
      renderChat();
      const panel = await openChat();
      const input = panel.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      await userEvent.upload(
        input,
        new File(["x"], "notes.txt", { type: "text/plain" }),
      );
      await screen.findByText("notes.txt");
      await ask("go");
      await screen.findByText("done");

      /* The name survives on the sent message, but the composer's pill is
         gone — an attachment belongs to the message it went with. */
      expect(
        screen.queryByRole("button", { name: "Remove notes.txt" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("flashcard replies", () => {
    it("lists the cards instead of dumping raw JSON", async () => {
      serveReply(
        JSON.stringify([
          { front: "Mitochondrion", back: "Makes ATP" },
          { front: "Ribosome", back: "Builds proteins" },
          { front: "Nucleus", back: "Holds DNA" },
        ]),
      );
      renderChat();
      await openChat();
      await ask("make me flashcards");

      expect(await screen.findByText("Mitochondrion")).toBeInTheDocument();
      expect(screen.getByText("Makes ATP")).toBeInTheDocument();
      expect(screen.queryByText(/"front"/)).not.toBeInTheDocument();
    });

    /* A conversational answer that happens to quote a card or two must not be
       swallowed by a card list (js/ai.js:1309-1315). */
    it("leaves a conversational reply that only quotes a card alone", async () => {
      serveReply(
        'Here is an example: {"front": "A", "back": "B"} — want more?',
      );
      renderChat();
      await openChat();
      await ask("show me an example card");

      expect(await screen.findByText(/want more\?/)).toBeInTheDocument();
    });

    /** Echoes each inserted row back the way PostgREST does for `.select()` —
     *  same pattern MaterialPanel.test.tsx uses for the Create pipeline's
     *  own deck/card inserts. */
    function serveDeckWrites() {
      const echo = (table: string, id: string) =>
        http.post(rest(table), async ({ request }) => {
          const rows = (await request.json()) as Record<string, unknown>[];
          return HttpResponse.json(
            rows.length === 1
              ? { id, ...rows[0] }
              : rows.map((r) => ({ id, ...r })),
            { status: 201 },
          );
        });
      server.use(
        echo("flashcard_decks", "deck-1"),
        echo("flashcards", "card-1"),
      );
    }

    /* Previously the only way to keep a chat-generated set was to notice and
       manually redo the whole thing through +Create — this is the fix. */
    it("saves the set as a real deck the student can review later", async () => {
      serveReply(
        JSON.stringify([
          { front: "Mitochondrion", back: "Makes ATP" },
          { front: "Ribosome", back: "Builds proteins" },
          { front: "Nucleus", back: "Holds DNA" },
        ]),
      );
      serveDeckWrites();
      renderChat();
      await openChat();
      await ask("make me flashcards");
      await screen.findByText("Mitochondrion");

      await userEvent.click(
        screen.getByRole("button", { name: "Save as deck" }),
      );

      expect(await screen.findByText("Saved")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save as deck" }),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps the conversation when the panel is closed and reopened", async () => {
    serveReply("first answer");
    renderChat();
    const panel = await openChat();
    await ask("hello");
    await screen.findByText("first answer");

    await userEvent.click(
      within(panel).getByRole("button", { name: "Close AI chat" }),
    );
    await openChat();

    expect(screen.getByText("first answer")).toBeInTheDocument();
  });
});
