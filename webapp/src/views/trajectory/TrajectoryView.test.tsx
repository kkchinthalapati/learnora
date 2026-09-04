import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { resetLifeContextCache } from "../../hooks/useLifeContext";
import {
  DEFAULT_LIFE_CONTEXT,
  LIFE_CONTEXT_KEY,
  createCommitment,
} from "../../lib/lifeContext";
import { dateInDays, localDateStr } from "../../lib/date";
import { TrajectoryView } from "./TrajectoryView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

const TODAY = localDateStr();
const EXAM_DATE = dateInDays(21, TODAY);

const PRO_ROW = {
  plan: "pro",
  plan_status: "active",
  plan_renews_at: null,
  plan_cancel_at_period_end: false,
};

function card(id: string, deckId: string, interval: number) {
  return {
    id,
    user_id: "user-1",
    deck_id: deckId,
    front: "q",
    back: "a",
    next_review_date: dateInDays(interval, TODAY),
    srs_interval: interval,
    ease_factor: 2.5,
    created_at: "2026-08-01T00:00:00Z",
  };
}

function serve({
  pro = true,
  exams = [
    {
      id: 1,
      user_id: "user-1",
      exam_name: "Chemistry",
      exam_date: EXAM_DATE,
      difficulty: "Hard",
      status: "Upcoming",
    },
  ] as unknown[],
  folders = [
    {
      id: "chem",
      user_id: "user-1",
      name: "Chemistry",
      color: "#fff",
      created_at: "",
    },
  ] as unknown[],
  decks = [
    {
      id: "d-strong",
      user_id: "user-1",
      folder_id: "chem",
      title: "Bonding",
      created_at: "",
    },
    {
      id: "d-weak",
      user_id: "user-1",
      folder_id: "chem",
      title: "Titration",
      created_at: "",
    },
  ] as unknown[],
  cards = [
    /* A well-drilled deck and a barely-touched one, so the forecast has a
       real spread to rank rather than two identical topics. */
    ...[1, 2, 3, 4, 5].map((i) => card(`s${i}`, "d-strong", 40)),
    ...[1, 2, 3, 4, 5].map((i) => card(`w${i}`, "d-weak", 1)),
  ] as unknown[],
  attempts = [] as unknown[],
  quizzes = [] as unknown[],
} = {}) {
  server.use(
    http.get(rest("profiles"), () => HttpResponse.json(pro ? [PRO_ROW] : [])),
    http.get(rest("exams"), () => HttpResponse.json(exams)),
    http.get(rest("folders"), () => HttpResponse.json(folders)),
    http.get(rest("flashcard_decks"), () => HttpResponse.json(decks)),
    http.get(rest("flashcards"), () => HttpResponse.json(cards)),
    http.get(rest("quiz_attempts"), () => HttpResponse.json(attempts)),
    http.get(rest("quizzes"), () => HttpResponse.json(quizzes)),
  );
}

/** An attempt of `total` questions on one topic, `correct` of them right. */
function quizAttempt(
  id: string,
  topic: string,
  correct: number,
  total: number,
) {
  return {
    id,
    user_id: "user-1",
    quiz_id: `quiz-${id}`,
    score: correct,
    total,
    answers_json: Array.from({ length: total }, (_, i) => ({
      questionId: `${id}-q${i}`,
      chosenIndex: i < correct ? 0 : 1,
      correct: i < correct,
      topic,
    })),
    weak_topics: null,
    created_at: new Date().toISOString(),
  };
}

function seedLifeContext() {
  localStorage.setItem(
    LIFE_CONTEXT_KEY,
    JSON.stringify({
      ...DEFAULT_LIFE_CONTEXT,
      weekdayCapacityMins: 120,
      weekendCapacityMins: 120,
      commitments: [
        createCommitment({
          label: "Lecture",
          days: [1],
          start: "09:00",
          end: "10:00",
        }),
      ],
    }),
  );
  resetLifeContextCache();
}

function render() {
  return renderWithAuth(
    <TrajectoryView />,
    { session: fakeSession() },
    {
      withTimer: true,
      withRouter: true,
    },
  );
}

describe("TrajectoryView", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLifeContextCache();
    mockAuthSession("user-1");
    seedLifeContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLifeContextCache();
  });

  it("is behind the Pro gate", async () => {
    serve({ pro: false });
    render();
    expect(
      await screen.findByRole("button", { name: /see what pro adds/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Where this is heading/)).toBeNull();
  });

  it("forecasts the next exam for a Pro account", async () => {
    serve();
    render();

    expect(
      await screen.findByText(/Where this is heading/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Chemistry · 21 days away/)).toBeInTheDocument();
    /* The chart's accessible name is the forecast said in words — the only
       part of an SVG a screen reader can use. */
    expect(
      screen.getByRole("img", { name: /Forecast for Chemistry/ }),
    ).toBeInTheDocument();
  });

  it("shows what doing nothing costs", async () => {
    serve();
    render();
    expect(
      await screen.findByText(/What the plan is worth/),
    ).toBeInTheDocument();
    /* The phrase appears twice on purpose — once as the chart legend, once as
       the number beneath it — so this asserts both are present rather than
       picking one and pretending the other does not exist. */
    expect(screen.getAllByText(/If you stop here/)).toHaveLength(2);
  });

  it("ranks the weakest topic as the best use of the next hour", async () => {
    serve();
    render();

    const headline = await screen.findByText(/One 45-minute block on/);
    /* Titration has one-day intervals and Bonding forty; the hour belongs to
       Titration, and this is the sentence the whole feature exists to say. */
    expect(headline).toHaveTextContent(/Titration/);
    expect(
      screen.getByRole("button", {
        name: /Start a 45 minute block on Titration/,
      }),
    ).toBeInTheDocument();
  });

  it("says so when there is no exam to forecast", async () => {
    serve({ exams: [] });
    render();
    expect(
      await screen.findByText(/Nothing to forecast yet/),
    ).toBeInTheDocument();
  });

  it("asks for material rather than forecasting off nothing", async () => {
    serve({ decks: [], cards: [] });
    render();
    expect(await screen.findByText(/Not enough to go on/)).toBeInTheDocument();
  });

  /* No decks means the SRS engine has nothing to project, but a student who
     has been quizzing is not short of evidence — only of the kind Trajectory
     reads. They used to get the empty state above regardless. */
  it("falls back to a quiz-only forecast when there are no decks", async () => {
    serve({
      decks: [],
      cards: [],
      attempts: [
        quizAttempt("a1", "Bonding", 9, 10),
        quizAttempt("a2", "Titration", 3, 10),
      ],
    });
    render();

    // 12/20 = 60%, one measured weak topic (Titration, 30%) → 55 ± 5.
    expect(await screen.findByText(/Chemistry: 50–60/)).toBeInTheDocument();
    expect(screen.getByText(/Titration \(30%\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Not enough to go on/)).not.toBeInTheDocument();
    // The weaker model has to say that it is the weaker model.
    expect(screen.getByText(/rough version/i)).toBeInTheDocument();
  });

  it("offers a picker when there is more than one exam", async () => {
    serve({
      exams: [
        {
          id: 1,
          user_id: "user-1",
          exam_name: "Chemistry",
          exam_date: EXAM_DATE,
          difficulty: "Hard",
          status: "Upcoming",
        },
        {
          id: 2,
          user_id: "user-1",
          exam_name: "Biology",
          exam_date: dateInDays(30, TODAY),
          difficulty: "Medium",
          status: "Upcoming",
        },
      ],
    });
    render();

    const picker = await screen.findByRole("group", {
      name: /choose an exam/i,
    });
    expect(picker).toBeInTheDocument();
    /* Soonest first: the exam that is actually pressing is the one selected. */
    expect(screen.getByRole("button", { name: "Chemistry" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("is honest that it is a model", async () => {
    serve();
    render();
    expect(
      await screen.findByText(/A model, not a promise/),
    ).toBeInTheDocument();
  });
});
