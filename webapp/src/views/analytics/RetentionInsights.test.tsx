import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { renderWithProviders } from "../../test/render";
import { RetentionInsights } from "./RetentionInsights";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;
const DAY = 86_400_000;

/** A card the scheduler reviewed `daysAgo` days ago with an `interval`-day
 *  interval — the next_review_date it would have written. */
function reviewed(deck: string, daysAgo: number, interval: number) {
  const reviewDay = new Date(Date.now() - daysAgo * DAY);
  reviewDay.setHours(0, 0, 0, 0);
  const due = new Date(reviewDay);
  due.setDate(due.getDate() + interval);
  return {
    id: `${deck}-${daysAgo}-${interval}-${Math.random()}`,
    user_id: "user-1",
    deck_id: deck,
    front: "f",
    back: "b",
    next_review_date: due.toISOString(),
    srs_interval: interval,
    ease_factor: 2.5,
    stability: interval,
    difficulty: 5,
    created_at: new Date(Date.now() - 60 * DAY).toISOString(),
  };
}

const unreviewed = (deck: string) => ({
  ...reviewed(deck, 0, 1),
  next_review_date: null,
  srs_interval: 0,
  stability: null,
});

function serve(cards: unknown[], misconceptions: unknown[] = []) {
  server.use(
    http.get(rest("flashcards"), () => HttpResponse.json(cards)),
    http.get(rest("flashcard_decks"), () =>
      HttpResponse.json([
        { id: "bio", title: "Cell biology" },
        { id: "hist", title: "WW1 causes" },
        { id: "chem", title: "Acids" },
      ]),
    ),
    http.get(rest("misconceptions"), () => HttpResponse.json(misconceptions)),
  );
}

function renderInsights() {
  return renderWithProviders(<RetentionInsights />, undefined, { withRouter: true });
}

describe("RetentionInsights", () => {
  beforeEach(() => mockAuthSession("user-1"));

  it("says there is nothing to measure before any flashcards exist", async () => {
    serve([]);
    renderInsights();
    expect(await screen.findByText(/No flashcards yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Make a deck" })).toHaveAttribute(
      "href",
      "/library/flashcards",
    );
    expect(screen.queryByText("%")).not.toBeInTheDocument();
  });

  it("says 'not enough reviews yet' instead of inventing a number", async () => {
    serve([unreviewed("bio"), unreviewed("bio")]);
    renderInsights();
    expect(
      await screen.findByText(/Not enough reviews yet\. You have 2 cards waiting/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Predicted recall now/)).not.toBeInTheDocument();
  });

  it("shows what is due, recall now, the weakest decks and each deck's curve", async () => {
    serve(
      [
        // Strong deck: long intervals, reviewed recently.
        reviewed("bio", 1, 30),
        reviewed("bio", 2, 30),
        reviewed("bio", 1, 25),
        // Weak deck: short intervals, well overdue.
        reviewed("hist", 9, 2),
        reviewed("hist", 8, 3),
        reviewed("hist", 7, 2),
        // Too little data: one reviewed card and one new one.
        reviewed("chem", 1, 3),
        unreviewed("chem"),
      ],
      [
        {
          id: "m1",
          subject: "Chemistry",
          concept: "Neutralisation",
          concept_key: "neutralisation",
          summary: "Thinks acids and alkalis cancel to nothing",
          status: "open",
          severity: "high",
          origin_tool: "quiz",
          times_observed: 3,
          times_corrected: 0,
          first_seen_at: new Date(Date.now() - 5 * DAY).toISOString(),
          last_seen_at: new Date(Date.now() - DAY).toISOString(),
          resolved_at: null,
        },
      ],
    );
    renderInsights();

    // All three WW1 cards are overdue.
    const dueNow = (await screen.findByText("Due now")).parentElement!;
    expect(dueNow).toHaveTextContent("3");
    expect(dueNow).toHaveTextContent("3 overdue · 1 new");
    const nextReview = screen.getByText("Recommended next review").parentElement!;
    expect(nextReview).toHaveTextContent("Now");
    expect(within(nextReview).getByRole("link", { name: "Review now" })).toHaveAttribute(
      "href",
      "/review/daily-drill",
    );
    expect(screen.getByText("Predicted recall now").parentElement!).toHaveTextContent(
      /\d+%Across 7 reviewed cards · target 90%/,
    );

    // The weak deck leads the weakest topics, with the ledger's concept below.
    const weakest = screen.getByText("Weakest topics").parentElement!;
    const items = within(weakest).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/WW1 causes\d+% now → \d+% in a week/);
    expect(within(weakest).getByText("Neutralisation")).toBeInTheDocument();
    expect(within(weakest).getByText("Chemistry · seen 3×")).toBeInTheDocument();

    // Per-deck table: a curve where there is data, an honest gap where not.
    const table = screen.getByRole("table", {
      name: "Predicted recall and next review for each flashcard deck",
    });
    const chem = within(table).getByRole("rowheader", { name: "Acids" }).closest("tr")!;
    expect(chem).toHaveTextContent("Not enough reviews yet (1 of 3)");
    expect(within(chem).queryByRole("img")).toBeNull();
    const curve = within(table).getByRole("img", { name: /^WW1 causes: predicted recall \d+% now, \d+% in 30 days/ });

    // Hovering the curve reads out a day.
    Object.defineProperty(curve, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 160, top: 0, height: 40, right: 160, bottom: 40 }),
    });
    fireEvent.pointerMove(curve, { clientX: 80 });
    expect(await screen.findByText(/^In 15 days: \d+%$/)).toBeInTheDocument();
  });
});
