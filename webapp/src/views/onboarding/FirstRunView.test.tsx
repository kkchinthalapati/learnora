import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { ONBOARDING_LOCAL_KEY } from "../../lib/onboarding";
import { WelcomeView } from "./WelcomeView";

const generate = vi.fn();
const addDeck = vi.fn();
const addCards = vi.fn();
const recordEvent = vi.fn(async () => true);
vi.mock("../../api/firstLesson", async (orig) => ({
  ...(await orig<typeof import("../../api/firstLesson")>()),
  generateFirstLesson: (...a: unknown[]) => generate(...a),
}));
vi.mock("../../api/learningEvents", () => ({ learningEventsApi: { record: (...a: unknown[]) => recordEvent(...(a as [])) } }));
vi.mock("../../api/decks", async (orig) => {
  const real = await orig<typeof import("../../api/decks")>();
  return { ...real, decksApi: { ...real.decksApi, add: (...a: unknown[]) => addDeck(...a) } };
});
vi.mock("../../api/flashcards", async (orig) => {
  const real = await orig<typeof import("../../api/flashcards")>();
  return {
    ...real,
    flashcardsApi: { ...real.flashcardsApi, addBatch: (...a: unknown[]) => addCards(...a) },
  };
});

const newUser = fakeSession({
  created_at: "2026-12-01T00:00:00.000Z",
  user_metadata: { full_name: "Ada Lovelace" },
});

const questions = [
  {
    question: "If you double the price, what happens to demand?",
    choices: ["It rises", "It falls", "No change"],
    correctIndex: 1,
    feedback: "Higher prices mean fewer buyers.",
  },
  {
    question: "Which way does a demand curve slope?",
    choices: ["Up", "Down"],
    correctIndex: 1,
  },
];
const lesson = {
  concept: "The law of demand",
  hook: questions[0],
  explanation: "When something costs more, fewer people buy it. Think of a café raising its coffee price.",
  check: questions[1],
};

function render(path = "/welcome") {
  return renderWithAuth(<WelcomeView />, { session: newUser }, { initialEntries: [path] });
}

beforeEach(() => {
  localStorage.clear();
  mockAuthSession("user-1");
  generate.mockReset().mockResolvedValue(lesson);
  recordEvent.mockClear();
  addDeck.mockReset().mockResolvedValue({ id: "deck-1" });
  addCards.mockReset().mockResolvedValue([]);
  server.use(
    http.put(`${SUPABASE_URL}/auth/v1/user`, () => HttpResponse.json({ user: newUser.user })),
  );
});

describe("FirstRunView", () => {
  it("asks one question first, by name, with no preferences before the lesson", async () => {
    render();
    expect(
      await screen.findByRole("heading", { level: 1, name: /ada, what are you studying/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^start$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /drop notes/i })).toBeInTheDocument();
  });

  it("runs topic → guess → lesson → check on the same idea → win, and saves answerable cards", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "GCSE" }));
    await user.type(await screen.findByLabelText(/what you're studying/i), "Supply and demand");
    await user.click(screen.getByRole("button", { name: /^start$/i }));

    expect(generate).toHaveBeenCalledTimes(1);
    /* The level chosen on the first screen reaches the lesson prompt. */
    expect(generate.mock.calls[0]).toEqual(["Supply and demand", "GCSE"]);

    await screen.findByText(questions[0].question);
    expect(screen.getByText(/no penalty for guessing/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /it rises/i }));
    expect(screen.getByText(/✕ your guess: it rises/i)).toBeInTheDocument();
    expect(screen.getByText(/✓ answer: it falls/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show me how/i }));

    /* "Show me how" shows the lesson before any check. */
    expect(await screen.findByText(/think of a café/i)).toBeInTheDocument();
    expect(screen.queryByText(questions[1].question)).toBeNull();
    await user.click(screen.getByRole("button", { name: /check me/i }));

    await screen.findByText(questions[1].question);
    await user.click(screen.getByRole("button", { name: /down/i }));
    expect(screen.getByText(/✓ right\./i)).toBeInTheDocument();
    /* The check is evidence Today will read, on the deck's topic. */
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ topicKey: "supply and demand", score: 1, source: "quick_check" }),
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByRole("heading", { level: 1, name: /first idea in supply and demand/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(addCards).toHaveBeenCalledTimes(1));
    expect(addDeck).toHaveBeenCalledWith(null, "Supply and demand");
    const [hookCard, checkCard] = addCards.mock.calls[0][1];
    expect(hookCard.front).toContain("A) It rises");
    expect(hookCard.back).toContain("It falls");
    expect(hookCard.back).toContain("Think of a café");
    expect(checkCard.front).toContain(questions[1].question);
    expect(screen.getByRole("heading", { level: 2, name: /two questions/i })).toBeInTheDocument();
  });

  it("saves the exam with the specification its topic suggests, at the superset tier", async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown>[] | undefined;
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/exams`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>[];
        return new HttpResponse(null, { status: 201 });
      }),
    );
    render();
    await user.click(await screen.findByRole("button", { name: "GCSE" }));
    await user.type(await screen.findByLabelText(/what you're studying/i), "Biology photosynthesis");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    await user.click(await screen.findByRole("button", { name: /it falls/i }));
    await user.click(screen.getByRole("button", { name: /show me how/i }));
    await user.click(await screen.findByRole("button", { name: /check me/i }));
    await user.click(await screen.findByRole("button", { name: /down/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const future = new Date();
    future.setDate(future.getDate() + 60);
    const date = future.toISOString().slice(0, 10);
    const dateInput = await screen.findByLabelText(/when is your exam/i);
    await user.type(dateInput, date);
    const board = screen.getByLabelText(/which exam board/i);
    expect(board).toHaveValue("aqa-gcse-biology-8461");
    await user.click(screen.getByRole("button", { name: /save and see my plan/i }));

    await waitFor(() => expect(posted).toBeDefined());
    expect(posted![0]).toMatchObject({
      syllabus_id: "aqa-gcse-biology-8461",
      syllabus_tier: "Higher",
    });
  });

  it("offers retry and a way out when the lesson fails to load", async () => {
    generate.mockRejectedValueOnce(new Error("busy"));
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "Causes of WW1" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again|retry/i }));
    await screen.findByText(questions[0].question);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("keeps the topic when the lesson fails and they skip, and Study offers it", async () => {
    generate.mockRejectedValue(new Error("busy"));
    const user = userEvent.setup();
    render();
    await user.type(await screen.findByLabelText(/what you're studying/i), "Mitochondria");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    await user.click(await screen.findByRole("button", { name: /skip to my plan/i }));
    const { readPendingTopic } = await import("../../lib/pendingTopic");
    await waitFor(() => expect(readPendingTopic("user-1")).toBe("Mitochondria"));
  });

  it("counts a skip as set up so the gate lets them through", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: /skip for now/i }));
    await waitFor(() => expect(localStorage.getItem(ONBOARDING_LOCAL_KEY)).toContain("user-1"));
  });

  it("keeps the full setup wizard for a replay from Settings", async () => {
    render("/welcome?replay=1");
    expect(
      await screen.findByRole("button", { name: /let's set it up/i }),
    ).toBeInTheDocument();
  });
});
