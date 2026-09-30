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
vi.mock("../../api/aiQuiz", async (orig) => ({
  ...(await orig<typeof import("../../api/aiQuiz")>()),
  generateQuizQuestions: (...a: unknown[]) => generate(...a),
}));
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

function render(path = "/welcome") {
  return renderWithAuth(<WelcomeView />, { session: newUser }, { initialEntries: [path] });
}

beforeEach(() => {
  localStorage.clear();
  mockAuthSession("user-1");
  generate.mockReset().mockResolvedValue(questions);
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

  it("runs topic → guess → check → win and saves the lesson as flashcards", async () => {
    const user = userEvent.setup();
    render();
    await user.type(await screen.findByLabelText(/what you're studying/i), "Supply and demand");
    await user.click(screen.getByRole("button", { name: /^start$/i }));

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toMatchObject({
      options: { questionCount: 2, difficulty: "Easy" },
    });

    await screen.findByText(questions[0].question);
    expect(screen.getByText(/no penalty for guessing/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /it rises/i }));
    /* A wrong guess shows both the guess and the answer, each with a glyph. */
    expect(screen.getByText(/✕ your guess: it rises/i)).toBeInTheDocument();
    expect(screen.getByText(/✓ answer: it falls/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show me how/i }));

    await screen.findByText(questions[1].question);
    await user.click(screen.getByRole("button", { name: /down/i }));
    expect(screen.getByText(/✓ right\./i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByRole("heading", { level: 1, name: /first idea in supply and demand/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(addCards).toHaveBeenCalledTimes(1));
    expect(addDeck).toHaveBeenCalledWith(null, "Supply and demand");
    expect(addCards.mock.calls[0][1]).toEqual([
      { front: questions[0].question, back: "It falls" },
      { front: questions[1].question, back: "Down" },
    ]);
    expect(screen.getByRole("heading", { level: 2, name: /two questions/i })).toBeInTheDocument();
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
