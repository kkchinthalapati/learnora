import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { QuizRunner } from "./QuizRunner";
import { getHintLadder } from "../../api/aiHints";

vi.mock("../../api/aiHints", () => ({ getHintLadder: vi.fn() }));
vi.mock("../../lib/studentLevel", () => ({ studentLevel: vi.fn(async () => "GCSE") }));

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

const QUESTIONS = [
  {
    id: "q1",
    question: "What is the gradient of y = 3x + 2?",
    choices: ["2", "3", "5"],
    correctIndex: 1,
    topic: "Straight-line graphs",
    feedback: "In y = mx + c the gradient is m.",
  },
  { id: "q2", question: "What is 2 + 2?", choices: ["3", "4"], correctIndex: 1, topic: "Arithmetic" },
];

const LADDER = {
  nudge: "Think about y = mx + c.",
  step: "Which number multiplies x?",
  worked: "m multiplies x, and here m = 3, so the gradient is 3.",
};

let attempts: Array<{ answers_json?: unknown; score?: number }> = [];

function serve() {
  attempts = [];
  server.use(
    http.get(rest("quizzes"), () =>
      HttpResponse.json([
        {
          id: "quiz-1",
          user_id: "user-1",
          material_id: null,
          folder_id: null,
          title: "Maths",
          questions_json: QUESTIONS,
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ]),
    ),
    http.post(rest("quiz_attempts"), async ({ request }) => {
      const body = (await request.json()) as never;
      attempts.push(...(Array.isArray(body) ? body : [body]));
      return new HttpResponse(null, { status: 201 });
    }),
  );
}

function renderRunner() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/quiz/quiz-1"]}>
      <Routes>
        <Route path="/quiz/:quizId" element={<QuizRunner />} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

beforeEach(() => {
  localStorage.clear();
  mockAuthSession("user-1");
  vi.mocked(getHintLadder).mockReset().mockResolvedValue({ ladder: LADDER });
  serve();
});

describe("QuizRunner hint ladder", () => {
  it("climbs nudge → step → worked solution, never showing the answer early", async () => {
    const user = userEvent.setup();
    renderRunner();
    await user.click(await screen.findByRole("button", { name: /I'm stuck/ }));
    expect(await screen.findByText(LADDER.nudge)).toBeInTheDocument();
    expect(screen.queryByText(LADDER.worked)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Show the worked solution|Another hint/ }));
    expect(await screen.findByText(LADDER.step)).toBeInTheDocument();
    expect(screen.queryByText(LADDER.worked)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show the worked solution" }));
    expect(await screen.findByText(LADDER.worked)).toBeInTheDocument();
    expect(screen.getAllByText(/comes back as a fresh question/i).length).toBeGreaterThan(0);
    // Answered now: the choices are locked.
    expect(screen.getByRole("button", { name: "3" })).toBeDisabled();
  });

  it("'just tell me' is acknowledged with the next rung, never refused", async () => {
    const user = userEvent.setup();
    renderRunner();
    await user.click(await screen.findByRole("button", { name: /I'm stuck/ }));
    await user.click(await screen.findByRole("button", { name: "Just tell me the answer" }));
    expect(await screen.findByText(LADDER.step)).toBeInTheDocument();
    expect(screen.getByText(/Fair enough/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(can't|cannot|won't) (give|tell)/i);
  });

  it("the full ladder is recorded as a wrong answer", async () => {
    const user = userEvent.setup();
    renderRunner();
    await user.click(await screen.findByRole("button", { name: /I'm stuck/ }));
    await user.click(await screen.findByRole("button", { name: /Another hint|Show the worked/ }));
    await user.click(await screen.findByRole("button", { name: "Show the worked solution" }));
    await user.click(screen.getByRole("button", { name: /Next Question/ }));
    await user.click(await screen.findByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /See results/ }));

    await waitFor(() => expect(attempts).toHaveLength(1));
    expect(attempts[0].score).toBe(1);
    expect(attempts[0].answers_json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionId: "q1", correct: false, chosenIndex: -1, hintRung: 3 }),
      ]),
    );
  });

  it("a hint used before a right answer travels with it", async () => {
    const user = userEvent.setup();
    renderRunner();
    await user.click(await screen.findByRole("button", { name: /I'm stuck/ }));
    await screen.findByText(LADDER.nudge);
    await user.click(screen.getByRole("button", { name: "3" }));
    await user.click(screen.getByRole("button", { name: /Next Question/ }));
    await user.click(await screen.findByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /See results/ }));
    await waitFor(() => expect(attempts).toHaveLength(1));
    expect(attempts[0].answers_json).toEqual(
      expect.arrayContaining([expect.objectContaining({ questionId: "q1", correct: true, hintRung: 1 })]),
    );
  });

  it("the rung survives a reload", async () => {
    const user = userEvent.setup();
    const first = renderRunner();
    await user.click(await screen.findByRole("button", { name: /I'm stuck/ }));
    await screen.findByText(LADDER.nudge);
    first.unmount();

    renderRunner();
    // Resume prompt may appear for the in-progress draft.
    const resume = await screen.findByRole("button", { name: /Resume|Continue/ }).catch(() => null);
    if (resume) await user.click(resume);
    expect(await screen.findByText(LADDER.nudge)).toBeInTheDocument();
    // Restored at the same rung: no step, no worked solution.
    expect(screen.queryByText(LADDER.step)).toBeNull();
  });
});

describe("the worked solution hands the question to the mistake loop", () => {
  it("writes the miss and a repair, so a retest is scheduled", async () => {
    const observations: Array<Record<string, unknown>> = [];
    server.use(
      http.get(rest("misconceptions"), () => HttpResponse.json([])),
      http.post(rest("misconceptions"), async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "m-1",
          status: "open",
          times_observed: 0,
          times_corrected: 0,
          first_seen_at: "2026-10-06T00:00:00Z",
          last_seen_at: "2026-10-06T00:00:00Z",
          resolved_at: null,
          origin_tool: "quiz",
          ...body,
        });
      }),
      http.post(rest("misconception_observations"), async ({ request }) => {
        observations.push((await request.json()) as Record<string, unknown>);
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderRunner();
    await user.click(await screen.findByRole("button", { name: /I'm stuck/ }));
    await user.click(await screen.findByRole("button", { name: /Another hint|Show the worked/ }));
    await user.click(await screen.findByRole("button", { name: "Show the worked solution" }));
    await user.click(screen.getByRole("button", { name: /Next Question/ }));
    await user.click(await screen.findByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /See results/ }));

    /* The repair is written after the (failing, retried) AI labelling call,
       which is slower on CI runners than the 1 s waitFor default. */
    await waitFor(() => expect(observations.some((o) => o.kind === "repair")).toBe(true), { timeout: 8000 });
    const evidence = observations.find((o) => o.kind === "evidence")!;
    const repair = observations.find((o) => o.kind === "repair")!;
    expect(evidence.detail).toMatch(/worked solution/);
    expect(repair.question_key).toBe(evidence.question_key);
    expect(repair.due_at).toBeTruthy();
  });
});

describe("questions pulled after reports", () => {
  it("are skipped, and every question offers 'Report a problem'", async () => {
    const { questionRef } = await import("../../lib/questionVetting");
    const pulled = questionRef(QUESTIONS[0], "quiz-1");
    server.use(http.get(rest("question_flags"), () => HttpResponse.json([{ question_ref: pulled }])));
    renderRunner();
    expect(await screen.findByRole("heading", { name: /What is 2 \+ 2/ })).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeInTheDocument();
  });

  it("an unverified question is labelled", async () => {
    server.use(
      http.get(rest("quizzes"), () =>
        HttpResponse.json([
          {
            id: "quiz-1",
            user_id: "user-1",
            material_id: null,
            folder_id: null,
            title: "Mixed",
            questions_json: [{ ...QUESTIONS[1], verified: false }],
            created_at: "2026-07-01T00:00:00.000Z",
          },
        ]),
      ),
    );
    renderRunner();
    expect(await screen.findByText(/Unverified: our answer checker couldn't confirm/)).toBeInTheDocument();
  });
});
