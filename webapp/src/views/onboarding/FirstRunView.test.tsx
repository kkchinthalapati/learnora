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
const fetchBank = vi.fn();
vi.mock("../../api/questionBank", async (orig) => ({
  ...(await orig<typeof import("../../api/questionBank")>()),
  fetchBankQuestions: (...a: unknown[]) => fetchBank(...a),
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
const lesson = {
  concept: "The law of demand",
  hook: questions[0],
  explanation: "When something costs more, fewer people buy it. Think of a café raising its coffee price.",
  check: questions[1],
};

function render(path = "/welcome") {
  return renderWithAuth(<WelcomeView />, { session: newUser }, { initialEntries: [path] });
}

/* Since the 2026-10 revamp the board comes first; the value-first topic
   path is one click behind it. */
async function topicPath(user = userEvent.setup()) {
  await user.click(await screen.findByRole("button", { name: "Start from one topic instead" }));
  return user;
}

beforeEach(() => {
  localStorage.clear();
  mockAuthSession("user-1");
  generate.mockReset().mockResolvedValue(lesson);
  recordEvent.mockClear();
  fetchBank.mockReset().mockResolvedValue([]);
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
      await screen.findByRole("heading", { level: 1, name: "Ada, what are you studying for?" }),
    ).toBeInTheDocument();
    await topicPath();
    expect(
      await screen.findByRole("heading", { level: 1, name: /ada, what are you studying/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^start$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /drop notes/i })).toBeInTheDocument();
  });

  it("runs topic → guess → lesson → check on the same idea → win, and saves answerable cards", async () => {
    const user = userEvent.setup();
    render();
    await topicPath(user);
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
    await topicPath(user);
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
    await topicPath(user);
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
    await topicPath(user);
    await user.type(await screen.findByLabelText(/what you're studying/i), "Mitochondria");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    await user.click(await screen.findByRole("button", { name: /skip to my plan/i }));
    const { readPendingTopic } = await import("../../lib/pendingTopic");
    await waitFor(() => expect(readPendingTopic("user-1")).toBe("Mitochondria"));
  });

  it("counts a skip as set up so the gate lets them through", async () => {
    const user = userEvent.setup();
    render();
    await topicPath(user);
    await user.click(await screen.findByRole("button", { name: /skip for now/i }));
    await waitFor(() => expect(localStorage.getItem(ONBOARDING_LOCAL_KEY)).toContain("user-1"));
  });

  it("board first: Ready / Partly ready labels, and honesty for a partly-ready pick", async () => {
    const user = userEvent.setup();
    render();
    const aqa = await screen.findByRole("radio", { name: /AQA GCSE Biology \(8461\)/ });
    expect(aqa.closest("label")).toHaveTextContent("Ready");
    const ib = screen.getByRole("radio", { name: /IB Biology/ });
    expect(ib.closest("label")).toHaveTextContent("Partly ready");
    await user.click(ib);
    expect(screen.getByText(/no checked questions for it yet/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /ICSE Class 10/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Not doing exams yet/ })).toBeInTheDocument();
  });

  it("Ready board: 2-minute check from the bank → where you're starting → straight into practice", async () => {
    const { getSpec } = await import("../../lib/syllabus");
    const spec = getSpec("aqa-gcse-biology-8461")!;
    const topics = spec.topics.slice(0, 4);
    fetchBank.mockResolvedValue(
      topics.map((t, i) => ({
        id: `b${i}`, source: "learnora", source_ref: null, licence: "learnora", attribution: null,
        spec_key: spec.id, topic_ref: t.ref, tier: null, question: `Question on ${t.title}?`,
        choices: ["Right", "Wrong"], correct_index: 0, explanation: null,
      })),
    );
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("radio", { name: /AQA GCSE Biology \(8461\)/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    /* No AI wait: bank questions, auto-advancing, with "not learnt" as an option. */
    for (let i = 0; i < 4; i++) {
      expect(await screen.findByText(`2-minute check · ${i + 1} of 4`)).toBeInTheDocument();
      if (i === 2) await user.click(screen.getByRole("button", { name: "I haven’t learnt this yet" }));
      else await user.click(screen.getByRole("button", { name: i === 1 ? /Wrong/ : /Right/ }));
    }
    expect(generate).not.toHaveBeenCalled();
    /* Three real answers recorded as evidence; "not learnt" writes nothing. */
    expect(recordEvent).toHaveBeenCalledTimes(3);

    expect(await screen.findByRole("heading", { level: 1, name: "Here’s where you’re starting." })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "You know this" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Worth a look first" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Not learnt yet, and that’s fine" })).toBeInTheDocument();
    expect(screen.queryByText(/score|%/i)).toBeNull();

    /* The paper comes from the board's own papers. */
    expect(screen.getByRole("button", { name: new RegExp(`^${spec.papers[0].name} ·`) })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "20 min" }));
    await user.click(screen.getByRole("button", { name: "Start · 20 min" }));
    await waitFor(() => expect(localStorage.getItem(ONBOARDING_LOCAL_KEY)).toContain("user-1"));
  });

  it("Partly-ready board: per-chapter 'How sure are you?' with no AI wait", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("radio", { name: /IB Biology/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { level: 1, name: "How sure are you about each chapter?" })).toBeInTheDocument();
    expect(fetchBank).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Not sure" })[0]);
    await user.click(screen.getByRole("button", { name: "See where I’m starting" }));
    expect(await screen.findByRole("region", { name: "Worth a look first" })).toBeInTheDocument();
    /* Self-report is never written as evidence. */
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("keeps the full setup wizard for a replay from Settings", async () => {
    render("/welcome?replay=1");
    expect(
      await screen.findByRole("button", { name: /let's set it up/i }),
    ).toBeInTheDocument();
  });
});
