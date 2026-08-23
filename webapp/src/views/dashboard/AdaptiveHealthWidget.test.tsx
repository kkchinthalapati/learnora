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
      await screen.findByText("Memory Decay & Retention"),
    ).toBeInTheDocument();
    expect(await screen.findByText("No cards created yet")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("All memory stable")).toBeInTheDocument();
  });

  it("renders active cards, calculates retention metrics, and navigates on CTA click", async () => {
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
      await screen.findByText("Memory Decay & Retention"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Neuroscience")).toBeInTheDocument();
    expect(await screen.findByText("NMDA Receptors (1)")).toBeInTheDocument();

    const reviewBtn = screen.getByRole("button", {
      name: /Smart Adaptive Review/i,
    });
    expect(reviewBtn).toBeInTheDocument();

    await user.click(reviewBtn);
    expect(
      await screen.findByText("Daily Drill Review Screen"),
    ).toBeInTheDocument();
  });

  it("displays pre-exam surge alert when exams are upcoming within 14 days", async () => {
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
      await screen.findByText(/Pre-Exam Surge Active:/i),
    ).toBeInTheDocument();
  });
});
