import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { StudyThisNowCard } from "./StudyThisNowCard";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

/** Far enough ahead that the fixture stays upcoming as the suite ages. */
const soon = () => {
  const d = new Date();
  d.setDate(d.getDate() + 4);
  return d.toISOString().slice(0, 10);
};

const ledgerRow = (over: Record<string, unknown> = {}) => ({
  id: "m-1",
  subject: "Physics",
  concept: "Momentum in 2D collisions",
  concept_key: "momentum 2d collisions",
  summary: "Treats momentum as a scalar, so direction is dropped.",
  status: "open",
  severity: "moderate",
  origin_tool: "quiz",
  times_observed: 3,
  times_corrected: 0,
  first_seen_at: "2026-09-01T10:00:00Z",
  last_seen_at: "2026-09-20T10:00:00Z",
  resolved_at: null,
  ...over,
});

function serve(options: {
  exams?: unknown[];
  misconceptions?: unknown[];
  folders?: unknown[];
}) {
  server.use(
    http.get(rest("exams"), () => HttpResponse.json(options.exams ?? [])),
    http.get(rest("folders"), () => HttpResponse.json(options.folders ?? [])),
    http.get(rest("misconceptions"), () =>
      HttpResponse.json(options.misconceptions ?? []),
    ),
  );
}

function renderCard() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<StudyThisNowCard />} />
        <Route path="/timer" element={<h1>Timer Page</h1>} />
        <Route path="/solver" element={<h1>Solver Page</h1>} />
        <Route path="/study" element={<h1>Study Page</h1>} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
    { withTimer: true },
  );
}

describe("StudyThisNowCard", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  it("names the concept, the exam and the evidence behind the pick", async () => {
    serve({
      exams: [
        {
          id: 1,
          user_id: "user-1",
          exam_name: "Physics Paper 1",
          exam_date: soon(),
          difficulty: null,
          status: null,
          folder_id: "f-physics",
        },
      ],
      folders: [{ id: "f-physics", user_id: "user-1", name: "Physics" }],
      misconceptions: [ledgerRow()],
    });
    renderCard();

    expect(
      await screen.findByRole("heading", { name: "Momentum in 2D collisions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Study this now")).toBeInTheDocument();
    expect(
      screen.getByText(/Your Physics exam is in 4 days/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/tripped you up 3 times/),
    ).toBeInTheDocument();
  });

  it("offers exactly one primary action, to start revising", async () => {
    serve({
      exams: [
        {
          id: 1,
          user_id: "user-1",
          exam_name: "Physics Paper 1",
          exam_date: soon(),
          difficulty: null,
          status: null,
          folder_id: "f-physics",
        },
      ],
      folders: [{ id: "f-physics", user_id: "user-1", name: "Physics" }],
      misconceptions: [ledgerRow()],
    });
    const { container } = renderCard();

    await screen.findByTestId("study-this-now");

    const primaries = container.querySelectorAll('[data-rank="primary"]');
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent("Start revising — 15 min");
  });

  /* The two cases the card must not paper over. A recommendation the app
     cannot ground is worse than no recommendation. */
  it("renders nothing when there is no upcoming exam", async () => {
    serve({ exams: [], misconceptions: [ledgerRow()] });
    renderCard();

    await waitFor(() => {
      expect(screen.queryByTestId("study-this-now")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Study this now")).not.toBeInTheDocument();
  });

  it("renders nothing when the ledger holds nothing for that subject", async () => {
    serve({
      exams: [
        {
          id: 1,
          user_id: "user-1",
          exam_name: "Physics Paper 1",
          exam_date: soon(),
          difficulty: null,
          status: null,
          folder_id: "f-physics",
        },
      ],
      folders: [{ id: "f-physics", user_id: "user-1", name: "Physics" }],
      misconceptions: [ledgerRow({ subject: "Chemistry" })],
    });
    renderCard();

    await waitFor(() => {
      expect(screen.queryByTestId("study-this-now")).not.toBeInTheDocument();
    });
  });
});
