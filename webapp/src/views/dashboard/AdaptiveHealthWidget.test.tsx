import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { localDateStr } from "../../lib/date";
import { AdaptiveHealthWidget } from "./AdaptiveHealthWidget";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function renderWidget() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<AdaptiveHealthWidget />} />
        <Route
          path="/review/daily-drill"
          element={<h1>Daily Drill Review Screen</h1>}
        />
        <Route
          path="/library/flashcards"
          element={<h1>Flashcards Library</h1>}
        />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

describe("AdaptiveHealthWidget", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empty/default state when user has no cards", async () => {
    server.use(
      http.get(rest("flashcards"), () => HttpResponse.json([])),
      http.get(rest("folders"), () => HttpResponse.json([])),
    );

    renderWidget();

    expect(
      await screen.findByText("What’s sticking, what’s slipping"),
    ).toBeInTheDocument();
    expect(await screen.findByText("No cards yet")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Nothing slipping right now")).toBeInTheDocument();
  });

  it("shows an error state instead of a false '100% / no cards' reading when a query fails", async () => {
    server.use(
      http.get(rest("flashcards"), () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderWidget();

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("We couldn’t load your revision data.");
    expect(screen.queryByText("No cards yet")).not.toBeInTheDocument();
    expect(screen.queryByText("100")).not.toBeInTheDocument();
  });

  it("renders active cards, works out the numbers, and navigates on CTA click", async () => {
    const user = userEvent.setup();

    const now = new Date();
    const futureReview = new Date(
      now.getTime() + 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const pastReview = new Date(
      now.getTime() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();

    server.use(
      http.get(rest("folders"), () =>
        HttpResponse.json([
          {
            id: "f1",
            user_id: "user-1",
            name: "Neuroscience",
            color: "#0f766e",
            created_at: now.toISOString(),
          },
        ]),
      ),
      http.get(rest("flashcard_decks"), () =>
        HttpResponse.json([
          {
            id: "d1",
            user_id: "user-1",
            folder_id: "f1",
            title: "Synaptic Plasticity",
            created_at: now.toISOString(),
          },
        ]),
      ),
      http.get(rest("flashcards"), () =>
        HttpResponse.json([
          {
            id: "c1",
            user_id: "user-1",
            deck_id: "d1",
            front: "LTP definition",
            back: "Long-term potentiation",
            srs_interval: 10,
            ease_factor: 2.5,
            next_review_date: futureReview,
            created_at: now.toISOString(),
          },
          {
            id: "c2",
            user_id: "user-1",
            deck_id: "d1",
            front: "LTD definition",
            back: "Long-term depression",
            srs_interval: 1,
            ease_factor: 2.0,
            next_review_date: pastReview,
            created_at: now.toISOString(),
          },
        ]),
      ),
      http.get(rest("quiz_attempts"), () =>
        HttpResponse.json([
          {
            id: "qa1",
            user_id: "user-1",
            quiz_id: "q1",
            score: 9,
            total: 10,
            answers_json: {},
            weak_topics: ["NMDA Receptors"],
            created_at: now.toISOString(),
          },
        ]),
      ),
    );

    renderWidget();

    expect(
      await screen.findByText("What’s sticking, what’s slipping"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Neuroscience")).toBeInTheDocument();
    expect(await screen.findByText("NMDA Receptors (1)")).toBeInTheDocument();

    const reviewBtn = screen.getByRole("button", {
      name: /Go over what's slipping/i,
    });
    expect(reviewBtn).toBeInTheDocument();

    await user.click(reviewBtn);
    expect(
      await screen.findByText("Daily Drill Review Screen"),
    ).toBeInTheDocument();
  });

  it("displays the exam-coming-up alert when exams are within 14 days", async () => {
    const now = new Date();
    const examDate = localDateStr(
      new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
    );

    server.use(
      http.get(rest("exams"), () =>
        HttpResponse.json([
          {
            id: 1,
            user_id: "user-1",
            exam_name: "Neuroscience Final",
            exam_date: examDate,
            difficulty: "hard",
            status: "upcoming",
          },
        ]),
      ),
      http.get(rest("folders"), () =>
        HttpResponse.json([
          {
            id: "f1",
            user_id: "user-1",
            name: "Neuroscience",
            color: "#0f766e",
            created_at: now.toISOString(),
          },
        ]),
      ),
      http.get(rest("flashcard_decks"), () =>
        HttpResponse.json([
          {
            id: "d1",
            user_id: "user-1",
            folder_id: "f1",
            title: "Deck 1",
            created_at: now.toISOString(),
          },
        ]),
      ),
      http.get(rest("flashcards"), () =>
        HttpResponse.json([
          {
            id: "c1",
            user_id: "user-1",
            deck_id: "d1",
            front: "Question 1",
            back: "Answer 1",
            srs_interval: 2,
            ease_factor: 2.5,
            next_review_date: now.toISOString(),
            created_at: now.toISOString(),
          },
        ]),
      ),
    );

    renderWidget();

    expect(
      await screen.findByText(/Exam coming up:/i),
    ).toBeInTheDocument();
  });

  it("computes and displays how ready you are, with the breakdown", async () => {
    const now = new Date();
    server.use(
      http.get(rest("materials"), () =>
        HttpResponse.json([
          {
            id: "m1",
            user_id: "user-1",
            folder_id: "f1",
            title: "Cell Biology Notes",
            type: "text",
            raw_content: "Extensive study guide covering membrane transport and organelles.",
            created_at: now.toISOString(),
          },
        ]),
      ),
      http.get(rest("folders"), () =>
        HttpResponse.json([
          {
            id: "f1",
            user_id: "user-1",
            name: "Biology",
            color: "#0f766e",
            created_at: now.toISOString(),
          },
        ]),
      ),
      http.get(rest("flashcards"), () =>
        HttpResponse.json([
          {
            id: "c1",
            user_id: "user-1",
            deck_id: "d1",
            front: "Organelle",
            back: "Function",
            srs_interval: 5,
            ease_factor: 2.5,
            next_review_date: new Date(now.getTime() + 86400000).toISOString(),
            created_at: now.toISOString(),
          },
        ]),
      ),
      http.get(rest("quiz_attempts"), () =>
        HttpResponse.json([
          {
            id: "qa1",
            user_id: "user-1",
            quiz_id: "q1",
            score: 9,
            total: 10,
            answers_json: {},
            weak_topics: [],
            created_at: now.toISOString(),
          },
        ]),
      ),
    );

    renderWidget();

    expect(await screen.findByText("How ready you are")).toBeInTheDocument();
    expect(screen.getByText(/Covered:/i)).toBeInTheDocument();
    expect(screen.getByText(/Cards:/i)).toBeInTheDocument();
    expect(screen.getByText(/Quiz:/i)).toBeInTheDocument();
  });
});

