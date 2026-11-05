import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { renderWithProviders } from "../../test/render";
import { queryClient } from "../../lib/queryClient";
import { RelatedMaterials } from "./RelatedMaterials";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function serveLibrary(notes: { material_id: string; markdown_content: string }[]) {
  server.use(
    http.get(rest("materials"), () =>
      HttpResponse.json([
        { id: "bio", title: "Cell transport", type: "pdf", raw_content: null },
        { id: "chem", title: "Solutions", type: "pdf", raw_content: null },
      ]),
    ),
    http.get(rest("notes"), () => HttpResponse.json(notes.map((n, i) => ({ id: `n${i}`, ...n })))),
  );
}

const BIO = "## Cell transport\n\n### Osmosis\n\n**Osmosis** is the diffusion of water across a **partially permeable membrane**.";
const CHEM =
  "## Solutions\n\nOsmosis moves water from a dilute solution to a concentrated one through a membrane that is partially permeable.";

describe("RelatedMaterials", () => {
  // The library is read through the app-wide cache, which outlives a test.
  beforeEach(() => queryClient.clear());

  it("links the other material that shares this page's concepts, and attaches it when asked", async () => {
    mockAuthSession("user-1");
    serveLibrary([
      { material_id: "bio", markdown_content: BIO },
      { material_id: "chem", markdown_content: CHEM },
    ]);
    const onAsk = vi.fn();
    renderWithProviders(<RelatedMaterials materialId="bio" onAsk={onAsk} />, undefined, { withRouter: true });

    const link = await screen.findByRole("link", { name: /^Solutions/ });
    expect(link).toHaveAttribute("href", "/lessons/chem");
    expect(screen.getByText(/Also covers Osmosis, partially permeable membrane/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ask the tutor how this page connects to Solutions" }));
    expect(onAsk).toHaveBeenCalledWith(
      expect.stringContaining('connect to the attached part of my notes in "Solutions"'),
      { title: "Solutions", text: expect.stringContaining("Osmosis moves water") },
    );
  });

  it("shows nothing when no other material covers the same concepts", async () => {
    mockAuthSession("user-1");
    serveLibrary([
      { material_id: "bio", markdown_content: BIO },
      { material_id: "chem", markdown_content: "## Solutions\n\nThe Tudors broke with Rome in 1534." },
    ]);
    renderWithProviders(<RelatedMaterials materialId="bio" onAsk={() => {}} />, undefined, { withRouter: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("In your other lessons")).not.toBeInTheDocument();
  });
});
