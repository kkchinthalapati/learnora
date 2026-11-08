import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import type { Folder, Material } from "../../api/types";
import { LessonView } from "./LessonView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

const biology: Folder = {
  id: "folder-1",
  user_id: "user-1",
  name: "Biology",
  color: "#4A90E2",
  created_at: "2026-03-04T00:00:00.000Z",
};

function lesson(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat-1",
    user_id: "user-1",
    folder_id: null,
    title: "Photosynthesis",
    type: "text",
    raw_content: "photosynthesis",
    storage_path: null,
    created_at: "2026-11-07T00:00:00.000Z",
    ...overrides,
  };
}

function mistake(id: string, subject: string, concept: string) {
  return {
    id,
    subject,
    concept,
    concept_key: concept.toLowerCase(),
    summary: `Mixes up ${concept}`,
    status: "active",
    severity: "medium",
    origin_tool: "learn",
    times_observed: 2,
    times_corrected: 0,
    first_seen_at: "2026-11-06T00:00:00.000Z",
    last_seen_at: "2026-11-07T00:00:00.000Z",
    resolved_at: null,
  };
}

function serve(material: Material) {
  server.use(
    http.get(rest("materials"), () => HttpResponse.json(material)),
    http.get(rest("folders"), () => HttpResponse.json([biology])),
    http.get(rest("misconceptions"), () =>
      HttpResponse.json([
        mistake("m-1", "General", "Light as food"),
        mistake("m-2", "Biology", "Osmosis direction"),
      ]),
    ),
    http.get(rest("misconception_observations"), () => HttpResponse.json([])),
  );
}

function renderLesson() {
  return renderWithAuth(
    <Routes>
      <Route path="/lessons/:materialId" element={<LessonView />} />
    </Routes>,
    { session: fakeSession() },
    { initialEntries: ["/lessons/mat-1?tab=mistakes"] },
  );
}

describe("LessonView mistakes tab", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* F-01 (audit 2026-11-07): this tab used to say "Put this lesson in a
     subject" with no way to do it, and showed nothing, though Learn records
     an unfiled lesson's misses under "General". */
  it("shows an unfiled lesson's mistakes and offers to file it", async () => {
    serve(lesson());
    renderLesson();

    expect(
      await screen.findByText("Light as food", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Osmosis direction", { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Open mistakes in lessons without a subject/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Put this lesson in a subject" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete lesson" }),
    ).toBeInTheDocument();
  });

  it("shows the subject's mistakes once the lesson is filed", async () => {
    serve(lesson({ folder_id: "folder-1" }));
    renderLesson();

    expect(
      await screen.findByText("Osmosis direction", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Light as food", { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Put this lesson in a subject" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move to another subject" }),
    ).toBeInTheDocument();
  });
});
