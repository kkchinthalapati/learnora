import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { saveGuide } from "../../lib/openui/guideCache";
import { NotesStudyGuide } from "./NotesStudyGuide";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;
const TEXT = "Mitosis has four phases: prophase, metaphase, anaphase and telophase.";

const panel = (text = TEXT) =>
  renderWithAuth(
    <NotesStudyGuide materialId="m1" title="Cell division" getNoteText={() => text} onClose={() => {}} />,
    { session: fakeSession() },
  );

describe("NotesStudyGuide", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
  });

  it("builds a guide on request and draws it", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({
          text: '```openui\nroot = Stack([k])\nk = Callout("key", "Four phases.")\n```',
        }),
      ),
    );
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Build guide" }));
    expect(await screen.findByText("Four phases.")).toBeTruthy();
    expect(screen.getByText(/Your note isn’t changed/)).toBeTruthy();
  });

  it("shows a stored guide for free and flags it when the note has changed", async () => {
    saveGuide("m1", "old text of the note", 'root = Stack([k])\nk = Callout("key", "Stored card.")');
    panel();
    expect(await screen.findByText("Stored card.")).toBeTruthy();
    expect(screen.getByText(/edited this note since the guide was built/i)).toBeTruthy();
  });

  it("says so, and keeps the note untouched, when no guide comes back", async () => {
    server.use(http.post(EDGE_URL, () => HttpResponse.json({ text: "Just prose." })));
    panel();
    await userEvent.click(screen.getByRole("button", { name: "Build guide" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Your note is untouched/);
  });
});
